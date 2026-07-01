# Smart DMS Backend

## Rolle im Projekt

Das Backend ist die NestJS-API fuer Smart DMS. Es verantwortet Authentifizierung, Benutzerverwaltung, Dokumentverwaltung, Uploads, Scanner-Ingestion, Storage-Zugriff, Queue-Jobs, Health Checks und die AI-Provider-Integration.

Die Anwendung besteht aus zwei NestJS-Laufzeiten:

- API-Prozess: startet `AppModule` ueber `src/main.ts`.
- Processor-Prozess: startet `ProcessorAppModule` ueber `src/processor.ts` und konsumiert BullMQ-Jobs.

## Voraussetzungen

- Node.js mit Corepack/PNPM.
- Docker mit laufender Docker Engine.
- PostgreSQL fuer Prisma und die DMS-Daten; im Dev-Testbetrieb nutzt `pnpm run dev:setup` einen PostgreSQL-Docker-Container auf Basis von `postgres:16-alpine`.
- Redis fuer BullMQ; im Dev-Testbetrieb als Docker-Container.
- OCRmyPDF/Tesseract fuer OCR; im Dev-Testbetrieb ueber das OCR-Runtime-Docker-Image mit `tessdata_best`.
- Docling fuer Markdown-Extraktion; im Dev-Testbetrieb ueber das Docling-Runtime-Docker-Image.
- Ein Storage-Verzeichnis fuer Originale, PDFs, Thumbnails, temporaere Uploads und Fehlerartefakte.
- Optional ein Scanner-Import-Verzeichnis fuer automatische Dateiuebernahme.

## Konfiguration

Die Konfiguration wird ueber `apps/backend/.env` geladen. Wenn die Datei fehlt, erzeugt `pnpm run dev:setup` sie aus `apps/backend/.env.example`.

Wichtige Variablen:

| Variable                                     | Bedeutung                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                               | PostgreSQL-Verbindungsstring fuer Prisma                                               |
| `DMS_POSTGRES_DOCKER_IMAGE`                  | lokales Dev-Image fuer PostgreSQL, Standard ist `postgres:16-alpine`                   |
| `PORT`                                       | API-Port, Standard ist `3010`                                                          |
| `JWT_ACCESS_SECRET`                          | Secret fuer JWT Access Tokens                                                          |
| `JWT_ACCESS_TTL_SECONDS`                     | Lebensdauer der Access Tokens                                                          |
| `REFRESH_TOKEN_TTL_DAYS`                     | Lebensdauer der Refresh Tokens                                                         |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis-Verbindung fuer BullMQ                                                           |
| `DMS_STORAGE_ROOT`                           | Root-Verzeichnis fuer DMS-Artefakte                                                    |
| `DMS_SCANNER_IMPORT_DIR`                     | Verzeichnis, das die Scanner-Ingestion ueberwacht                                      |
| `DMS_MAX_UPLOAD_SIZE_MB`                     | maximales Uploadlimit in MB                                                            |
| `DMS_OCR_CLEAN`                              | aktiviert `--clean`; bereinigt das OCR-Eingangsbild, Standard ist `true`               |
| `DMS_OCR_CLEAN_FINAL`                        | aktiviert `--clean-final`; veraendert auch das finale PDF-Bild, Standard ist `false`   |
| `DMS_OCR_OPTIMIZE`                           | OCRmyPDF-Optimierungsstufe `0` bis `3`, Standard ist `1`                               |
| `DMS_OCR_DOCKER_IMAGE`                       | OCR-Runtime-Image fuer lokalen Processor-Betrieb, Standard ist `smart-dms/ocr-runtime:latest` |
| `DMS_DOCLING_DOCKER_IMAGE`                   | Docling-Runtime-Image fuer lokalen Processor-Betrieb, Standard ist `smart-dms/docling-runtime:latest` |
| `DMS_OCR_SERVICE_URL`                        | interne OCR-Runtime-Service-URL fuer Containerbetrieb, optional                        |
| `DMS_DOCLING_SERVICE_URL`                    | interne Docling-Runtime-Service-URL fuer Containerbetrieb, optional                    |
| `DMS_OCR_IMAGE_DPI`                          | DPI fuer Bild-Originale, Standard ist `600`                                            |
| `DMS_OCR_JOBS`                               | maximale parallele OCRmyPDF-Worker pro Dokument, Standard ist `2`                      |
| `DMS_OCR_TIMEOUT_MS`                         | Timeout fuer OCR-/Thumbnail-Kommandos, Standard ist `1800000`                          |
| `DMS_OCR_TESSERACT_TIMEOUT_SECONDS`          | Timeout fuer Tesseract-OCR pro Seite, Standard ist `30`                                |
| `DMS_OCR_TESSERACT_NON_OCR_TIMEOUT_SECONDS`  | Timeout fuer Tesseract-Orientierung/Deskew pro Seite, Standard ist `10`                |
| `DMS_OCR_STORAGE_CONTAINER_ROOT`             | Storage-Mountpfad im OCR-Container, Standard ist `/data`                               |
| `DMS_DOCLING_ENABLED`                        | aktiviert Docling-Markdown-Extraktion nach OCR, Standard ist `true`                    |
| `DMS_DOCLING_TIMEOUT_MS`                     | Timeout fuer Docling-Konvertierung, Standard ist `600000`                              |
| `DMS_DOCLING_MAX_PAGES`                      | maximale Seitenzahl fuer Docling-Konvertierung, Standard ist `200`                     |
| `DMS_DOCLING_MAX_FILE_SIZE_BYTES`            | maximale PDF-Groesse fuer Docling-Konvertierung, Standard ist `104857600`              |
| `DMS_DOCLING_DEBUG_JSON`                     | speichert optional DoclingDocument-JSON als Debug-Artefakt, Standard ist `false`       |

