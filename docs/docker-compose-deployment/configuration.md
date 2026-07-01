# Docker Compose Configuration

Compose reads user configuration from `.env` next to `docker-compose.yml`.
`.env.example` contains the most important production values, while
`.env.full.example` lists optional tuning variables.

## Local Images

Docker Compose builds these local images from the checked-out source:

```text
smart-dms-api:source-local
smart-dms-web:source-local
smart-dms-ocr-runtime:source-local
smart-dms-docling-runtime:source-local
```

Start a local source build:

```bash
scripts/start-compose.sh
```

Manual equivalent:

```bash
docker compose up -d --build --remove-orphans
```

The helper scripts validate `.env`, build the Smart DMS images locally and start
the stack. Manual `docker compose` commands require the same `.env` review
first. Compose fails when required values are missing, while the helper scripts
also catch unchanged placeholder values.

## Ports

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMART_DMS_WEB_PORT` | `8080` | Browser port for the web UI |
| `SMART_DMS_API_PORT` | `3010` | Local API port, bound to `127.0.0.1` |

The web UI talks to the API through the Nginx reverse proxy in the `web`
container. The API port is also published on `127.0.0.1` for local tools.

## Traefik

`docker-compose.traefik.yml` runs the same stack behind an existing Traefik
reverse proxy.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMART_DMS_TRAEFIK_HOST` | `dms.example.com` | Hostname for the Traefik route |
| `SMART_DMS_TRAEFIK_ENTRYPOINT` | `websecure` | Traefik entrypoint |
| `SMART_DMS_TRAEFIK_CERTRESOLVER` | `letsencrypt` | Traefik TLS cert resolver |
| `SMART_DMS_TRAEFIK_NETWORK` | `proxy` | External Docker network used by Traefik |

The helper script validates `SMART_DMS_TRAEFIK_HOST`, checks the configured
external network and creates it when it is missing:

```bash
scripts/start-compose.sh --traefik
```

Manual equivalent:

```bash
docker network create proxy
docker compose -f docker-compose.traefik.yml up -d --build --remove-orphans
```

