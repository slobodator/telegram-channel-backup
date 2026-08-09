# Purpose

Backup the telegram channel to S3. It is an AWS Lambda written with Node.js.

# Prerequisites

- registered telegram app
- telegram account session
- telegram channel id (with `-100` prefix)

## Local dev

- [obtain](https://core.telegram.org/api/obtaining_api_id#obtaining-api-id) your telegram app `apiId` and `api_hash
- run local S3

```shell
docker run --name minio -d \
-p 9000:9000 -p 9001:9001 \
quay.io/minio/minio \
server /data \
--console-address ":9001"
```

- create some bucket there
- create `.env` file

```shell
TELEGRAM_API_ID=<put your value here>
TELEGRAM_API_HASH=<put your value here>

TELEGRAM_CHANNEL=<put your value here>

AWS_REGION=eu-central-1

S3_BUCKET=<put your value here>
S3_PREFIX=<put your value here>

S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

- run `npm run auth`

## AWS Setup

### Parameter Store

Put

```json
{
  "apiId": "<put your value here>",
  "apiHash": "<put your value here>",
  "session": "<put your value here>"
}
```

to the `telegramCredentials` parameter

### Lambda env variables

#### mandatory

- `TELEGRAM_PARAMETER_NAME` = `telegramCredentials`
- `TELEGRAM_CHANNEL` -- starting with `-100`
- `S3_BUCKET` -- bucket name
- `S3_PREFIX` -- root directory

#### optional

- `BATCH_SIZE` = 10
