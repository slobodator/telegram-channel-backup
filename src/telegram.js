import "dotenv/config";

import fs from "node:fs/promises";

import {TelegramClient} from "teleproto";
// noinspection JSFileReferences
import {StringSession} from "teleproto/sessions/index.js";
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const SESSION_FILE = ".telegram-session";

let cachedCredentials; // module scope: survives warm Lambda invocations

async function fetchSecret(secretId) {
    const smClient = new SecretsManagerClient({
        region: String(process.env.AWS_REGION)
    });

    const res = await smClient.send(
        new GetSecretValueCommand({
                SecretId: secretId
            }
        )
    );

    if (!res.SecretString) {
        throw new Error(
            `Telegram secret ${secretId} is empty or binary`
        );
    }

    return JSON.parse(res.SecretString);
}

async function loadCredentials() {
    if (cachedCredentials) return cachedCredentials;

    const secretId = process.env.TELEGRAM_SECRET_ID;

    const credentials = secretId
        ? await fetchSecret(secretId)
        : {
            // Local dev only: credentials from .env and the on-disk session
            apiId: Number(process.env.TELEGRAM_API_ID),
            apiHash: process.env.TELEGRAM_API_HASH,
            session: await fs.readFile(SESSION_FILE, "utf8")
        };

    const source = secretId
        ? `secret ${secretId}`
        : ".env / " + SESSION_FILE;

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

export async function createTelegramClient() {
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
