import "dotenv/config";

import {
    S3Client,
    PutObjectCommand
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: process.env.AWS_REGION
});

const bucket = process.env.S3_BUCKET;
const prefix = process.env.S3_PREFIX || "telegram";

export async function uploadBuffer(
    key,
    body,
    contentType
) {
    const fullKey = `${prefix}/${key}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: fullKey,
            Body: body,
            ContentType: contentType
        })
    );

    return fullKey;
}

export async function uploadJson(
    key,
    object
) {
    const body = JSON.stringify(
        object,
        null,
        2
    );

    return uploadBuffer(
        key,
        Buffer.from(body, "utf8"),
        "application/json"
    );
}
