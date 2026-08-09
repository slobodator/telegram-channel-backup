import "dotenv/config";

import fs from "node:fs/promises";

import {TelegramClient} from "teleproto";
// noinspection JSFileReferences
import {StringSession} from "teleproto/sessions/index.js";
import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";
import {requireNonNull} from "./util.js";

const region = String(requireNonNull(process.env.AWS_REGION, 'AWS region'));
const parameterName = process.env.TELEGRAM_PARAMETER_NAME;
const SESSION_FILE = ".telegram-session";

const apiId = process.env.TELEGRAM_API_ID;
const apiHash = process.env.TELEGRAM_API_HASH;

let cachedCredentials; // module scope: survives warm Lambda invocations

async function fetchParameter(parameterName) {
    const ssmClient = new SSMClient({
        region: region
    });

    const res = await ssmClient.send(
        new GetParameterCommand({
                Name: parameterName,
                WithDecryption: true
            }
        )
    );

    const value = requireNonNull(res.Parameter?.Value, 'telegram credentials');

    if (!value) {
        throw new Error(
            `Telegram parameter ${parameterName} is empty`
        );
    }

    return JSON.parse(value);
}

async function loadCredentials() {
    if (cachedCredentials) return cachedCredentials;

    const credentials = parameterName
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
