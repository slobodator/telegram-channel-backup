import "dotenv/config";

import {S3Client} from "@aws-sdk/client-s3";
import {requireNonNull} from "./util.js";

export const bucket = String(requireNonNull(process.env.S3_BUCKET, 's3 bucket'));
export const prefix = process.env.S3_PREFIX || requireNonNull(process.env.TELEGRAM_CHANNEL, 'telegram channel');

const region = String(process.env.AWS_REGION);

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

export const s3Client = new S3Client(
    {
        region: region,
        ...(endpoint
                ? {
                    endpoint,
                    forcePathStyle: true,
                    credentials: {
                        accessKeyId: accessKeyId,
                        secretAccessKey: secretAccessKey
                    }
                }
                : {}
        )
    }
);
