import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { AppConfigService } from '../common/app-config.service';
import { API_ROUTE_PREFIX } from '../common/api-prefix';

export interface StoredFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  checksum: string;
}

type FinalDocumentArtifactArea = 'docling-debug' | 'pdfs' | 'thumbnails';

@Injectable()
export class StorageService implements OnModuleInit {
  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.ensureArea('email-attachments'),
      this.ensureArea('originals'),
      this.ensureArea('normalized'),
      this.ensureArea('docling-debug'),
      this.ensureArea('pdfs'),
      this.ensureArea('thumbnails'),
      this.ensureArea('tmp/uploads'),
      this.ensureArea('errors'),
      this.ensureArea('extractions'),
    ]);
  }

  get root(): string {
    return this.config.storageRoot;
  }

  get tempUploadDir(): string {
    return join(this.root, 'tmp', 'uploads');
  }

  async moveUploadedOriginal(
    tempPath: string,
    documentId: string,
    originalFileName: string,
  ): Promise<StoredFile> {
    const extension = this.safeExtension(originalFileName);
    const relativePath = this.toRelativePath(
      'originals',
      documentId,
      `${randomUUID()}${extension}`,
    );
    const absolutePath = this.resolveRelativePath(relativePath);

    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await this.moveFile(tempPath, absolutePath);

    const [fileStat, checksum] = await Promise.all([
      stat(absolutePath),
      this.sha256(absolutePath),
    ]);

    return {
      relativePath,
      absolutePath,
      size: fileStat.size,
      checksum,
    };
  }

  async writeEmailAttachment(
    documentId: string,
    fileName: string,
    content: Buffer,
  ): Promise<StoredFile> {
    const extension = this.safeExtension(fileName);
    const relativePath = this.toRelativePath(
      'email-attachments',
      documentId,
      `${randomUUID()}${extension}`,
    );
    const absolutePath = this.resolveRelativePath(relativePath);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, content);

    return this.describeStoredFile(relativePath);
  }

  async copyStoredFileToOriginal(
    sourceRelativePath: string,
    documentId: string,
    originalFileName: string,
  ): Promise<StoredFile> {
    const extension = this.safeExtension(originalFileName);
    const relativePath = this.toRelativePath(
      'originals',
      documentId,
      `${randomUUID()}${extension}`,
    );
    const absolutePath = this.resolveRelativePath(relativePath);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await copyFile(this.resolveRelativePath(sourceRelativePath), absolutePath);

    return this.describeStoredFile(relativePath);
  }

  async prepareArtifactPath(
    area: 'pdfs' | 'thumbnails' | 'errors' | 'extractions' | 'tmp/processing',
    documentId: string,
    extension: string,
  ): Promise<{ relativePath: string; absolutePath: string }> {
    const safeExtension = extension.startsWith('.')
      ? extension
      : `.${extension}`;
    const relativePath = this.toRelativePath(
      area,
      documentId,
      `${randomUUID()}${safeExtension.toLowerCase()}`,
    );
    const absolutePath = this.resolveRelativePath(relativePath);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });

    return { relativePath, absolutePath };
  }

  async prepareFinalDocumentArtifactPath(
    area: FinalDocumentArtifactArea,
    documentId: string,
    extension: string,
  ): Promise<{ relativePath: string; absolutePath: string }> {
    const safeExtension = extension.startsWith('.')
      ? extension
      : `.${extension}`;
    const relativePath = this.toRelativePath(
      area,
      `${documentId}${safeExtension.toLowerCase()}`,
    );
    const absolutePath = this.resolveRelativePath(relativePath);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });

    return { relativePath, absolutePath };
  }

  async replaceStoredFile(
    sourceRelativePath: string,
    destinationRelativePath: string,
  ): Promise<void> {
    if (sourceRelativePath === destinationRelativePath) {
      return;
    }

    const sourcePath = this.resolveRelativePath(sourceRelativePath);
    const destinationPath = this.resolveRelativePath(destinationRelativePath);
    await mkdir(resolve(destinationPath, '..'), { recursive: true });
    await unlink(destinationPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
    await this.moveFile(sourcePath, destinationPath);
    await this.removeEmptyParentDirectory(sourceRelativePath, sourcePath);
  }

  async describeStoredFile(relativePath: string): Promise<StoredFile> {
    const absolutePath = this.resolveRelativePath(relativePath);
    const [fileStat, checksum] = await Promise.all([
      stat(absolutePath),
      this.sha256(absolutePath),
    ]);

    return {
      relativePath,
      absolutePath,
      size: fileStat.size,
      checksum,
    };
  }

  async writeErrorArtifact(
    documentId: string,
    text: string,
  ): Promise<StoredFile> {
    const artifact = await this.prepareArtifactPath(
      'errors',
      documentId,
      '.log',
    );
    await writeFile(artifact.absolutePath, text, 'utf8');
    return this.describeStoredFile(artifact.relativePath);
  }

  async deleteStoredFile(relativePath: string): Promise<void> {
    const absolutePath = this.resolveRelativePath(relativePath);

    await unlink(absolutePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
    await this.removeEmptyParentDirectory(relativePath, absolutePath);
  }

  async deleteDocumentTemporaryFiles(documentId: string): Promise<void> {
    const relativePath = this.toRelativePath('tmp/processing', documentId);
    const absolutePath = this.resolveRelativePath(relativePath);
    await rm(absolutePath, { recursive: true, force: true });
  }

  toContainerPath(relativePath: string, containerRoot = '/data'): string {
    return posix.join(containerRoot, relativePath.split('\\').join('/'));
  }

  resolveRelativePath(relativePath: string): string {
    const absolutePath = resolve(this.root, relativePath);
    const storageRelative = relative(this.root, absolutePath);

    if (
      storageRelative.startsWith('..') ||
      storageRelative === '..' ||
      storageRelative.includes(`..${sep}`)
    ) {
      throw new Error('Resolved path escapes storage root.');
    }

    return absolutePath;
  }

  documentPdfUrl(documentId: string): string {
    return `${API_ROUTE_PREFIX}/documents/${documentId}/pdf`;
  }

  documentThumbnailUrl(documentId: string): string {
    return `${API_ROUTE_PREFIX}/documents/${documentId}/thumbnail`;
  }

  private async ensureArea(area: string): Promise<void> {
    await mkdir(resolve(this.root, area), { recursive: true });
  }

  private toRelativePath(...parts: string[]): string {
    return join(...parts)
      .split(sep)
      .join('/');
  }

  private async removeEmptyParentDirectory(
    relativePath: string,
    absolutePath: string,
  ): Promise<void> {
    if (relativePath.split('/').length < 3) {
      return;
    }

    await rmdir(dirname(absolutePath)).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) {
        throw error;
      }
    });
  }

  private safeExtension(fileName: string): string {
    const extension = extname(basename(fileName)).toLowerCase();
    return extension && extension.length <= 10 ? extension : '.bin';
  }

  sha256(path: string): Promise<string> {
    return new Promise((resolveHash, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolveHash(hash.digest('hex')));
    });
  }

  private async moveFile(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EXDEV') {
        throw error;
      }
      await copyFile(source, destination);
      await unlink(source);
    }
  }
}
