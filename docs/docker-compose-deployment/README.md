# Docker Compose Deployment

This deployment target is for users who want to run Smart DMS from the checked
out source code without a local Node, Angular or NestJS development setup.
Compose builds the Smart DMS images locally and starts the web UI, API,
processor, PostgreSQL, Redis, OCR runtime and Docling runtime.

## Installation

### 1. Clone The Repository

On the Docker host:

```bash
git clone https://github.com/bossert5/smart-dms.git
cd smart-dms
```

### 2. Create The Deployment Configuration

```bash
cp .env.example .env
nano .env
```

Review the required values in `.env`:

- `JWT_ACCESS_SECRET`
- `DMS_SECRET_ENCRYPTION_KEY`
- `SMART_DMS_POSTGRES_PASSWORD`
- `SMART_DMS_REDIS_PASSWORD`, or leave it empty intentionally

Generate long random values, for example:

```bash
openssl rand -hex 32
```

### 3. Start Smart DMS

```bash
scripts/start-compose.sh
```

The web UI is available at `http://<docker-host>:8080` by default. On the same
machine, use `http://localhost:8080`.

The initial admin user is created on first startup: username `admin`, password
`admin`. The backend forces a password change afterwards.

The helper script creates `.env` from `.env.example` if it is missing and then
stops so that the deployment values can be reviewed before containers are
started.

Prefer the helper scripts for real deployments: they validate `.env` and stop
when required values are missing or still contain placeholders. Manual
`docker compose` commands require the same `.env` review first.

If you already have the repository checked out, start from step 2.

## Source Builds

Smart DMS deployment is source-based. The Compose files include `build:`
definitions for the Smart DMS API, web, OCR runtime and Docling runtime images.
The helper scripts always build those images locally:

```bash
scripts/start-compose.sh
```

Manual equivalent:

```bash
docker compose up -d --build --remove-orphans
```

Use manual Compose commands only after creating and reviewing `.env`.

The first build can take a long time because Docker has to download base
images, Node/Python dependencies, Tesseract language data and Docling models.
Later builds reuse the Docker build cache where possible.

## Traefik

Use `docker-compose.traefik.yml` when Smart DMS should run behind an existing
Traefik reverse proxy:

```bash
scripts/start-compose.sh --traefik
```

Set the Traefik values in `.env`:

```env
SMART_DMS_TRAEFIK_HOST=dms.your-domain.example
SMART_DMS_TRAEFIK_ENTRYPOINT=websecure
SMART_DMS_TRAEFIK_CERTRESOLVER=letsencrypt
SMART_DMS_TRAEFIK_NETWORK=proxy
```

`SMART_DMS_TRAEFIK_HOST` must be changed before startup. The Traefik variant
does not publish `SMART_DMS_WEB_PORT` on the host. Traefik routes requests to
the `web` container. The helper script creates the configured external Docker
network if it does not already exist.

Manual equivalent:

```bash
docker network create proxy
docker compose -f docker-compose.traefik.yml up -d --build --remove-orphans
```

## Services

| Service | Image | Purpose |
| --- | --- | --- |
| `web` | `smart-dms-web:source-local` | Nginx with the built Angular application |
| `api` | `smart-dms-api:source-local` | NestJS API process |
| `processor` | `smart-dms-api:source-local` | NestJS processor for queue and OCR jobs |
| `ocr-runtime` | `smart-dms-ocr-runtime:source-local` | OCRmyPDF/Tesseract runtime service |
| `docling-runtime` | `smart-dms-docling-runtime:source-local` | Docling Markdown runtime service |
| `migrate` | `smart-dms-api:source-local` | One-shot Prisma migration process |
| `postgres` | `postgres:16-alpine` | PostgreSQL database |
| `redis` | `redis:7-alpine` | BullMQ and realtime infrastructure |

`api`, `processor` and `migrate` intentionally use the same locally built API
image. They share DTOs, Prisma Client, migrations and runtime dependencies but
use different start commands.

## Persistent Data

PostgreSQL, Redis data and DMS documents live outside the application
containers in persistent volumes or host paths. A normal update replaces only
containers and images.

Important:

- `docker compose down` is safe for normal updates.
- Do not use `docker compose down -v` for normal updates because it deletes
  persistent volumes.
- Keep volume names stable after the first production start.
- Back up PostgreSQL and DMS storage before updates with database migrations.

Scanner import files are read from `SMART_DMS_SCANNER_IMPORT_PATH`. Smart DMS
creates tenant-specific folders below that path, for example
`scanner-import/default` for the default tenant. Share the tenant folder over
SMB/Samba, NFS or a NAS share and configure the network scanner to write there.
Details are in [configuration.md](configuration.md#storage-and-scanner-import).

## Updates

Update a source-based deployment with:

```bash
scripts/update-compose.sh
```

For Traefik deployments:

```bash
scripts/update-compose.sh --traefik
```

The update script runs `git pull --ff-only`, validates `.env`, rebuilds local
images and starts the stack again. Database migrations run through the
`migrate` service before the API starts.

## Rollback

Roll back by checking out the previous source revision and starting the stack
again:

```bash
git checkout <previous-revision>
scripts/start-compose.sh
```

Rollback is only safe if the newer version did not apply an incompatible
database migration. Keep backups before updating.

## More Details

- Configuration: [configuration.md](configuration.md)
