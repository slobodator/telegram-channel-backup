#!/usr/bin/env bash
#
# Builds a deployable AWS Lambda zip for the Telegram channel backup.
#
# The handler is bundled with esbuild into a single self-contained ES module,
# so the archive holds no dependency tree and no project sources. It is
# assembled in a clean staging directory rather than from the working tree, so
# local secrets (.env, .telegram-session) can never end up in the artifact. A
# verification pass at the end enforces that.
#
# Usage:
#   ./package-lambda.sh                       # build only
#   ./package-lambda.sh --deploy              # build, then update $FUNCTION_NAME
#   FUNCTION_NAME=telegram-backup ./package-lambda.sh --deploy
#
# Handler: index.handler
# Runtime: nodejs26.x

set -euo pipefail

readonly PROJECT_ROOT="$(pwd)"
readonly BUILD_DIR="${PROJECT_ROOT}/build"
readonly STAGE_DIR="${BUILD_DIR}/lambda"
readonly ARTIFACT="${BUILD_DIR}/telegram-channel-backup.zip"

readonly RUNTIME="nodejs26.x"
readonly BUNDLE="index.mjs"
readonly HANDLER="index.handler"
readonly FUNCTION_NAME="${FUNCTION_NAME:-telegram-channel-backup}"

# Files that must never be packaged. The .telegram-session string is a full
# Telegram account credential; .env holds API and S3 keys.
readonly -a FORBIDDEN=(
    ".env"
    ".telegram-session"
)

DEPLOY=false

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --deploy) DEPLOY=true ;;
            -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
            *) die "unknown argument: ${arg}" ;;
        esac
    done
}

check_prerequisites() {
    for tool in node npm zip; do
        command -v "$tool" >/dev/null 2>&1 || die "${tool} is not installed"
    done

    if [[ "$DEPLOY" == true ]]; then
        command -v aws >/dev/null 2>&1 || die "aws cli is required for --deploy"
    fi

    # esbuild targets the runtime's major version (see esbuild.mjs), so the
    # bundle is portable even when the local Node differs. The mismatch still
    # means the artifact is never exercised locally on the version that runs
    # it in production.
    local node_major runtime_major
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    runtime_major="${RUNTIME//[^0-9]/}"

    if [[ "$node_major" != "$runtime_major" ]]; then
        log "warning: local Node is v${node_major}, Lambda runtime is ${RUNTIME}"
    fi
}

typecheck() {
    log "Type checking"

    # esbuild strips types without checking them, so this is the only thing
    # standing between a type error and a deployed artifact.
    npm run --silent typecheck
}

bundle_handler() {
    log "Bundling handler into ${STAGE_DIR}/${BUNDLE}"

    # A clean staging dir keeps output from deleted or renamed sources, and
    # anything left over from earlier builds, out of the zip.
    rm -rf "$STAGE_DIR"
    mkdir -p "$STAGE_DIR"

    node "${PROJECT_ROOT}/esbuild.mjs" "${STAGE_DIR}/${BUNDLE}"

    [[ -f "${STAGE_DIR}/${BUNDLE}" ]] || die "esbuild produced no ${BUNDLE}"

    # src/auth.ts is an interactive CLI (it prompts for a login code via
    # `input`) and is not reachable from the handler, so it never enters the
    # bundle in the first place.
}

create_archive() {
    log "Creating ${ARTIFACT}"

    rm -f "$ARTIFACT"

    # Lambda expects the handler at the archive root, so zip from inside the
    # staging dir. Sorted input keeps the archive byte-stable across builds of
    # the same sources; -X drops platform extra attributes.
    (
        cd "$STAGE_DIR"
        find . -type f -print \
            | LC_ALL=C sort \
            | zip -q -X -9 "$ARTIFACT" -@
    )
}

verify_archive() {
    log "Verifying archive contents"

    local contents
    contents="$(unzip -Z1 "$ARTIFACT")"

    for secret in "${FORBIDDEN[@]}"; do
        if grep -qF -- "$secret" <<<"$contents"; then
            rm -f "$ARTIFACT"
            die "refusing to ship: ${secret} was found in the archive"
        fi
    done

    grep -qx "$BUNDLE" <<<"$contents" \
        || die "handler entry point ${BUNDLE} is missing from the archive"

    # The bundle inlines every dependency, so a stray node_modules would mean
    # something other than esbuild wrote into the staging dir.
    if grep -q "^node_modules/" <<<"$contents"; then
        die "unexpected node_modules in the archive"
    fi

    # Lambda rejects direct uploads over 50 MB; larger packages must go via S3.
    local size_bytes size_human
    size_bytes="$(wc -c <"$ARTIFACT" | tr -d ' ')"
    size_human="$(du -h "$ARTIFACT" | cut -f1 | tr -d ' ')"

    log "Package: ${size_human} ($(grep -c . <<<"$contents") files)"

    if (( size_bytes > 50 * 1024 * 1024 )); then
        log "warning: over the 50 MB direct-upload limit; deploy via S3"
    fi
}

deploy() {
    log "Updating function ${FUNCTION_NAME}"

    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://${ARTIFACT}" \
        --publish \
        --output table \
        --query '{Function:FunctionName,Version:Version,Size:CodeSize,Modified:LastModified}'
}

print_next_steps() {
    cat <<EOF

Artifact: ${ARTIFACT}

Create the function (first deployment):

  aws lambda create-function \\
    --function-name ${FUNCTION_NAME} \\
    --runtime ${RUNTIME} \\
    --handler ${HANDLER} \\
    --role arn:aws:iam::<account-id>:role/<execution-role> \\
    --timeout 900 \\
    --memory-size 1024 \\
    --environment 'Variables={TELEGRAM_CHANNEL_ID=<channel-id>,TELEGRAM_PARAMETER_NAME=<ssm-parameter>,S3_BUCKET=<bucket>,S3_PREFIX=<prefix>}' \\
    --zip-file fileb://${ARTIFACT}

Update an existing function:

  ./package-lambda.sh --deploy

Notes:
  - The handler is ${HANDLER} (the bundle, not a path under src/). An existing
    function pointing elsewhere needs:
      aws lambda update-function-configuration \\
        --function-name ${FUNCTION_NAME} --handler ${HANDLER}
  - AWS_REGION is set by the Lambda runtime; do not configure it yourself.
  - Set TELEGRAM_PARAMETER_NAME so credentials load from SSM. Without it the
    code falls back to .env and an on-disk session file, neither of which is
    in this package.
  - The execution role needs ssm:GetParameter (plus kms:Decrypt for a
    SecureString) and s3:GetObject / s3:PutObject on the target prefix.
  - Config is read at module load, so a missing variable surfaces as an
    init error rather than a handler error.
  - ${BUNDLE}.map ships with the bundle; set NODE_OPTIONS=--enable-source-maps
    on the function to get original file and line numbers in stack traces.
EOF
}

main() {
    parse_args "$@"
    check_prerequisites
    typecheck
    bundle_handler
    create_archive
    verify_archive

    if [[ "$DEPLOY" == true ]]; then
        deploy
    else
        print_next_steps
    fi

    log "Done"
}

main "$@"
