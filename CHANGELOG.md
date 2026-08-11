# Changelog

All notable public source changes should be documented in this file.

This project follows semantic versioning for public source releases.

## 1.1.0

- Added administrator-only AI diagnostic logs with per-attempt provider, model, timing, token, response-shape and error details, automatic 14-day retention, and raw provider responses only for failed attempts.
- Fixed OpenAI Responses parsing so llama.cpp reasoning output is ignored and only final `output_text` content is validated as metadata JSON.
- Reworked realtime notifications to use structured events and localized user-facing text while preserving compatibility with legacy Redis payloads.
- Localized document history event names, field labels, document statuses and processing job types in the web application.
- Synchronized the German and English translation catalogs.
- Unified table surfaces and card radii through shared global design tokens.
- Limited dashboard timeline cards to a readable maximum width so a single card no longer spans the entire workspace.
- Added middle-click support for opening dashboard documents through the existing document service.
- Stabilized infinite-table resize handling by deferring `ResizeObserver` refreshes with `requestAnimationFrame` and cancelling pending frames during teardown.
- Added an HTTP 409 conflict response with a clear explanation when an AI provider that is still referenced cannot be deleted.
- Made OCR and Docling Markdown writes atomic to prevent partially written output files.
- Hardened end-to-end test teardown when application setup fails.
- Expanded regression coverage and aligned affected specifications, fixtures and assertions with the updated behavior.

## 1.0.0

- Initial public source baseline.