Relative Pfade wie `./storage` werden gegen `apps/backend` aufgeloest. `DMS_STORAGE_ROOT` und `DMS_SCANNER_IMPORT_DIR` duerfen auch absolute Pfade ausserhalb des Projekts sein.
Relative Scanner-Import-Pfade in der Tenant-Verwaltung werden unterhalb von `DMS_SCANNER_IMPORT_DIR` aufgeloest. Der initiale Tenant verwendet den Key `default`, also standardmaessig `apps/backend/scanner-import/default`.

Beim ersten Start mit leerer Benutzer-Tabelle legt das Backend automatisch den Admin-Benutzer `admin` mit Passwort `admin` an.

## Lokale Entwicklung

Vom Workspace-Root aus:

```bash
pnpm run dev:setup
```

Das Skript erledigt die komplette lokale Vorbereitung:

- `apps/backend/.env` erzeugen, falls sie fehlt.
- PostgreSQL und Redis per Docker erstellen oder starten.
- OCR- und Docling-Runtime-Images bauen oder laden und pruefen.
- Storage- und Scanner-Import-Verzeichnisse aus `.env` erstellen.
- PNPM-Abhaengigkeiten installieren.
- Shared DTOs bauen.
- Prisma Client generieren.
- Prisma-Migrationen ausfuehren.

Reset-Optionen:

```bash
pnpm run dev:setup -- --delete-postgres-data
pnpm run dev:setup -- --delete-redis-data
pnpm run dev:setup -- --delete-all-data
pnpm run dev:setup -- --stop-backend-processes
```

Die PowerShell-Schreibweise `-DeletePostgresData`, `-DeleteRedisData`, `-DeleteAllData` und `-StopBackendProcesses` wird vom PNPM-Einstieg ebenfalls akzeptiert.

Unter Windows sperren laufende Backend- oder Processor-Prozesse die Prisma Query-Engine-DLL in `node_modules\.prisma\client`. Wenn `prisma generate` mit `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` scheitert, diese Prozesse stoppen oder das Dev-Skript mit `--stop-backend-processes` ausfuehren. Unter Linux laeuft `prisma generate` auch bei erkannten Backend-Prozessen weiter und gibt nur eine Warnung aus.

`-DeleteAllData` loescht nur PostgreSQL- und Redis-Daten. Storage- und Scanner-Import-Verzeichnisse werden durch das Skript nie geloescht.

API im Watch-Modus starten:

```bash
pnpm run dev:api
```

Die API laeuft standardmaessig auf `http://localhost:3010`. Der Health Check ist oeffentlich:

```bash
curl http://localhost:3010/api/health
```

Processor im Watch-Modus starten:

```bash
pnpm run dev:processor
```

Weitere nuetzliche Befehle:

```bash
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter backend test:e2e
```

## OCR und Docling per Docker

OCR und Docling sind im Backend in den Processor verdrahtet. Der Dev-Standard ist: Der lokal laufende Processor startet pro OCR-Job einen OCR- oder Docling-Runtime-Container, mountet das Storage-Verzeichnis und liest danach die erzeugten Artefakte ein. Im Docker-Compose-Betrieb ruft der Processor stattdessen die internen Runtime-Services `ocr-runtime` und `docling-runtime` per HTTP auf.

