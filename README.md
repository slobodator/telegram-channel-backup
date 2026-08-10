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

- run local DynamoDB
```shell
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local
```
- create a table there
```shell
aws dynamodb create-table \
    --table-name telegram-messages \
    --attribute-definitions \
        AttributeName=channelId,AttributeType=N \
        AttributeName=messageId,AttributeType=N \
    --key-schema \
        AttributeName=channelId,KeyType=HASH \
        AttributeName=messageId,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url http://localhost:8000
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

DYNAMO_DB_ENDPOINT=http://localhost:8000
```

- run `npm run auth`

## AWS Setup

### Parameter Store

#### `telegramCredentials`

```json
{
  "apiId": "<put your value here>",
  "apiHash": "<put your value here>",
  "session": "<put your value here>"
}
```

#### `s3Credentials`

```json
{
  "accessKeyId": "<put your value here>",
  "secretAccessKey": "<put your value here>",
  "s3Endpoint": "<put your value here>",
  "region": "<put your value here>"
}
```

### Lambda env variables

#### mandatory

- `TELEGRAM_CHANNEL` -- starting with `-100`
- `TELEGRAM_PARAMETER_NAME` = `telegramCredentials`
- `S3_PARAMETER_NAME` = `s3Credentials`
- `S3_BUCKET` -- bucket name
- `S3_PREFIX` -- root directory
- `DYNAMO_DB_TABLE_NAME` = `telegram-messages`

#### optional

- `BATCH_SIZE` = 10
