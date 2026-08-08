import "dotenv/config";

import {S3Client} from "@aws-sdk/client-s3";

const endpoint = String(process.env.S3_ENDPOINT);

export const s3Client = new S3Client(
    {
        region: String(process.env.AWS_REGION),
        ...(endpoint
                ? {
                    endpoint,
                    forcePathStyle: true,
                    credentials: {
                        accessKeyId: String(process.env.S3_ACCESS_KEY_ID),
                        secretAccessKey: String(process.env.S3_SECRET_ACCESS_KEY)
                    }
                }
                : {}
        )
    }
);

export const bucket = String(process.env.S3_BUCKET);
export const prefix = process.env.S3_PREFIX || "telegram";
