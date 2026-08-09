import "dotenv/config";

import {createTelegramClient} from "./telegram.js";
import {uploadBuffer, uploadJson} from "./s3.js";
import {loadState, saveState} from "./state.js";
import {requireNonNull} from "./util.js";
import prettyBytes from "pretty-bytes"

const channel = requireNonNull(process.env.TELEGRAM_CHANNEL, 'telegram channel');
const batchSize = process.env.BATCH_SIZE || 10;

/*
 * Telegram attaches many media types that have no file behind them
 * (polls, geo, dice, games, ...). downloadMedia() throws on those, so we
 * only hand it the classes it actually knows how to fetch. */
function isDownloadable(media) {
    if (!media) {
        return false;
    }

    if (media.className === "MessageMediaWebPage") {
        const webpage = media.webpage;
        return Boolean(webpage && (webpage.document || webpage.photo));
    }

    return [
        "MessageMediaPhoto",
        "MessageMediaDocument",
        "MessageMediaContact",
        "WebDocument",
        "WebDocumentNoProxy"
    ].includes(media.className);
}


function getTypeAndMimeType(message) {
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


function getExtension(mimeType) {
    const map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "video/mp4": "mp4",
        "audio/mpeg": "mp3",
        "application/pdf": "pdf",
        "application/zip": "zip"
    };

    return map[mimeType] || "bin";
}

async function backupMessage(client, message) {
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

    if (message.media) {
        if (!isDownloadable(message.media)) {
            console.log(`  skipping non-downloadable media: ${message.media.className}`);
            return;
        }
        try {
            const size = Number(message.file.size)
            console.log(`  downloading media ${id} of size ${prettyBytes(size)} ...`);
            const buffer = await client.downloadMedia(message, {});
            if (buffer) {
                const [type, mimeType] = getTypeAndMimeType(message);
                const extension = getExtension(mimeType);
                const mediaKey = `${key}/${type}${id}.${extension}`;
                const savedKey = await uploadBuffer(mediaKey, buffer, mimeType);
                console.log(`  media uploaded: ${savedKey}`);
            }
        } catch (error) {
            console.error(`  media download failed for ${id}`, error.message);
            throw error;
        }
    }

    if (text) {
        await uploadJson(`${key}/message${id}.json`, metadata);
        console.log(`  message uploaded: ${id}`);
    }
}

export async function main() {
    const client = await createTelegramClient();

    try {
        console.log(`Channel: ${channel}`);
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
            channel,
            {
                minId: lastMessageId,
                reverse: true
            }
        )
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
 * Under Lambda this module is imported by src/lambda.js, which owns
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
