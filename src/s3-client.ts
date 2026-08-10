import "dotenv/config";

import {S3Client} from "@aws-sdk/client-s3";
import {requireNonNull} from "./util.ts";
import {fetchParameter} from "./parameterStore.ts";

export const bucket = String(requireNonNull(process.env.S3_BUCKET, 's3 bucket'));
export const prefix = process.env.S3_PREFIX || requireNonNull(process.env.TELEGRAM_CHANNEL_ID, 'telegram channel');

const parameterName = process.env.S3_PARAMETER_NAME;

interface S3Credentials {
    s3Endpoint: string | undefined;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

let cachedCredentials: S3Credentials | undefined; // module scope: survives warm Lambda invocations

async function loadCredentials(): Promise<S3Credentials> {
    if (cachedCredentials) return cachedCredentials;

    const credentials: Record<string, string | undefined> = parameterName
        ? await fetchParameter(parameterName)
        : {
            s3Endpoint: process.env.S3_ENDPOINT,
            accessKeyId: requireNonNull(process.env.S3_ACCESS_KEY_ID, 's3 accessKeyId'),
            secretAccessKey: requireNonNull(process.env.S3_SECRET_ACCESS_KEY, 's3 secretAccessKey'),
            region: requireNonNull(process.env.AWS_REGION, 'region'),
        };

    const source = parameterName
        ? `parameter ${parameterName}`
        : ".env";

    for (const key of ["accessKeyId", "secretAccessKey", "s3Endpoint", "region"]) {
        if (!credentials[key]) {
            throw new Error(
                `S3 credential "${key}" is missing from ${source}`
            );
        }
    }

    cachedCredentials = {
        s3Endpoint: credentials.s3Endpoint?.toString().trim(),
        accessKeyId: String(credentials.accessKeyId).trim(),
        secretAccessKey: String(credentials.secretAccessKey).trim(),
        region: String(credentials.region).trim()
    };

    return cachedCredentials;
}

const {accessKeyId, secretAccessKey, s3Endpoint, region} = await loadCredentials();

export const s3Client = new S3Client(
    {
        region: region,
        ...(parameterName || s3Endpoint
                ? {
                    endpoint: s3Endpoint,
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
