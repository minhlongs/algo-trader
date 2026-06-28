#!/usr/bin/env bash
set -euo pipefail

################################################################################
# Cloudflare R2 Bucket Creation Script
#
# Creates required R2 buckets for algo-trader infrastructure:
#  - algo-trader-backups (database backups)
#  - algo-trader-models (ML model weights)
#  - algo-trader-logs (aggregated logs)
#
# Usage: ./scripts/create-r2-buckets.sh
#
# Environment Variables:
#  CLOUDFLARE_API_TOKEN   - Cloudflare API token with R2 write permissions
#  CLOUDFLARE_ACCOUNT_ID  - Cloudflare account ID
#
# Optional:
#  R2_BUCKET_PREFIX        - Bucket name prefix (default: algo-trader)
#  VERBOSE                 - Set to 1 for debug output
#
# References:
#  - https://developers.cloudflare.com/r2/api/
################################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
readonly REQUIRED_ENV_VARS=("CLOUDFLARE_API_TOKEN" "CLOUDFLARE_ACCOUNT_ID")
readonly DEFAULT_PREFIX="algo-trader"
readonly BUCKETS=("backups" "models" "logs")

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_debug() {
    if [[ "${VERBOSE:-0}" == "1" ]]; then
        echo -e "[DEBUG] $*"
    fi
}

# Print script banner
print_banner() {
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║           Cloudflare R2 Bucket Creation Tool                ║
║                   for algo-trader                           ║
╚═══════════════════════════════════════════════════════════════╝
EOF
}

# Validate environment variables
validate_env() {
    local missing=()

    log_info "Validating environment variables..."

    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing+=("$var")
        fi
    done

    if (( ${#missing[@]} > 0 )); then
        log_error "Missing required environment variables:"
        for var in "${missing[@]}"; do
            log_error "  - $var"
        done
        log_info ""
        log_info "To set them:"
        log_info "  export CLOUDFLARE_API_TOKEN=your_token"
        log_info "  export CLOUDFLARE_ACCOUNT_ID=your_account_id"
        log_info ""
        log_info "Get API token from: https://dash.cloudflare.com/profile/api-tokens"
        log_info "Find Account ID from: https://dash.cloudflare.com/account"
        return 1
    fi

    log_success "Environment validation passed"
    return 0
}

# Make authenticated API call to Cloudflare
cf_api_call() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"

    local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/${endpoint}"

    log_debug "API call: ${method} ${url}"

    local args=(
        -X "$method"
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
        -H "Content-Type: application/json"
    )

    if [[ -n "$data" ]]; then
        args+=(-d "$data")
    fi

    local response
    response=$(curl -s -w "\n%{http_code}" "${args[@]}" "$url") || {
        log_error "API call failed: curl error"
        return 1
    }

    local body
    body=$(echo "$response" | sed '$d')
    local code
    code=$(echo "$response" | tail -n1)

    log_debug "Response code: $code"
    log_debug "Response body: $body"

    # Check for errors in response body
    if echo "$body" | grep -q '"success":false'; then
        local error_msg
        error_msg=$(echo "$body" | grep -o '"errors":\[{.*"message":"[^"]*"' | sed 's/.*"message":"\([^"]*\)".*/\1/')
        log_error "API error: ${error_msg:-Unknown error}"
        return 1
    fi

    if [[ "$code" != "200" && "$code" != "201" ]]; then
        log_error "Unexpected HTTP status: $code"
        return 1
    fi

    echo "$body"
    return 0
}

# Check if bucket exists
bucket_exists() {
    local bucket_name="$1"
    local endpoint="r2/buckets/${bucket_name}"

    log_info "Checking if bucket '${bucket_name}' exists..."

    if cf_api_call "GET" "$endpoint" 2>/dev/null; then
        return 0  # Bucket exists
    else
        return 1  # Bucket doesn't exist or error
    fi
}

# Create R2 bucket
create_bucket() {
    local bucket_name="$1"
    local data
    data=$(jq -n --arg name "$bucket_name" '{name: $name}')

    log_info "Creating bucket '${bucket_name}'..."

    if cf_api_call "POST" "r2/buckets" "$data" >/dev/null 2>&1; then
        log_success "Bucket '${bucket_name}' created successfully"
        return 0
    else
        log_error "Failed to create bucket '${bucket_name}'"
        return 1
    fi
}

# Main execution
main() {
    print_banner

    # Change to script directory
    cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null || true
    SCRIPT_DIR="$(pwd)"
    REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

    log_info "Script directory: $SCRIPT_DIR"
    log_info "Repository root: $REPO_ROOT"

    # Validate environment
    if ! validate_env; then
        exit 1
    fi

    # Determine prefix
    local prefix="${R2_BUCKET_PREFIX:-$DEFAULT_PREFIX}"
    log_info "Using bucket prefix: $prefix"

    # Track results
    local created=0
    local existing=0
    local failed=0

    # Process each bucket
    for suffix in "${BUCKETS[@]}"; do
        local bucket_name="${prefix}-${suffix}"

        log_info ""
        log_info "Processing bucket: $bucket_name"

        if bucket_exists "$bucket_name"; then
            log_warn "Bucket '${bucket_name}' already exists, skipping"
            ((existing++))
        else
            if create_bucket "$bucket_name"; then
                ((created++))
            else
                ((failed++))
            fi
        fi
    done

    # Summary
    log_info ""
    echo "═══════════════════════════════════════════════════════════════"
    log_info "Summary:"
    log_info "  Created: $created"
    log_info "  Already existed: $existing"
    log_info "  Failed: $failed"
    echo "═══════════════════════════════════════════════════════════════"

    if ((failed > 0)); then
        log_error "Some buckets failed to create"
        exit 1
    else
        log_success "All required buckets are now available"
        log_info ""
        log_info "Next steps:"
        log_info "  1. Copy .env.example to .env"
        log_info "  2. Fill in R2 credentials in .env:"
        log_info "     - R2_ACCESS_KEY_ID"
        log_info "     - R2_SECRET_ACCESS_KEY"
        log_info "     - R2_ENDPOINT (from Cloudflare dashboard)"
        log_info "  3. Run ./scripts/backup-db.sh to test backups"
        exit 0
    fi
}

# Run main function
main "$@"
