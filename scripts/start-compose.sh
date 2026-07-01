#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/compose-common.sh
source "$SCRIPT_DIR/compose-common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/start-compose.sh [--traefik] [--scanner-group]

Options:
  --traefik        Start the Traefik Compose variant.
  --scanner-group  Include docker-compose.scanner-group.yml.
  -h, --help       Show this help.

Examples:
  scripts/start-compose.sh
  scripts/start-compose.sh --traefik
  scripts/start-compose.sh --scanner-group
EOF
}

parse_status=0
smart_dms_parse_compose_options "$@" || parse_status=$?
if [[ "$parse_status" == "2" ]]; then
  usage
  exit 0
elif [[ "$parse_status" != "0" ]]; then
  usage >&2
  exit 1
fi

smart_dms_prepare_compose
docker compose "${SMART_DMS_COMPOSE_ARGS[@]}" up -d --build --remove-orphans
