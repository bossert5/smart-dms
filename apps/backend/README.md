# Smart DMS Backend

## Role in the Project

The backend is the Smart DMS NestJS API. It handles authentication, user management, document management, uploads, scanner ingestion, storage access, queue jobs, health checks, and AI provider integration.

The application has two NestJS runtimes:

- API process: starts `AppModule` through `src/main.ts`.
- Processor process: starts `ProcessorAppModule` through `src/processor.ts` and consumes BullMQ jobs.

## Requirements

- Node.js with Corepack/PNPM.
- Docker with a running Docker Engine.
- PostgreSQL for Prisma and DMS data; in local development and test environments, `pnpm run dev:setup` uses a PostgreSQL Docker container based on `postgres:16-alpine`.
- Redis for BullMQ; provided as a Docker container in local development and test environments.
- OCRmyPDF/Tesseract for OCR; provided through the OCR runtime Docker image with `tessdata_best` in local development and test environments.
- Docling for Markdown extraction; provided through the Docling runtime Docker image in local development and test environments.
- A storage directory for originals, PDFs, thumbnails, temporary uploads, and error artifacts.
- An optional scanner import directory for automatic file ingestion.

## Configuration

Configuration is loaded from `apps/backend/.env`. If the file is missing, `pnpm run dev:setup` creates it from `apps/backend/.env.example`.

Important variables:

| Variable                                     | Description                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                               | PostgreSQL connection string for Prisma                                                                      |
| `DMS_POSTGRES_DOCKER_IMAGE`                  | Local PostgreSQL development image; defaults to `postgres:16-alpine`                                         |
| `PORT`                                       | API port; defaults to `3010`                                                                                 |
| `JWT_ACCESS_SECRET`                          | Secret used to sign JWT access tokens                                                                        |
| `JWT_ACCESS_TTL_SECONDS`                     | Access token lifetime                                                                                        |
| `REFRESH_TOKEN_TTL_DAYS`                     | Refresh token lifetime                                                                                       |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection for BullMQ                                                                                  |
| `DMS_STORAGE_ROOT`                           | Root directory for DMS artifacts                                                                             |
| `DMS_SCANNER_IMPORT_DIR`                     | Directory monitored by scanner ingestion                                                                     |
| `DMS_MAX_UPLOAD_SIZE_MB`                     | Maximum upload size in MB                                                                                    |
| `DMS_OCR_CLEAN`                              | Enables `--clean` to clean the OCR input image; defaults to `true`                                           |
| `DMS_OCR_CLEAN_FINAL`                        | Enables `--clean-final`, which also changes the final PDF image; defaults to `false`                          |
| `DMS_OCR_OPTIMIZE`                           | OCRmyPDF optimization level from `0` to `3`; defaults to `1`                                                 |
| `DMS_OCR_DOCKER_IMAGE`                       | OCR runtime image for a locally running processor; defaults to `smart-dms/ocr-runtime:latest`                 |
| `DMS_DOCLING_DOCKER_IMAGE`                   | Docling runtime image for a locally running processor; defaults to `smart-dms/docling-runtime:latest`         |
| `DMS_OCR_SERVICE_URL`                        | Internal OCR runtime service URL for container deployments; optional                                        |
| `DMS_DOCLING_SERVICE_URL`                    | Internal Docling runtime service URL for container deployments; optional                                    |
| `DMS_OCR_IMAGE_DPI`                          | DPI used for image originals; defaults to `600`                                                              |
| `DMS_OCR_JOBS`                               | Maximum number of parallel OCRmyPDF workers per document; defaults to `2`                                    |
| `DMS_OCR_TIMEOUT_MS`                         | Timeout for OCR and thumbnail commands; defaults to `1800000`                                                |
| `DMS_OCR_TESSERACT_TIMEOUT_SECONDS`          | Tesseract OCR timeout per page; defaults to `30`                                                             |
| `DMS_OCR_TESSERACT_NON_OCR_TIMEOUT_SECONDS`  | Tesseract orientation and deskew timeout per page; defaults to `10`                                          |
| `DMS_OCR_STORAGE_CONTAINER_ROOT`             | Storage mount path inside the OCR container; defaults to `/data`                                             |
| `DMS_DOCLING_ENABLED`                        | Enables Docling Markdown extraction after OCR; defaults to `true`                                            |
| `DMS_DOCLING_TIMEOUT_MS`                     | Docling conversion timeout; defaults to `600000`                                                             |
| `DMS_DOCLING_MAX_PAGES`                      | Maximum page count for Docling conversion; defaults to `200`                                                 |
| `DMS_DOCLING_MAX_FILE_SIZE_BYTES`            | Maximum PDF size for Docling conversion; defaults to `104857600`                                             |
| `DMS_DOCLING_DEBUG_JSON`                     | Optionally stores DoclingDocument JSON as a debug artifact; defaults to `false`                              |

Relative paths such as `./storage` are resolved against `apps/backend`. `DMS_STORAGE_ROOT` and `DMS_SCANNER_IMPORT_DIR` may also be absolute paths outside the project.
Relative scanner import paths configured in tenant management are resolved below `DMS_SCANNER_IMPORT_DIR`. The initial tenant uses the key `default`, so its default directory is `apps/backend/scanner-import/default`.

On the first start with an empty user table, the backend automatically creates the administrator user `admin` with the password `admin`.

## Local Development

Run the following command from the workspace root:

```bash
pnpm run dev:setup
```

