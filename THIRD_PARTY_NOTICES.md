# Third-Party Notices

Smart DMS copyright (C) 2026 Pascal Bossert. See `NOTICE` for the project
copyright and disclaimer notice.

This file summarizes third-party attribution for the public source repository.

Smart DMS source code is licensed under `AGPL-3.0-only`. Third-party
components, base images, models and language data remain governed by their own
licenses and notice requirements.

## Main Runtime Components

- Angular, Angular CDK and Angular CLI
- NG-ZORRO and Ant Design icons for Angular
- NestJS
- Prisma, Prisma Client and PostgreSQL adapter
- PostgreSQL
- Redis, BullMQ and ioredis
- OCRmyPDF
- Tesseract OCR and `tessdata_best` language data
- Docling and Docling models downloaded during image build
- PyTorch CPU wheels used by the Docling runtime
- pdf.js and `ng2-pdf-viewer`
- Source Sans 3 web font, licensed under the SIL Open Font License 1.1
- Socket.IO
- Zod

## Container Base Images

- `node:24-bookworm-slim`
- `nginx:1.27-alpine`
- `python:3.12-slim-bookworm`
- `jbarlow83/ocrmypdf-alpine`
- `postgres:16-alpine`
- `redis:7-alpine`
