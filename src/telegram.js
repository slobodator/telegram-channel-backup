import "dotenv/config";

import fs from "node:fs/promises";

import { TelegramClient } from "teleproto";
// noinspection JSFileReferences
import { StringSession } from "teleproto/sessions/index.js";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

const SESSION_FILE = ".telegram-session";

export async function createTelegramClient() {
    const session = await fs.readFile(
        SESSION_FILE,
        "utf8"
    );

    const stringSession = new StringSession(
        session.trim()
    );

    const client = new TelegramClient(
        stringSession,
        apiId,
        apiHash,
        {
            connectionRetries: 10
        }
    );

    await client.connect();

    const authorized = await client.checkAuthorization();

    if (!authorized) {
        throw new Error(
            "Telegram session is not authorized. Run: npm run auth"
        );
    }

    return client;
}
