#!/usr/bin/env bash
#
# Builds a deployable AWS Lambda zip for the Telegram channel backup.
#
# The package is assembled in a clean staging directory rather than from the
# working tree, so local secrets (.env, .telegram-session) can never end up in
# the artefact. A verification pass at the end enforces that.
#
# Usage:
#   ./scripts/package-lambda.sh                       # build only
#   ./scripts/package-lambda.sh --deploy              # build, then update $FUNCTION_NAME
#   FUNCTION_NAME=telegram-backup ./scripts/package-lambda.sh --deploy
#
# Handler: src/lambda.handler
# Runtime: nodejs26.x

set -euo pipefail

readonly PROJECT_ROOT="$(pwd)"
readonly BUILD_DIR="${PROJECT_ROOT}/build"
readonly STAGE_DIR="${BUILD_DIR}/lambda"
readonly ARTIFACT="${BUILD_DIR}/telegram-channel-backup.zip"

readonly RUNTIME="nodejs26.x"
readonly HANDLER="src/lambda.handler"
readonly FUNCTION_NAME="${FUNCTION_NAME:-telegram-channel-backup}"

# Everything the runtime needs, and nothing else. Anything not listed here
# stays out of the zip.
readonly -a SOURCES=(
    "src"
    "package.json"
    "package-lock.json"
)

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

    # The zip must be built against the runtime's major version. There are no
    # native modules in the tree today, so this is about language features and
    # npm's lockfile handling rather than ABI compatibility.
    local node_major runtime_major
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    runtime_major="${RUNTIME//[^0-9]/}"

    if [[ "$node_major" != "$runtime_major" ]]; then
        log "warning: local Node is v${node_major}, Lambda runtime is ${RUNTIME}"
    fi
}

stage_sources() {
    log "Staging sources in ${STAGE_DIR}"

    rm -rf "$STAGE_DIR"
    mkdir -p "$STAGE_DIR"

    for path in "${SOURCES[@]}"; do
        [[ -e "${PROJECT_ROOT}/${path}" ]] || die "missing required path: ${path}"
        cp -R "${PROJECT_ROOT}/${path}" "${STAGE_DIR}/"
    done

    # auth.js is an interactive CLI (it prompts for a login code via `input`)
    # and has no place in the deployment package.
    rm -f "${STAGE_DIR}/src/auth.js"
}

install_dependencies() {
    log "Installing production dependencies"

    # `npm ci` in the staging dir gives a tree built strictly from the
    # lockfile, with no dev dependencies and no leftovers from local work.
    (
        cd "$STAGE_DIR"
        npm ci --omit=dev --no-audit --no-fund
    )

    # package-lock.json is only needed for the install itself.
    rm -f "${STAGE_DIR}/package-lock.json"
}

create_archive() {
    log "Creating ${ARTIFACT}"

    rm -f "$ARTIFACT"

    # Lambda expects the handler at the archive root, so zip from inside the
    # staging dir. Sorted input keeps the archive byte-stable across builds
    # for the same dependency tree; -X drops platform extra attributes.
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

    grep -qx "src/lambda.js" <<<"$contents" \
        || die "handler entry point src/lambda.js is missing from the archive"

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

Artefact: ${ARTIFACT}

Create the function (first deployment):

  aws lambda create-function \\
    --function-name ${FUNCTION_NAME} \\
    --runtime ${RUNTIME} \\
    --handler ${HANDLER} \\
    --role arn:aws:iam::<account-id>:role/<execution-role> \\
    --timeout 900 \\
    --memory-size 1024 \\
    --environment 'Variables={TELEGRAM_CHANNEL=<channel>,TELEGRAM_PARAMETER_NAME=<ssm-parameter>,S3_BUCKET=<bucket>,S3_PREFIX=<prefix>}' \\
    --zip-file fileb://${ARTIFACT}

Update an existing function:

  ./scripts/package-lambda.sh --deploy

Notes:
  - AWS_REGION is set by the Lambda runtime; do not configure it yourself.
  - Set TELEGRAM_PARAMETER_NAME so credentials load from SSM. Without it the
    code falls back to .env and an on-disk session file, neither of which is
    in this package.
  - The execution role needs ssm:GetParameter (plus kms:Decrypt for a
    SecureString) and s3:GetObject / s3:PutObject on the target prefix.
  - Config is read at module load, so a missing variable surfaces as an
    init error rather than a handler error.
EOF
}

main() {
    parse_args "$@"
    check_prerequisites
    stage_sources
    install_dependencies
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
