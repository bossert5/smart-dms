#!/usr/bin/env bash

SMART_DMS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMART_DMS_ROOT_DIR="$(cd "$SMART_DMS_SCRIPT_DIR/.." && pwd)"
SMART_DMS_ENV_FILE="${SMART_DMS_ENV_FILE:-$SMART_DMS_ROOT_DIR/.env}"

smart_dms_read_env_value() {
  local key="$1"
  if [[ ! -f "$SMART_DMS_ENV_FILE" ]]; then
    return 0
  fi

  awk -F= -v key="$key" '
    /^[[:space:]]*#/ { next }
    {
      candidate = $1
      sub(/^[[:space:]]*export[[:space:]]+/, "", candidate)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
      if (candidate == key) {
        value = substr($0, index($0, "=") + 1)
        sub(/[[:space:]]+#.*$/, "", value)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        gsub(/^"|"$/, "", value)
        gsub(/^'\''|'\''$/, "", value)
        print value
      }
    }
  ' "$SMART_DMS_ENV_FILE" | tail -n 1
}

smart_dms_is_placeholder() {
  local value="$1"
  [[ "$value" == replace-with-* || "$value" == *replace-with-a-random* ]]
}

smart_dms_require_env_file() {
  if [[ -f "$SMART_DMS_ENV_FILE" ]]; then
    return
  fi

  cp "$SMART_DMS_ROOT_DIR/.env.example" "$SMART_DMS_ENV_FILE"
  cat >&2 <<'EOF'
Created .env from .env.example.

Edit .env before starting Smart DMS. Required values:
  - JWT_ACCESS_SECRET
  - DMS_SECRET_ENCRYPTION_KEY
  - SMART_DMS_POSTGRES_PASSWORD

Optional but recommended:
  - SMART_DMS_REDIS_PASSWORD, or leave it empty intentionally

Then run the command again.
EOF
  exit 1
}

smart_dms_add_required_env_error() {
  local -n errors_ref="$1"
  local key="$2"
  local value
  value="$(smart_dms_read_env_value "$key")"

  if [[ -z "$value" ]]; then
    errors_ref+=("$key is required and must not be empty.")
  elif smart_dms_is_placeholder "$value"; then
    errors_ref+=("$key still contains a placeholder value.")
  fi
}

smart_dms_validate_env() {
  local use_traefik="$1"
  local use_scanner_group="$2"
  local errors=()
  local redis_password
  local traefik_host
  local scanner_gid

  smart_dms_add_required_env_error errors JWT_ACCESS_SECRET
  smart_dms_add_required_env_error errors DMS_SECRET_ENCRYPTION_KEY
  smart_dms_add_required_env_error errors SMART_DMS_POSTGRES_PASSWORD

  redis_password="$(smart_dms_read_env_value SMART_DMS_REDIS_PASSWORD)"
  if [[ -n "$redis_password" ]] && smart_dms_is_placeholder "$redis_password"; then
    errors+=("SMART_DMS_REDIS_PASSWORD is optional, but the current value is still a placeholder. Set a real password or leave it empty intentionally.")
  fi

  if [[ "$use_traefik" == "true" ]]; then
    traefik_host="$(smart_dms_read_env_value SMART_DMS_TRAEFIK_HOST)"
    if [[ -z "$traefik_host" ]]; then
      errors+=("SMART_DMS_TRAEFIK_HOST is required when --traefik is used.")
    elif [[ "$traefik_host" == "dms.example.com" ]]; then
      errors+=("SMART_DMS_TRAEFIK_HOST must be changed from dms.example.com before using --traefik.")
    fi
  fi

  if [[ "$use_scanner_group" == "true" ]]; then
    scanner_gid="$(smart_dms_read_env_value SMART_DMS_SCANNER_IMPORT_GID)"
    if [[ -z "$scanner_gid" ]]; then
      errors+=("SMART_DMS_SCANNER_IMPORT_GID is required when --scanner-group is used.")
    fi
  fi

  if ((${#errors[@]} > 0)); then
    {
      echo ".env is not ready for deployment."
      echo
      echo "Fix these values in $SMART_DMS_ENV_FILE:"
      for error in "${errors[@]}"; do
        echo "  - $error"
      done
    } >&2
    exit 1
  fi
}

smart_dms_ensure_traefik_network() {
  local network
  network="$(smart_dms_read_env_value SMART_DMS_TRAEFIK_NETWORK)"
  network="${network:-proxy}"

  if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create "$network" >/dev/null
    echo "Created Traefik network: $network"
  fi
}

smart_dms_compose_args() {
  local use_traefik="$1"
  local use_scanner_group="$2"
  local compose_file="docker-compose.yml"

  if [[ "$use_traefik" == "true" ]]; then
    compose_file="docker-compose.traefik.yml"
  fi

  SMART_DMS_COMPOSE_ARGS=(--env-file "$SMART_DMS_ENV_FILE" -f "$compose_file")
  if [[ "$use_scanner_group" == "true" ]]; then
    SMART_DMS_COMPOSE_ARGS+=(-f docker-compose.scanner-group.yml)
  fi
}

smart_dms_parse_compose_options() {
  SMART_DMS_USE_TRAEFIK=false
  SMART_DMS_USE_SCANNER_GROUP=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --traefik)
        SMART_DMS_USE_TRAEFIK=true
        shift
        ;;
      --scanner-group)
        SMART_DMS_USE_SCANNER_GROUP=true
        shift
        ;;
      -h|--help)
        return 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
}

smart_dms_prepare_compose() {
  cd "$SMART_DMS_ROOT_DIR"
  smart_dms_require_env_file
  smart_dms_validate_env "$SMART_DMS_USE_TRAEFIK" "$SMART_DMS_USE_SCANNER_GROUP"
  if [[ "$SMART_DMS_USE_TRAEFIK" == "true" ]]; then
    smart_dms_ensure_traefik_network
  fi
  smart_dms_compose_args "$SMART_DMS_USE_TRAEFIK" "$SMART_DMS_USE_SCANNER_GROUP"
}