## Database and Redis

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMART_DMS_POSTGRES_USER` | `smart_dms` | PostgreSQL user |
| `SMART_DMS_POSTGRES_PASSWORD` | required | PostgreSQL password |
| `SMART_DMS_POSTGRES_DB` | `smart_dms` | PostgreSQL database |
| `SMART_DMS_REDIS_PASSWORD` | empty | Optional Redis password |

Internal service names are:

```text
postgres:5432
redis:6379
```

## Backend Secrets

| Variable | Default | Meaning |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | required | Access token signing secret |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime |
| `DMS_SECRET_ENCRYPTION_KEY` | required | Encryption key for stored provider/mail secrets |

Production deployments must replace placeholder secrets with long random
values, for example:

```bash
openssl rand -hex 32
```

## Storage and Scanner Import

| Variable | Default | Meaning |
| --- | --- | --- |
| `SMART_DMS_SCANNER_IMPORT_PATH` | `./scanner-import` | Host path for scanner import |
| `SMART_DMS_SCANNER_IMPORT_GID` | empty | Supplemental Linux group ID for scanner import host access |
| `DMS_MAX_UPLOAD_SIZE_MB` | `100` | Maximum upload size in MB |

Container paths:

```text
/data/storage
/data/scanner-import
```

Document storage always uses the `smart-dms-storage` Compose volume. Use
`SMART_DMS_STORAGE_VOLUME_NAME` only when you need to pin the underlying Docker
volume name explicitly.

Smart DMS watches the scanner import root from
`SMART_DMS_SCANNER_IMPORT_PATH`. The Compose files mount that host path into the
containers as `/data/scanner-import`.

Each tenant has its own scanner import path below that root:

- The default tenant uses `default`.
- New tenants use the tenant key by default.
- A tenant can be configured with a custom scanner import path.
- Smart DMS creates the configured tenant folder automatically when the default
  tenant is initialized, when a tenant is created, or when a tenant scanner path
  is changed.

Example:

```env
SMART_DMS_SCANNER_IMPORT_PATH=/srv/smart-dms/scanner-import
```

With the default tenant, Smart DMS watches:

```text
/srv/smart-dms/scanner-import/default
```

Configure the network scanner to write into the tenant folder. Usually that
means exporting the tenant folder, or the scanner import root, via SMB/Samba,
NFS or a NAS share and setting the scanner target to that network share. Smart
DMS does not configure the network share; it only watches the mounted host
directory and imports stable PDF, TIFF, JPEG and PNG files.

`SMART_DMS_SCANNER_IMPORT_GID` is relevant when
`SMART_DMS_SCANNER_IMPORT_PATH` points to a Linux host directory whose access is
controlled by group permissions. The API container runs as the unprivileged
`node` user. Docker bind mounts preserve the host directory ownership and mode
bits, so the container can read, move and delete scanner files only when the
mounted directory allows access for that user or one of its groups.

There is intentionally no default value for `SMART_DMS_SCANNER_IMPORT_GID`
because numeric Linux group IDs are host-specific. Set it to the host group ID
that owns the scanner import directory or the files written there by a scanner,
NAS, Samba share or other import service. For example:

```bash
stat -c '%g %n' /srv/smart-dms/scanner-import
getent group scanner
```

The base Compose files do not add a supplemental group. To enable it, start the
stack with the scanner-group override:

```bash
scripts/start-compose.sh --scanner-group
```

For the Traefik variant:

```bash
scripts/start-compose.sh --traefik --scanner-group
```

Use the same `--scanner-group` option for later start and update commands on
that deployment. Without the helper script, use the same
`-f ...scanner-group.yml` file list for manual Compose commands, including
`down`.

The override passes `SMART_DMS_SCANNER_IMPORT_GID` to the API service via
`group_add`. This gives the API process an additional numeric Linux group inside
the container.

The value does not change host ownership and does not make the container run as
root. The host directory still needs suitable group permissions, for example
group read/write/search access. If the scanner import path is group-owned, a
setgid directory can also help new files keep the same group:

```bash
chgrp scanner /srv/smart-dms/scanner-import
chmod 2770 /srv/smart-dms/scanner-import
```

If the value does not match the host group that may access the scanner import
path, browser uploads can still work while automatic scanner import fails with
filesystem permission errors.

## Persistent Volumes

| Variable | Default | Content |
| --- | --- | --- |
| `SMART_DMS_POSTGRES_VOLUME_NAME` | `smart-dms_smart-dms-postgres-data` | PostgreSQL data |
| `SMART_DMS_REDIS_VOLUME_NAME` | `smart-dms_smart-dms-redis-data` | Redis append-only data |
| `SMART_DMS_STORAGE_VOLUME_NAME` | `smart-dms_smart-dms-storage` | Documents, PDFs, thumbnails and temporary files |

Keep these names stable after the first production start. Backups should cover
PostgreSQL and DMS storage at minimum.

## OCR and Docling

| Variable | Default | Meaning |
| --- | --- | --- |
| `DMS_OCR_SERVICE_URL` | `http://ocr-runtime:8080` | Internal OCR runtime service |
| `DMS_DOCLING_SERVICE_URL` | `http://docling-runtime:8080` | Internal Docling runtime service |
| `DMS_DOCLING_ENABLED` | `true` | Enables Docling Markdown extraction |
| `DMS_OCR_IMAGE_DPI` | `600` | DPI for image originals |
| `DMS_OCR_JOBS` | `2` | Parallel OCRmyPDF jobs per document |
| `DMS_OCR_TIMEOUT_MS` | `1800000` | OCR command timeout |
| `DMS_DOCLING_TIMEOUT_MS` | `600000` | Docling conversion timeout |
| `DMS_THUMBNAIL_DPI` | `144` | Thumbnail DPI |
| `DMS_THUMBNAIL_JPEG_QUALITY` | `85` | Thumbnail JPEG quality |

OCR and Docling services share the DMS storage volume with the processor. The
processor does not need access to the Docker socket in Compose deployments.
