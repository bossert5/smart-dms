<h1 align="center">Smart DMS</h1>

<h3 align="center">Archive documents. Surface bills, deadlines and appointments before they are missed.</h3>

<p align="center">
  <strong>Self-hosted, local-first document management for private paperwork.</strong><br>
  Smart DMS turns uploads, scans and PDF email attachments into searchable documents and an actionable timeline.
  OCR and AI-assisted extraction identify payments, due dates, deadlines and calendar events, so the dashboard always shows what needs attention next.
</p>

<p align="center">
  <a href="https://github.com/bossert5/smart-dms/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/bossert5/smart-dms/ci.yml?branch=main&style=flat-square&label=build"></a>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/bossert5/smart-dms?style=flat-square">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/bossert5/smart-dms?style=flat-square"></a>
  <img alt="Self-hosted with Docker Compose" src="https://img.shields.io/badge/self--hosted-Docker%20Compose-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="OpenAI-compatible AI providers" src="https://img.shields.io/badge/AI-OpenAI--compatible-412991?style=flat-square">
</p>

<p align="center">
  <a href="#why-smart-dms">Why Smart DMS?</a> ·
  <a href="#from-document-to-action">How it works</a> ·
  <a href="#product-tour">Product tour</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#local-development">Development</a>
</p>

<p align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="Smart DMS dashboard showing upcoming and overdue payments, deadlines and appointments" width="100%">
</p>

## Why Smart DMS?

A searchable archive answers **“Where is the document?”** Smart DMS also answers **“What do I need to do next?”**

Invoices, letters and contracts often contain the action that matters most: pay an amount, meet a deadline or remember an appointment. Smart DMS extracts that information as structured metadata and keeps open items visible in the dashboard and calendar until they are completed.

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>💶 Keep invoices on your radar</strong><br><br>
      Extract payment amounts, currencies and due dates. Open payments stay visible alongside their source documents.
    </td>
    <td width="33%" valign="top">
      <strong>⏰ See deadlines before they pass</strong><br><br>
      Surface due dates and deadlines, distinguish upcoming from overdue items and mark them done when completed.
    </td>
    <td width="33%" valign="top">
      <strong>📅 Know what is coming up</strong><br><br>
      Turn appointments and other dated events into a clear timeline and calendar instead of leaving them buried in PDFs.
    </td>
  </tr>
</table>

> [!NOTE]
> Smart DMS automatically processes documents and proposes structured metadata with OCR and AI. Important payments, dates and other extracted data should still be reviewed before you rely on them.

## From document to action

```mermaid
flowchart LR
  A[Upload, scanner or email] --> B[OCR and conversion]
  B --> C[AI-assisted extraction]
  C --> D[Human review]
  D --> E[Searchable archive]
  E --> F[Dashboard and calendar]
```

1. **Import** documents in the browser, from watched scanner folders or from PDF email attachments.
2. **Process** them into searchable PDFs, previews, OCR text and Markdown.
3. **Extract** proposed titles, summaries, parties, document types, tags, payments, deadlines and calendar events with an OpenAI-compatible AI provider.
4. **Review** and correct the suggestions, lock fields when needed and reprocess documents when the result is not sufficient.
5. **Act** on open payments, deadlines and appointments from the dashboard or calendar, then mark them completed.
6. **Find** accepted documents later with full-text search, filters, tags and document types.

## Capabilities at a glance

| Area | What Smart DMS provides |
| --- | --- |
| **Actionable dashboard** | A combined timeline for open payments, due dates, deadlines and appointments, including overdue states, assignments and completion actions. |
| **Document intake** | Browser uploads, tenant-specific scanner import directories and PDF attachment import from configured IMAP mailboxes. |
| **OCR and conversion** | Compose-managed OCR and Docling runtimes that create searchable PDFs, previews, OCR text and Markdown. |
| **AI-assisted extraction** | Proposed titles, summaries, document types, parties, tags, payment data, deadlines and calendar events. |
| **Human review workflow** | Review, correct, lock, reprocess and accept documents before final archiving. |
| **Search and retrieval** | Full-text search, filters, tags, document types, previews, downloads and reprocessing. |
| **Local-first deployment** | Self-host the web UI, API, processor, PostgreSQL, Redis, document storage, OCR and Docling services with Docker Compose. |
| **Flexible AI providers** | Use OpenAI-compatible APIs, including local endpoints such as Ollama or LM Studio, or external model providers. |
| **Users and tenants** | Multiple users, multiple tenants, tenant memberships, assignments and separated document workflows. |

## Product tour

