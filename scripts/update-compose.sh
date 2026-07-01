#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/compose-common.sh
source "$SCRIPT_DIR/compose-common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/update-compose.sh [--traefik] [--scanner-group]

Options:
  --traefik        Update and start the Traefik Compose variant.
  --scanner-group  Include docker-compose.scanner-group.yml.
  -h, --help       Show this help.

Examples:
  scripts/update-compose.sh
  scripts/update-compose.sh --traefik
  scripts/update-compose.sh --scanner-group
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

cd "$SMART_DMS_ROOT_DIR"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Cannot update: $SMART_DMS_ROOT_DIR is not a Git checkout." >&2
  exit 1
fi

git pull --ff-only
smart_dms_prepare_compose
docker compose "${SMART_DMS_COMPOSE_ARGS[@]}" up -d --build --remove-orphans