`pnpm run dev:setup` baut die Runtime-Images mit den Standard-Tags aus
`apps/backend/.env.example`. Wenn du nur die Runtime-Images manuell vorbereiten
willst:

```bash
docker build -f docker/ocr-runtime/Dockerfile -t smart-dms/ocr-runtime:latest .
docker build -f docker/docling-runtime/Dockerfile -t smart-dms/docling-runtime:latest .
docker run --rm smart-dms/ocr-runtime:latest --version
```

Manueller OCR-Test mit PDF-Ausgabe und separater Textausgabe:

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

Der Processor verwendet denselben Mechanismus: Das unveraenderte Original bleibt als `ORIGINAL`-Artefakt erhalten, das erzeugte PDF wird als finales PDF-Artefakt gespeichert, die Sidecar-Datei wird gelesen und in `Document.ocrText` persistiert. OCR-Reprocessing startet wieder vom `ORIGINAL`, nicht vom bereits erzeugten finalen PDF.
Vor dem Speichern normalisiert der Processor offensichtliche OCR-Whitespace-Artefakte im Sidecar-Text, zum Beispiel Leerzeichen vor Satzzeichen oder Datums-Punkten. Unsichere Wortkorrekturen werden nicht geraten.
Danach kann die getrennte Docling-Runtime Markdown aus dem finalen OCR-PDF erzeugen. Dieses Markdown wird separat in `Document.extractedMarkdown` gespeichert und bevorzugt fuer die AI-Metadatenextraktion genutzt; `Document.ocrText` bleibt Plaintext- und Suchquelle. Docling-Fehler blockieren die OCR-Verarbeitung nicht. Der Markdown-Export schliesst auch Docling-Furniture wie Page Header und Page Footer ein. Bei `DMS_DOCLING_DEBUG_JSON=true` speichert der Processor zusaetzlich das DoclingDocument-JSON als Debug-Artefakt.

## Backend Modules

| Modul        | Beschreibung                                                                            |
| ------------ | --------------------------------------------------------------------------------------- |
| AI           | AI-Verfuegbarkeit, Provider-Routing und Uebernahme AI-extrahierter Metadaten            |
| Audit        | Protokolliert wichtige Aktionen in `AuditEvent`                                         |
| Auth         | Login, Refresh Tokens, Logout, aktueller Benutzer und JWT-basierte Sessions             |
| Calendar     | Kalenderereignisse fuer Dokumente und AI-extrahierte Termine                            |
| Common       | Konfiguration, Guards, Rollen, Decorators, Zod-Validierung und Datumshelfer             |
| Documents    | Dokumentsuche, Details, Metadaten, Tags, Archivierung, Reprocess und Artefakt-Downloads |
| Health       | Oeffentlicher Health Check mit Datenbankpruefung                                        |
| Ingestion    | Scanner-Verzeichnisueberwachung und automatische Uebernahme stabiler Dateien            |
| Prisma       | Globaler Prisma Client und Datenbankzugriff                                             |
| Processing   | Persistente Processing-Jobs und Einreihen in BullMQ                                     |
| Processor    | Separater BullMQ-Worker fuer Dokumentverarbeitung, OCR, Docling und Thumbnails          |
| Queue        | Globale BullMQ-/Redis-Konfiguration                                                     |
| Search       | Aktuelle Suche, Filterung und Pagination liegen im Documents-Modul                      |
| Storage      | Storage-Pfade, Artefaktbereiche, Checksummen und sichere Pfadauflösung                  |
| Uploads      | Web-Upload von PDF, TIFF, JPEG und PNG in die Dokumentpipeline                          |
| Users        | Admin-Benutzerverwaltung und initialer Admin                                            |

## Architekturhinweise

- Alle nicht mit `@Public()` markierten Endpunkte sind durch globale JWT- und Rollen-Guards geschuetzt.
- API-DTOs und Zod-Schemas kommen aus `@smart-dms/shared-dto`; Prisma-Modelle werden explizit gemappt.
- Dateien werden im Dateisystem gespeichert, aber ueber kontrollierte Backend-Endpunkte ausgeliefert.
- Redis/BullMQ trennt lange Dokumentverarbeitung vom API-Prozess.
- AI-Metadatenextraktion, Provider-Routing, Full-Text Search und OCR-Verarbeitung sind im Backend verdrahtet.
