import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ScannerImportDirectoryService } from './scanner-import-directory.service';

describe('ScannerImportDirectoryService', () => {
  let scannerRoot: string;
  let service: ScannerImportDirectoryService;

  beforeEach(async () => {
    scannerRoot = await mkdtemp(join(tmpdir(), 'smart-dms-scanner-import-'));
    service = new ScannerImportDirectoryService({
      resolveScannerImportPath: (scannerImportPath: string) =>
        join(scannerRoot, scannerImportPath),
    } as never);
  });

  afterEach(async () => {
    await rm(scannerRoot, { recursive: true, force: true });
  });

  it('creates a missing scanner import directory recursively', async () => {
    await service.ensureDirectory('tenant-a/inbox');

    const directoryStat = await stat(join(scannerRoot, 'tenant-a', 'inbox'));
    expect(directoryStat.isDirectory()).toBe(true);
  });

  it('removes an empty scanner import directory', async () => {
    await mkdir(join(scannerRoot, 'tenant-a'), { recursive: true });

    await service.removeDirectoryIfEmpty('tenant-a');

    await expect(stat(join(scannerRoot, 'tenant-a'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps a scanner import directory when it contains data', async () => {
    const filePath = join(scannerRoot, 'tenant-a', 'document.pdf');
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, 'pdf', 'utf8');

    await service.removeDirectoryIfEmpty('tenant-a');

    await expect(readdir(join(scannerRoot, 'tenant-a'))).resolves.toEqual([
      'document.pdf',
    ]);
  });
});
