#!/bin/sh
LOG_GROUP_NAME="/aws/lambda/telegram-channel-backup"
LOG_STREAM_NAME=$(aws logs describe-log-streams --log-group-name "${LOG_GROUP_NAME}" | jq -r '.logStreams | sort_by(.creationTime) | .[-1].logStreamName')
aws logs get-log-events --log-group-name "${LOG_GROUP_NAME}" --log-stream-name "${LOG_STREAM_NAME}" | jq -r '.events[] | select(has("message")) | .message'