All screenshots use synthetic demo data only.

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/document-search.png" alt="Document search with full-text results, filters and document actions" width="100%"><br>
      <strong>Find documents quickly</strong><br>
      Search OCR content, filter the archive and work with the result without navigating through folder trees.
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/inbox-review.png" alt="Inbox review queue with AI metadata status and document actions" width="100%"><br>
      <strong>Review before archiving</strong><br>
      Keep incoming documents in one review queue and accept them only after the extracted metadata is ready.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/document-detail.png" alt="Document detail view with extracted metadata and PDF preview" width="100%"><br>
      <strong>Document and metadata side by side</strong><br>
      Verify extracted information against the original PDF, correct fields and reprocess when necessary.
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/calendar.png" alt="Calendar with payment due dates, deadlines and appointments" width="100%"><br>
      <strong>Turn document dates into a schedule</strong><br>
      See payments, deadlines and appointments in a dedicated calendar instead of rediscovering them inside documents.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/ai-settings.png" alt="AI provider settings with a local OpenAI-compatible provider" width="100%"><br>
      <strong>Choose where AI runs</strong><br>
      Configure OpenAI-compatible providers, including local endpoints, and control the extraction workflow.
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/email-ingestion.png" alt="Email ingestion with mailbox messages, attachments and import status" width="100%"><br>
      <strong>Bring PDF attachments into the same inbox</strong><br>
      Import configured mailbox attachments and track their processing status without a separate manual workflow.
    </td>
  </tr>
</table>

## Quick start

Smart DMS is distributed as source code and is built locally on the Docker host. The standard deployment runs the application and its supporting services with Docker Compose.

### Requirements

- Linux with Docker Engine and the Docker Compose plugin, or Windows with Docker Desktop in WSL2/Linux-container mode.
- Git for cloning and updating the repository.
- Enough disk space for PostgreSQL, Redis, document storage and the OCR and Docling runtime images.
- A free host port for the web UI, `8080` by default, or an existing Traefik reverse proxy.

### 1. Clone the repository

```bash
git clone https://github.com/bossert5/smart-dms.git
cd smart-dms
```

### 2. Create the deployment configuration

```bash
cp .env.example .env
```

Edit `.env` and replace at least:

- `JWT_ACCESS_SECRET`
- `DMS_SECRET_ENCRYPTION_KEY`
- `SMART_DMS_POSTGRES_PASSWORD`
- `SMART_DMS_REDIS_PASSWORD`, or leave it empty intentionally

Generate long random secrets, for example:

```bash
openssl rand -hex 32
```

> [!IMPORTANT]
> The helper scripts validate `.env` and stop when required values are missing or still contain placeholders. Manual `docker compose` commands require the same configuration review first.

### 3. Start Smart DMS

```bash
scripts/start-compose.sh
```

The first build downloads and prepares the application, OCR and Docling dependencies. When the containers are ready, open:

```text
http://localhost:8080
```

From another device, replace `localhost` with the Docker host name or IP address.

Initial login for a fresh database:

```text
admin / admin
```

The backend forces a password change after the first login.

## Deployment

There are currently no published Smart DMS Docker images or binary release artifacts. Deployments and updates use the scripts and Dockerfiles in this repository, so the running application is built from the source visible in the checkout.

### Deployment modes

| Mode | Use when | Start | Update |
| --- | --- | --- | --- |
| Local port | Smart DMS should be available at `http://<host>:8080`. | `scripts/start-compose.sh` | `scripts/update-compose.sh` |
| Traefik | An existing Traefik instance should handle domain and HTTPS routing. | `scripts/start-compose.sh --traefik` | `scripts/update-compose.sh --traefik` |
| Local port with scanner group | A scanner import folder is protected by a supplemental Linux group. | `scripts/start-compose.sh --scanner-group` | `scripts/update-compose.sh --scanner-group` |
| Traefik with scanner group | Traefik routing and group-protected scanner import are both required. | `scripts/start-compose.sh --traefik --scanner-group` | `scripts/update-compose.sh --traefik --scanner-group` |

The scripts validate `.env`, build the local Smart DMS images and run the equivalent of:

```bash
docker compose up -d --build --remove-orphans
```

### Updates and useful operations

```bash
scripts/update-compose.sh

docker compose ps
docker compose logs -f --tail=100
docker compose down
```

Use the matching option when updating another deployment mode, for example:

```bash
scripts/update-compose.sh --traefik
```

> [!CAUTION]
> `docker compose down` keeps persistent volumes. Do not use `docker compose down -v` for normal updates because it deletes PostgreSQL, Redis and document storage volumes.

<details>
<summary><strong>Scanner import folders</strong></summary>

Smart DMS can import scanned files from a host directory. Set the host-side root with `SMART_DMS_SCANNER_IMPORT_PATH` in `.env`; the default is `./scanner-import` inside the repository checkout.

Smart DMS creates one import folder per tenant below that root:

- The default tenant uses `default`, so its default path is `./scanner-import/default`.
- New tenants use their tenant key unless a custom scanner import path is configured.
- When a tenant scanner import path changes, Smart DMS creates the new folder automatically.

Point the network scanner at the tenant folder, not the general import root. For example:

```env
SMART_DMS_SCANNER_IMPORT_PATH=/srv/smart-dms/scanner-import
```

The default tenant folder is then:

```text
/srv/smart-dms/scanner-import/default
```

