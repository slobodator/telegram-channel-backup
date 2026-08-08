import "dotenv/config";

import { createTelegramClient } from "./telegram.js";
/*import {
    uploadBuffer,
    uploadJson
} from "./s3.js";*/

/*import {
    loadState,
    saveState
} from "./state.js";*/

const channel = process.env.TELEGRAM_CHANNEL;

function getMimeType(message) {
    if (message.photo) {
        return "image/jpeg";
    }

    if (message.video) {
        return message.video.mimeType || "video/mp4";
    }

    if (message.document) {
        return message.document.mimeType ||
            "application/octet-stream";
    }

    if (message.audio) {
        return message.audio.mimeType ||
            "audio/mpeg";
    }

    return "application/octet-stream";
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

async function backupMessage(
    client,
    message
) {
    const id = Number(message.id);

    console.log(
        `Processing message ${id}`
    );
    console.log(
        `  message : ${message.message}`
    );

    const metadata = {
        id,

        date: message.date
            ? new Date(
                message.date * 1000
            ).toISOString()
            : null,

        message: message.message || null,

        groupedId: message.groupedId
            ? message.groupedId.toString()
            : null,

        views: message.views ?? null,

        forwards: message.forwards ?? null,

        replyTo: message.replyTo
            ? {
                replyToMsgId:
                    message.replyTo.replyToMsgId ?? null
            }
            : null
    };

    /*
     * Media
     */

/*
    if (message.media) {

        try {

            console.log(
                `  downloading media...`
            );

            const buffer =
                await client.downloadMedia(
                    message,
                    {}
                );

            if (buffer) {

                const mimeType =
                    getMimeType(message);

                const extension =
                    getExtension(mimeType);

                const mediaKey =
                    `media/${id}.${extension}`;

                const savedKey =
                    await uploadBuffer(
                        mediaKey,
                        buffer,
                        mimeType
                    );

                metadata.media = {
                    key: savedKey,
                    contentType: mimeType,
                    size: buffer.length
                };

                console.log(
                    `  media uploaded: ${savedKey}`
                );
            }

        } catch (error) {

            console.error(
                `  media download failed for ${id}`,
                error
            );

            metadata.mediaError =
                error.message;
        }
    }
*/

    /*
     * Save message JSON
     */

    const messageKey =
        `messages/${id}.json`;

/*    await uploadJson(
        messageKey,
        metadata
    );*/


    console.log(
        `  message uploaded: ${messageKey}`
    );
}

async function main() {

    const client =
        await createTelegramClient();

    try {

/*        const state =
            await loadState();

        const lastMessageId =
            Number(state.lastMessageId || 0);

        console.log(
            `Last backed up message: ${lastMessageId}`
        );*/

        console.log(
            `Channel: ${channel}`
        );

        /*
         * Important:
         *
         * Telegram returns history
         * from newest to oldest.
         *
         * We use minId so we only
         * process messages newer
         * than our checkpoint.
         */

/*        let maxProcessedId =
            lastMessageId;*/

        for await (
            const message
            of client.iterMessages(
                channel,
                {
                    minId: 0, //lastMessageId,
                    reverse: true
                }
            )
        ) {

            await backupMessage(
                client,
                message
            );

            const id =
                Number(message.id);
/*
            if (id > maxProcessedId) {
                maxProcessedId = id;
            }*/

 /*           await saveState(
                maxProcessedId
            );
*/
        }

        console.log("");
        console.log(
            "Backup completed."
        );

        console.log(
            `Last message: ${maxProcessedId}`
        );

    } finally {

        await client.disconnect();
    }
}

main().catch(error => {

    console.error(
        "Backup failed:",
        error
    );

    process.exit(1);
});
