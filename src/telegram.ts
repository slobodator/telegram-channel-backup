import "dotenv/config";

import fs from "node:fs/promises";

import {TelegramClient} from "teleproto";
import {StringSession} from "teleproto/sessions/index.js";
import {requireNonNull} from "./util.ts";
import {fetchParameter} from "./parameterStore.ts";

const parameterName = process.env.TELEGRAM_PARAMETER_NAME;
const SESSION_FILE = ".telegram-session";

const apiId = process.env.TELEGRAM_API_ID;
const apiHash = process.env.TELEGRAM_API_HASH;

interface TelegramCredentials {
    apiId: number;
    apiHash: string;
    session: string;
}

let cachedCredentials: TelegramCredentials | undefined; // module scope: survives warm Lambda invocations

async function loadCredentials(): Promise<TelegramCredentials> {
    if (cachedCredentials) return cachedCredentials;

    const credentials: Record<string, string | number | undefined> = parameterName
        ? await fetchParameter(parameterName)
        : {
            // Local dev only: credentials from .env and the on-disk session
            apiId: Number(requireNonNull(apiId, 'telegram apiId')),
            apiHash: requireNonNull(apiHash, 'telegram apiHash'),
            session: await fs.readFile(SESSION_FILE, "utf8")
        };

    const source = parameterName
        ? `parameter ${parameterName}`
        : ".env";

    for (const key of ["apiId", "apiHash", "session"]) {
        if (!credentials[key]) {
            throw new Error(
                `Telegram credential "${key}" is missing from ${source}`
            );
        }
    }

    cachedCredentials = {
        apiId: Number(credentials.apiId),
        apiHash: String(credentials.apiHash).trim(),
        session: String(credentials.session).trim()
    };

    return cachedCredentials;
}

export async function createTelegramClient(): Promise<TelegramClient> {
    const {apiId, apiHash, session} = await loadCredentials();

    const stringSession = new StringSession(session);

    const client = new TelegramClient(
        stringSession,
        apiId,
        apiHash,
        {
            connectionRetries: 5
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