Expose that folder through SMB/Samba or a NAS share and configure the scanner to write PDFs or images there. Smart DMS watches the mounted directory; it does not create the network share itself.

The API container must be able to read, move and delete files from the import folder. For a folder protected by a Linux group, use the `--scanner-group` deployment mode and set `SMART_DMS_SCANNER_IMPORT_GID`.

</details>

<details>
<summary><strong>Traefik deployment</strong></summary>

Complete the quick-start configuration, then set the Traefik values in `.env`:

```env
SMART_DMS_TRAEFIK_HOST=dms.your-domain.example
SMART_DMS_TRAEFIK_ENTRYPOINT=websecure
SMART_DMS_TRAEFIK_CERTRESOLVER=letsencrypt
SMART_DMS_TRAEFIK_NETWORK=proxy
```

Start and update Smart DMS behind Traefik:

```bash
scripts/start-compose.sh --traefik
scripts/update-compose.sh --traefik
```

Traefik modes do not publish the web port directly. Traffic is routed through Traefik to the `web` service. The helper script creates the configured external Docker network when it does not already exist.

Manual Compose commands and all configuration variables are documented in [`docs/docker-compose-deployment/`](docs/docker-compose-deployment/).

</details>

<details>
<summary><strong>Windows and WSL</strong></summary>

Docker Compose can run Smart DMS on Windows through Docker Desktop with Linux containers and WSL2 integration. The helper scripts are Bash scripts for Linux, WSL or Git Bash. In PowerShell, use Docker Compose directly.

```powershell
# Local port
docker compose up -d --build --remove-orphans

# Behind Traefik
docker compose -f docker-compose.traefik.yml up -d --build --remove-orphans
```

Update from PowerShell:

```powershell
git pull --ff-only
docker compose up -d --build --remove-orphans
```

For Traefik, use the same `git pull --ff-only` command followed by:

```powershell
docker compose -f docker-compose.traefik.yml up -d --build --remove-orphans
```

For source builds and scanner-import permissions, a checkout inside WSL is usually closer to the Linux server deployment path than a checkout on the Windows filesystem.

</details>

## Architecture and technology

| Layer | Technology and responsibility |
| --- | --- |
| Web application | Angular, NG-ZORRO, PDF.js and Socket.IO client for the dashboard, inbox, archive, document review and settings. |
| API and processor | NestJS, BullMQ and Socket.IO for authentication, document workflows, background processing and realtime updates. |
| Data and queues | PostgreSQL with Prisma for persistent data and Redis for queues and supporting state. |
| Document processing | OCR and Docling runtimes for searchable PDFs, previews, text and Markdown extraction. |
| AI integration | Configurable OpenAI-compatible providers for structured metadata extraction. |
| Deployment | Docker Compose for the application, database, queue, storage and document-processing services. |

## Local development

Requirements for source development:

- Node.js with Corepack and PNPM.
- Docker and Docker Compose.
- Free local ports for the default setup: API `3010`, web `4200`, PostgreSQL `5432` and Redis `6379`.

Prepare the local development environment:

```bash
pnpm run dev:setup
```

This command creates `apps/backend/.env` from its example when necessary, starts local PostgreSQL and Redis, prepares the OCR and Docling runtime images, installs dependencies, builds the shared DTO package, generates Prisma Client and runs database migrations.

Start the backend, processor and web application in separate terminals:

```bash
pnpm run dev:api
pnpm run dev:processor
pnpm run dev:web
```

Open the development web application at:

```text
http://localhost:4200
```

Useful checks:

```bash
pnpm run build
pnpm run test
pnpm --filter backend test:e2e
pnpm --filter web test:e2e
```

Pull requests should run the relevant checks and note them in the PR template. The default CI workflow builds the shared DTOs, backend and web application, generates Prisma Client and validates both Compose files.

## Configuration and documentation

| Topic | Location |
| --- | --- |
| Docker deployment | [`docs/docker-compose-deployment/`](docs/docker-compose-deployment/) |
| Compose configuration | [`.env.example`](.env.example), [`.env.full.example`](.env.full.example), [`docs/docker-compose-deployment/configuration.md`](docs/docker-compose-deployment/configuration.md) |
| Development backend configuration | [`apps/backend/.env.example`](apps/backend/.env.example) |
| Contribution guide | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Security policy | [`SECURITY.md`](SECURITY.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Project notice | [`NOTICE`](NOTICE) |
| Third-party notices | [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |

## Security and reliability

Uploaded documents, OCR output, AI responses, email content, metadata and user input are untrusted data. Do not expose Smart DMS without reviewing secrets, network access, storage paths, backups and the selected AI provider.

OCR and AI-extracted metadata can be incomplete or wrong. Users remain responsible for reviewing important data, keeping backups, testing restores and validating the system before relying on it for critical documents, payments, deadlines or appointments.

## License

Smart DMS is licensed under the **GNU Affero General Public License v3.0 only**. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

Copyright (C) 2026 Pascal Bossert.
