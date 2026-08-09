import "dotenv/config";
import fs from "node:fs/promises";
import input from "input";
import {TelegramClient} from "teleproto";
import {requireNonNull} from "./util.js";
// noinspection JSFileReferences
import {StringSession} from "teleproto/sessions/index.js";

const apiId = Number(requireNonNull(process.env.TELEGRAM_API_ID, 'telegram apiId'));
const apiHash = String(requireNonNull(process.env.TELEGRAM_API_HASH, 'telegram apiHash'));

const SESSION_FILE = ".telegram-session";

async function main() {
    let session = "";

    try {
        session = await fs.readFile(SESSION_FILE, "utf8");
    } catch {
        // First login
    }

    const stringSession = new StringSession(session.trim());

    const client = new TelegramClient(
        stringSession,
        apiId,
        apiHash,
        {
            connectionRetries: 5
        }
    );

    await client.start({
        phoneNumber: async () =>
            input.text("Telegram phone number: "),

        password: async () =>
            input.text("Telegram 2FA password: "),

        phoneCode: async () =>
            input.text("Telegram login code: "),

        onError: (err) => {
            console.error(err);
        }
    });

    const savedSession = client.session.save();

    await fs.writeFile(
        SESSION_FILE,
        savedSession,
        {mode: 0o600}
    );

    console.log("");
    console.log("Telegram authentication successful.");
    console.log(`Session saved to ${SESSION_FILE}`);

    const me = await client.getMe();

    console.log(
        `Logged in as: ${me.firstName ?? ""} ${me.lastName ?? ""}`
    );

    await client.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
