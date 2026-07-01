import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename, resolve } from 'node:path';

export function resolveBackendRoot(currentDir = __dirname): string {
  const candidateRoot = resolve(currentDir, '..', '..');
  return basename(candidateRoot) === 'dist'
    ? resolve(candidateRoot, '..')
    : candidateRoot;
}

@Injectable()
export class AppConfigService {
  private readonly backendRoot = resolveBackendRoot();

  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return Number(this.config.get('PORT') ?? 3010);
  }

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  }

  get jwtAccessTtlSeconds(): number {
    return Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
  }

  get refreshTokenTtlDays(): number {
    return Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
  }

  get secretEncryptionKey(): string {
    const key = this.config.get<string>('DMS_SECRET_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('DMS_SECRET_ENCRYPTION_KEY must be configured.');
    }

    return key;
  }

  get redisHost(): string {
    return this.config.get('REDIS_HOST') ?? 'localhost';
  }

  get redisPort(): number {
    return Number(this.config.get('REDIS_PORT') ?? 6379);
  }

  get redisPassword(): string | undefined {
    return this.config.get('REDIS_PASSWORD') || undefined;
  }

  get storageRoot(): string {
    return this.resolveBackendPath(
      this.config.get('DMS_STORAGE_ROOT') ?? './storage',
    );
  }

  get tempUploadDir(): string {
    return resolve(this.storageRoot, 'tmp', 'uploads');
  }

  get scannerImportDir(): string {
    return this.resolveBackendPath(
      this.config.get('DMS_SCANNER_IMPORT_DIR') ?? './scanner-import',
    );
  }

  resolveScannerImportPath(scannerImportPath: string): string {
    return resolve(this.scannerImportDir, scannerImportPath);
  }

  get maxUploadSizeBytes(): number {
    const megabytes = Number(this.config.get('DMS_MAX_UPLOAD_SIZE_MB') ?? 100);
    return megabytes * 1024 * 1024;
  }

  get ocrDockerImage(): string {
    return (
      this.config.get('DMS_OCR_DOCKER_IMAGE') ?? 'smart-dms/ocr-runtime:latest'
    );
  }

  get doclingDockerImage(): string {
    return (
      this.config.get('DMS_DOCLING_DOCKER_IMAGE') ??
      'smart-dms/docling-runtime:latest'
    );
  }

  get ocrServiceUrl(): string | null {
    return this.optionalUrl('DMS_OCR_SERVICE_URL');
  }

  get doclingServiceUrl(): string | null {
    return this.optionalUrl('DMS_DOCLING_SERVICE_URL');
  }

  get ocrImageDpi(): number {
    return Number(this.config.get('DMS_OCR_IMAGE_DPI') ?? 600);
  }

  get ocrClean(): boolean {
    return this.boolean('DMS_OCR_CLEAN', true);
  }

  get ocrCleanFinal(): boolean {
    return this.boolean('DMS_OCR_CLEAN_FINAL', false);
  }

  get ocrOptimizeLevel(): number {
    return this.integerInRange('DMS_OCR_OPTIMIZE', 1, 0, 3);
  }

  get ocrJobs(): number {
    return this.positiveInteger('DMS_OCR_JOBS', 2);
  }

  get ocrTimeoutMs(): number {
    return this.positiveInteger('DMS_OCR_TIMEOUT_MS', 30 * 60 * 1000);
  }

  get ocrTesseractTimeoutSeconds(): number {
    return this.positiveInteger('DMS_OCR_TESSERACT_TIMEOUT_SECONDS', 30);
  }

  get ocrTesseractNonOcrTimeoutSeconds(): number {
    return this.positiveInteger(
      'DMS_OCR_TESSERACT_NON_OCR_TIMEOUT_SECONDS',
      10,
    );
  }

  get ocrStorageContainerRoot(): string {
    return this.config.get('DMS_OCR_STORAGE_CONTAINER_ROOT') ?? '/data';
  }

  get doclingEnabled(): boolean {
    return this.boolean('DMS_DOCLING_ENABLED', true);
  }

  get doclingTimeoutMs(): number {
    return this.positiveInteger('DMS_DOCLING_TIMEOUT_MS', 10 * 60 * 1000);
  }

  get doclingMaxPages(): number {
    return this.positiveInteger('DMS_DOCLING_MAX_PAGES', 200);
  }

  get doclingMaxFileSizeBytes(): number {
    return this.positiveInteger(
      'DMS_DOCLING_MAX_FILE_SIZE_BYTES',
      100 * 1024 * 1024,
    );
  }

  get doclingDebugJsonEnabled(): boolean {
    return this.boolean('DMS_DOCLING_DEBUG_JSON', false);
  }

  get ocrHelperScriptPath(): string {
    return this.resolveBackendPath('./scripts/ocr-helper.py');
  }

  get thumbnailDpi(): number {
    return Number(this.config.get('DMS_THUMBNAIL_DPI') ?? 144);
  }

  get thumbnailJpegQuality(): number {
    return Number(this.config.get('DMS_THUMBNAIL_JPEG_QUALITY') ?? 85);
  }

  private resolveBackendPath(path: string): string {
    return resolve(this.backendRoot, path);
  }

  private optionalUrl(key: string): string | null {
    const value = this.config.get<string>(key)?.trim();
    return value ? value.replace(/\/+$/, '') : null;
  }

  private positiveInteger(key: string, fallback: number): number {
    const value = Number(this.config.get(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }

  private integerInRange(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.config.get(key) ?? fallback);
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.trunc(value)));
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);
    if (value === undefined) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
