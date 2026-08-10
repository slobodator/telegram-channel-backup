import "dotenv/config";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";
import {Api, TelegramClient} from "teleproto";
import {createTelegramClient} from "./telegram.ts";
import {uploadBuffer, uploadJson} from "./s3.ts";
import {loadState, saveState} from "./state.ts";
import {requireNonNull} from "./util.ts";
import prettyBytes from "pretty-bytes"
import bigInt from "big-integer";

const channelId = BigInt(requireNonNull(process.env.TELEGRAM_CHANNEL, 'telegram channelId'));
const batchSize = Number(process.env.BATCH_SIZE || 10);

const region = String(requireNonNull(process.env.AWS_REGION, 'AWS region'));
const tableName = String(requireNonNull(process.env.DYNAMO_DB_TABLE_NAME, 'DynamoDB tableName'));
const dynamoDbEndpoint = process.env.DYNAMO_DB_ENDPOINT;

const client = new DynamoDBClient(
    {
        region: region,
        ...(dynamoDbEndpoint
                ? {endpoint: dynamoDbEndpoint}
                : {}
        )
    }
);

const docClient = DynamoDBDocumentClient.from(client);

/*
 * Telegram attaches many media types that have no file behind them
 * (polls, geo, dice, games, ...). downloadMedia() throws on those, so we
 * only hand it the classes it actually knows how to fetch. */
function isDownloadable(media: Api.TypeMessageMedia | undefined): boolean {
    if (!media) {
        return false;
    }

    if (media.className === "MessageMediaWebPage") {
        const webpage = media.webpage;
        return webpage.className === "WebPage" && Boolean(webpage.document || webpage.photo);
    }

    /* Widened to a plain string: the list also names classes that are not
     * message media (WebDocument, ...), which a literal union would reject. */
    const className: string = media.className;

    return [
        "MessageMediaPhoto",
        "MessageMediaDocument",
        "MessageMediaContact",
        "WebDocument",
        "WebDocumentNoProxy"
    ].includes(className);
}


function getTypeAndMimeType(message: Api.Message): [string, string] {
    if (message.photo) {
        return ["photo", "image/jpeg"];
    }

    if (message.video) {
        return ["video", message.video.mimeType || "video/mp4"];
    }

    if (message.document) {
        return ["document", message.document.mimeType || "application/octet-stream"];
    }

    if (message.audio) {
        return ["audio", message.audio.mimeType || "audio/mpeg"];
    }

    return ["binary", "application/octet-stream"];
}


function getExtension(mimeType: string): string {
    const map: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "video/mp4": "mp4",
        "audio/mpeg": "mp3",
        "application/pdf": "pdf",
        "application/zip": "zip"
    };

    return map[mimeType] || "bin";
}

async function backupMessage(client: TelegramClient, message: Api.Message): Promise<void> {
    const id = Number(message.id);

    console.log(`Processing message ${id}`);

    const date = new Date(message.date * 1000);

    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const key = `${date.getUTCFullYear()}/${month}/${day}/${hours}-${minutes}`;

    const text = message.message || null;

    const metadata = {id, date, text};

    let savedKey: string | undefined
    if (message.media) {
        if (!isDownloadable(message.media)) {
            console.log(`  skipping non-downloadable media: ${message.media.className}`);
            return;
        }
        try {
            const size = Number(message.file?.size ?? 0)
            console.log(`  downloading media ${id} of size ${prettyBytes(size)} ...`);
            const buffer = await client.downloadMedia(message, {});
            if (buffer) {
                const [type, mimeType] = getTypeAndMimeType(message);
                const extension = getExtension(mimeType);
                const mediaKey = `${key}/${type}${id}.${extension}`;
                savedKey = await uploadBuffer(mediaKey, buffer, mimeType);
                console.log(`  media '${savedKey}' uploaded`);
            }
        } catch (error) {
            console.error(`  media download failed for ${id}`, error instanceof Error ? error.message : error);
            throw error;
        }
    }

    if (text) {
        await uploadJson(`${key}/message${id}.json`, metadata);
        console.log(`  message ${id} uploaded`);
    }

    const command = new PutCommand({
        TableName: tableName,
        Item: {
            channelId: channelId,
            messageId: id,
            groupedId: message.groupedId ? BigInt(message.groupedId.toString()) : null,
            date: date.toISOString(),
            text: text,
            media: savedKey
        },
    });

    await docClient.send(command);
    console.log(`  message ${id} was written to DB`);
}

export async function main(): Promise<void> {
    const client = await createTelegramClient();

    try {
        console.log(`Channel: ${channelId}`);
        const state = await loadState();
        const lastMessageId = Number(state.lastMessageId || 0);
        console.log(`Last backed up message: ${lastMessageId}`);

        /*
         * Important:
         * Telegram returns history from newest to oldest.
         * We use minId so we only process messages newer than our checkpoint. */

        let maxProcessedId = lastMessageId;
        let i = 0

        for await (
            const message
            of client.iterMessages(
            new Api.PeerChannel({channelId: bigInt(channelId)}),
            {
                minId: lastMessageId,
                reverse: true
            }
        ) as AsyncIterable<Api.Message>
            ) {
            if (++i > batchSize) break;

            await backupMessage(client, message);

            const id = Number(message.id);
            if (id > maxProcessedId) maxProcessedId = id;
            await saveState(maxProcessedId);
        }

        console.log("");
        console.log(`Backup completed. Last message: ${maxProcessedId}`);
    } finally {
        await client.disconnect();
    }
}

/*
 * Only self-run when invoked directly (npm run backup).
 * Under Lambda this module is imported by src/lambda.ts, which owns
 * error handling: process.exit() there would kill the container and
 * hide the failure from retries and the DLQ. */
if (import.meta.filename === process.argv[1]) {
    main().catch(
        error => {
            console.error("Backup failed:", error);
            process.exit(1);
        }
    );
}
