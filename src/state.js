import "dotenv/config";

import {
    S3Client,
    GetObjectCommand
} from "@aws-sdk/client-s3";

import { uploadJson } from "./s3.js";

const s3 = new S3Client({
    region: process.env.AWS_REGION
});

const bucket = process.env.S3_BUCKET;
const prefix = process.env.S3_PREFIX || "telegram";

const STATE_KEY = `${prefix}/state.json`;

export async function loadState() {
    try {
        const result = await s3.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: STATE_KEY
            })
        );

        const text =
            await result.Body.transformToString();

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
