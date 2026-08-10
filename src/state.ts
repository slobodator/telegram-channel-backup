import {GetObjectCommand} from "@aws-sdk/client-s3";
import {bucket, prefix, s3Client} from "./s3-client.ts";
import {uploadJson} from "./s3.ts";
import {requireNonNull} from "./util.ts";

const STATE_KEY = `${prefix}/state.json`;

export interface BackupState {
    lastMessageId: number;
    updatedAt?: string;
}

export async function loadState(): Promise<BackupState> {
    try {
        const result = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: STATE_KEY
            })
        );
        const text = await requireNonNull(result.Body, `body of ${STATE_KEY}`).transformToString();
        return JSON.parse(text) as BackupState;
    } catch (error) {
        const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };

        if (
            awsError.name === "NoSuchKey" ||
            awsError.$metadata?.httpStatusCode === 404
        ) {
            return {
                lastMessageId: 0
            };
        }

        throw error;
    }
}

export async function saveState(messageId: number): Promise<void> {
    await uploadJson(
        "state.json",
        {
            lastMessageId: messageId,
            updatedAt: new Date().toISOString()
        }
    );
}
