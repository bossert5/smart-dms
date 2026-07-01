# Contributing

Thanks for your interest in Smart DMS. Contributions are easiest to review when
they are focused, reproducible and explicit about the checks that were run.

## Before You Start

Use the repository root for workspace commands. Prepare the local development
environment once after cloning, and again after changes to dependencies, Prisma
migrations, shared DTOs or runtime Dockerfiles:

```bash
pnpm run dev:setup
```

This bootstraps the development setup: it prepares the backend environment file
when missing, starts local PostgreSQL and Redis containers, installs PNPM
dependencies, builds shared DTOs, generates the Prisma Client, runs migrations
and prepares the OCR/Docling runtime images used by the document pipeline.

For normal development, run the services you need in separate terminals:

```bash
pnpm run dev:api
pnpm run dev:processor
pnpm run dev:web
```

- `dev:api` starts the NestJS API in watch mode.
- `dev:processor` starts the background document processor in watch mode.
- `dev:web` starts the Angular development server.

## Choose The Right Checks

Run checks for the area you changed. Do not list commands in a pull request
unless you actually ran them.

| Change type | Recommended checks |
| --- | --- |
| Shared DTOs or Zod schemas | `pnpm --filter @smart-dms/shared-dto test` and the affected backend/web tests |
| Backend API, processor, auth, storage, OCR or AI behavior | `pnpm --filter backend test` |
| Backend database schema changes | `pnpm --filter backend prisma:generate`, `pnpm --filter backend prisma:migrate` and affected backend tests |
| Web UI, routing, services or presentation logic | `pnpm --filter web test --watch=false` |
| Build, dependency or cross-package changes | `pnpm run build` |
| End-to-end behavior | `pnpm --filter backend test:e2e` and/or `pnpm --filter web test:e2e` |
| Backend lint/style changes | `pnpm run lint` |

`pnpm run build` builds the shared DTO package, backend and web application. It
is the broadest compile check, but it does not replace behavior tests for code
that changed.

## Pull Request Expectations

- Keep one pull request focused on one topic.
- Describe the user-visible behavior change, bug fix or maintenance reason.
- Update tests when behavior changes.
- Update documentation when setup, deployment, configuration or user workflows
  change.
- Keep shared DTOs, backend validation and web consumers in sync when API
  contracts change.
- Consider loading, error, empty and accessibility states for UI changes.
- Mention any check you could not run and why.

## Data And Secrets

Do not commit real documents, OCR output, email content, AI responses,
credentials, API keys, JWTs, cookies, passwords, private infrastructure details,
local `.env` files, runtime storage, caches or build output.

Use synthetic names, addresses, dates, invoices and document text in tests,
fixtures, screenshots and docs. Treat uploaded files, OCR output, AI responses,
email content, metadata and user input as untrusted input.

## License

By contributing, you agree that your contribution is licensed under
`AGPL-3.0-only`.
