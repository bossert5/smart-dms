import { Injectable } from '@nestjs/common';
import { mkdir, rmdir } from 'node:fs/promises';
import { AppConfigService } from './app-config.service';

@Injectable()
export class ScannerImportDirectoryService {
  constructor(private readonly config: AppConfigService) {}

  async ensureDirectory(scannerImportPath: string | null): Promise<boolean> {
    if (!scannerImportPath) {
      return false;
    }

    const createdPath = await mkdir(
      this.config.resolveScannerImportPath(scannerImportPath),
      {
        recursive: true,
      },
    );

    return Boolean(createdPath);
  }

  async removeDirectoryIfEmpty(
    scannerImportPath: string | null,
  ): Promise<void> {
    if (!scannerImportPath) {
      return;
    }

    await rmdir(this.config.resolveScannerImportPath(scannerImportPath)).catch(
      (error: NodeJS.ErrnoException) => {
        if (!this.isIgnorableRemoveError(error)) {
          throw error;
        }
      },
    );
  }

  private isIgnorableRemoveError(error: NodeJS.ErrnoException): boolean {
    return ['ENOENT', 'ENOTDIR', 'ENOTEMPTY', 'EEXIST'].includes(
      error.code ?? '',
    );
  }
}
