import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let storageRoot: string;
  let service: StorageService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'smart-dms-storage-'));
    service = new StorageService({ storageRoot } as never);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('prepares deterministic final PDF and thumbnail artifact paths', async () => {
    await expect(
      service.prepareFinalDocumentArtifactPath('pdfs', 'document-id', '.pdf'),
    ).resolves.toEqual({
      relativePath: 'pdfs/document-id.pdf',
      absolutePath: join(storageRoot, 'pdfs', 'document-id.pdf'),
    });
    await expect(
      service.prepareFinalDocumentArtifactPath(
        'thumbnails',
        'document-id',
        'jpg',
      ),
    ).resolves.toEqual({
      relativePath: 'thumbnails/document-id.jpg',
      absolutePath: join(storageRoot, 'thumbnails', 'document-id.jpg'),
    });
  });

  it('keeps temporary processing artifacts under the document folder', async () => {
    const artifact = await service.prepareArtifactPath(
      'tmp/processing',
      'document-id',
      '.txt',
    );

    expect(artifact.relativePath).toMatch(
      /^tmp\/processing\/document-id\/.+\.txt$/,
    );
  });

  it('replaces an existing stored file and removes the emptied source folder', async () => {
    await writeStorageFile('tmp/processing/document-id/output.pdf', 'new pdf');
    await writeStorageFile('pdfs/document-id.pdf', 'old pdf');

    await service.replaceStoredFile(
      'tmp/processing/document-id/output.pdf',
      'pdfs/document-id.pdf',
    );

    await expect(
      readFile(join(storageRoot, 'pdfs', 'document-id.pdf'), 'utf8'),
    ).resolves.toBe('new pdf');
    await expect(
      readFile(
        join(storageRoot, 'tmp', 'processing', 'document-id', 'output.pdf'),
        'utf8',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  async function writeStorageFile(
    relativePath: string,
    content: string,
  ): Promise<void> {
    const path = join(storageRoot, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
});
