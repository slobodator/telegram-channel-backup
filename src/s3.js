import {PutObjectCommand} from "@aws-sdk/client-s3";

import {bucket, prefix, s3Client} from "./s3-client.js";

export async function uploadBuffer(
    key,
    body,
    contentType
) {
    const fullKey = `${prefix}/${key}`;

    await s3Client.send(
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
