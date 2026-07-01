# Smart DMS Web

Angular web application for Smart DMS.

## Development

Run commands from the repository root unless you are intentionally working only
inside `apps/web`.

```bash
pnpm run dev:setup
pnpm run dev:web
```

The development server listens on:

```text
http://localhost:4200
```

The web app expects the backend API to be available through the development
configuration. Start it separately with:

```bash
pnpm run dev:api
```

## Build

```bash
pnpm --filter web build
```

The production build is written to `apps/web/dist/web`.

## Tests

Unit tests:

```bash
pnpm --filter web test --watch=false
```

End-to-end smoke test:

```bash
pnpm --filter web test:e2e
```

The e2e wrapper skips the Playwright run when a browser is not available in the
current environment.