The script performs the complete local setup:

- Creates `apps/backend/.env` if it is missing.
- Creates or starts PostgreSQL and Redis through Docker.
- Builds or loads and verifies the OCR and Docling runtime images.
- Creates the storage and scanner import directories configured in `.env`.
- Installs PNPM dependencies.
- Builds the shared DTOs.
- Generates the Prisma client.
- Applies Prisma migrations.

Reset options:

```bash
pnpm run dev:setup -- --delete-postgres-data
pnpm run dev:setup -- --delete-redis-data
pnpm run dev:setup -- --delete-all-data
pnpm run dev:setup -- --stop-backend-processes
```

The PNPM entry point also accepts the PowerShell forms `-DeletePostgresData`, `-DeleteRedisData`, `-DeleteAllData`, and `-StopBackendProcesses`.

On Windows, running backend or processor processes lock the Prisma query engine DLL in `node_modules\.prisma\client`. If `prisma generate` fails with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`, stop those processes or run the development script with `--stop-backend-processes`. On Linux, `prisma generate` continues when backend processes are detected and only prints a warning.

`-DeleteAllData` deletes only PostgreSQL and Redis data. The script never deletes storage or scanner import directories.

Start the API in watch mode:

```bash
pnpm run dev:api
```

The API runs at `http://localhost:3010` by default. The health check is public:

```bash
curl http://localhost:3010/api/health
```

Start the processor in watch mode:

```bash
pnpm run dev:processor
```

Other useful commands:

```bash
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter backend test:e2e
```

## OCR and Docling with Docker

OCR and Docling are wired into the backend processor. By default in development, the locally running processor starts an OCR or Docling runtime container for each job, mounts the storage directory, and reads the generated artifacts. In Docker Compose deployments, the processor instead calls the internal `ocr-runtime` and `docling-runtime` services over HTTP.

`pnpm run dev:setup` builds the runtime images with the default tags from
`apps/backend/.env.example`. To prepare only the runtime images manually, run:

```bash
docker build -f docker/ocr-runtime/Dockerfile -t smart-dms/ocr-runtime:latest .
docker build -f docker/docling-runtime/Dockerfile -t smart-dms/docling-runtime:latest .
docker run --rm smart-dms/ocr-runtime:latest --version
```

Run a manual OCR test with separate PDF and text outputs:

```bash
mkdir -p apps/backend/storage/ocr-test
cp /path/to/input.pdf apps/backend/storage/ocr-test/input.pdf

docker run --rm \
  --workdir /data \
  -v "$PWD/apps/backend/storage/ocr-test:/data" \
  smart-dms/ocr-runtime:latest \
  --jobs 2 \
  --deskew \
  --rotate-pages \
  --clean \
  -l deu+eng \
  --optimize 1 \
  --tesseract-timeout 30 \
  --sidecar output.txt \
  input.pdf \
  output-searchable.pdf
```

The processor uses the same mechanism: the unchanged original remains stored as an `ORIGINAL` artifact, the generated PDF becomes the final PDF artifact, and the sidecar file is read into `Document.ocrText`. OCR reprocessing starts from the `ORIGINAL`, not from the previously generated final PDF.
Before storage, the processor normalizes obvious OCR whitespace artifacts in the sidecar text, such as spaces before punctuation or within dates. It does not guess uncertain word corrections.
The separate Docling runtime can then generate Markdown from the final OCR PDF. The Markdown is stored in `Document.extractedMarkdown` and is preferred for AI metadata extraction, while `Document.ocrText` remains the plain-text and search source. Docling failures do not block OCR processing. The Markdown export also includes Docling furniture such as page headers and footers. When `DMS_DOCLING_DEBUG_JSON=true`, the processor additionally stores DoclingDocument JSON as a debug artifact.

## Backend Modules

| Module     | Description                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| AI         | AI availability, provider routing, and application of AI-extracted metadata                   |
| Audit      | Records important actions in `AuditEvent`                                                     |
| Auth       | Login, refresh tokens, logout, current user, and JWT-based sessions                            |
| Calendar   | Calendar events for documents and AI-extracted dates                                          |
| Common     | Configuration, guards, roles, decorators, Zod validation, and date helpers                     |
| Documents  | Document search, details, metadata, tags, archiving, reprocessing, and artifact downloads      |
| Health     | Public health check with a database check                                                      |
| Ingestion  | Scanner directory monitoring and automatic ingestion of stable files                           |
| Prisma     | Global Prisma client and database access                                                       |
| Processing | Persistent processing jobs and BullMQ enqueueing                                               |
| Processor  | Separate BullMQ worker for document processing, OCR, Docling, and thumbnails                   |
| Queue      | Global BullMQ and Redis configuration                                                          |
| Search     | Search, filtering, and pagination, currently implemented in the Documents module               |
| Storage    | Storage paths, artifact areas, checksums, and safe path resolution                              |
| Uploads    | Web uploads of PDF, TIFF, JPEG, and PNG files into the document pipeline                       |
| Users      | Administrator user management and the initial administrator                                    |

## Architecture Notes

- All endpoints not marked with `@Public()` are protected by global JWT and role guards.
- API DTOs and Zod schemas come from `@smart-dms/shared-dto`; Prisma models are mapped explicitly.
- Files are stored in the file system but served through controlled backend endpoints.
- Redis and BullMQ separate long-running document processing from the API process.
- AI metadata extraction, provider routing, full-text search, and OCR processing are wired into the backend.
