import {GetObjectCommand} from "@aws-sdk/client-s3";
import {bucket, prefix, s3Client} from "./s3-client.js";
import {uploadJson} from "./s3.js";

const STATE_KEY = `${prefix}/state.json`;

export async function loadState() {
    try {
        const result = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: STATE_KEY
            })
        );
        const text = await result.Body.transformToString();
        return JSON.parse(text);
    } catch (error) {
        if (
            error.name === "NoSuchKey" ||
            error.$metadata?.httpStatusCode === 404
        ) {
            return {
                lastMessageId: 0
            };
        }

        throw error;
    }
}

export async function saveState(messageId) {
    await uploadJson(
        "state.json",
        {
            lastMessageId: messageId,
            updatedAt: new Date().toISOString()
        }
    );
}
