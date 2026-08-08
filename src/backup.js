import "dotenv/config";

import {createTelegramClient} from "./telegram.js";
import {uploadBuffer, uploadJson, uploadText} from "./s3.js";
import {loadState, saveState} from "./state.js";

const channel = process.env.TELEGRAM_CHANNEL;

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
        try {
            console.log(`  downloading media ${id}...`);
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
        }
    }

    if (text) {
        await uploadText(`${key}/text${id}.txt`, text);
        await uploadJson(`${key}/metadata${id}.json`, metadata);
        console.log(`  message uploaded: ${id}`);
    }
}

async function main() {
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
        let MAX_PROCESSED = 10;

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
            if (i++ > MAX_PROCESSED) break;

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

main().catch(
    error => {
        console.error("Backup failed:", error);
        process.exit(1);
    }
);
