import {main} from "./backup.js";

/*
 * Lambda entry point. Intended to be driven by an EventBridge schedule,
 * so the event payload is ignored.
 *
 * Errors are rethrown rather than swallowed: Lambda then marks the
 * invocation failed, which is what drives retries, the DLQ and the
 * Errors metric. */
export async function handler(event, context) {
    console.log(`Backup started (request ${context?.awsRequestId})`);

    try {
        await main();
        return {ok: true};
    } catch (error) {
        console.error("Backup failed:", error);
        throw error;
    }
}
