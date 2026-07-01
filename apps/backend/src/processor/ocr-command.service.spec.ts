import { expectStringContaining } from '../testing/expect-matchers';
import { expectAny, expectArrayContaining } from '../testing/expect-matchers';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CommandFailedError } from './command-runner.service';
import { OcrCommandService } from './ocr-command.service';

describe('OcrCommandService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes OCR commands to the configured OCR runtime service', async () => {
    await withRuntimeServer(
      async (request, response) => {
        const body = await readRequestBody(request);
        expect(request.method).toBe('POST');
        expect(request.url).toBe('/run');
        expect(JSON.parse(body)).toEqual({
          command: 'ocrmypdf',
          args: ['--version'],
          timeoutMs: 1800000,
        });
        sendJson(response, { exitCode: 0, stdout: 'ocr output', stderr: '' });
      },
      async (serviceUrl) => {
        const { commandRunner, service } = createService({
          ocrServiceUrl: serviceUrl,
        });

        const result = await service.run('ocrmypdf', ['--version']);

        expect(result.stdout).toBe('ocr output');
        expect(commandRunner.run).not.toHaveBeenCalled();
      },
    );
  });

  it('routes Docling Markdown extraction to the configured Docling runtime service', async () => {
    await withRuntimeServer(
      async (request, response) => {
        const body = JSON.parse(await readRequestBody(request)) as Record<
          string,
          unknown
        >;
        expect(request.url).toBe('/run');
        expect(body.command).toBe('python3');
        expect(body.args).toEqual([
          '/usr/local/bin/smart-dms-ocr-helper',
          'extract-docling-markdown',
          '--max-pages',
          '1',
          'input.pdf',
          'output.md',
        ]);
        sendJson(response, {
          exitCode: 0,
          stdout: '{"markdownCharacters":10}',
          stderr: '',
        });
      },
      async (serviceUrl) => {
        const { commandRunner, service } = createService({
          ocrServiceUrl: 'http://ocr-runtime:8080',
          doclingServiceUrl: serviceUrl,
        });

        await service.run('python3', [
          service.helperScriptPath,
          'extract-docling-markdown',
          '--max-pages',
          '1',
          'input.pdf',
          'output.md',
        ]);

        expect(commandRunner.run).not.toHaveBeenCalled();
      },
    );
  });

  it('uses separate Docker images for host OCR and Docling execution', async () => {
    const { commandRunner, service } = createService({});

    await service.run('ocrmypdf', ['--version']);
    await service.run('python3', [
      service.helperScriptPath,
      'extract-docling-markdown',
      '--max-pages',
      '1',
      'input.pdf',
      'output.md',
    ]);

    expect(commandRunner.run).toHaveBeenNthCalledWith(
      1,
      'docker',
      expectArrayContaining(['smart-dms/ocr-runtime:latest', '--version']),
      expectAny(Object),
    );
    expect(commandRunner.run).toHaveBeenNthCalledWith(
      2,
      'docker',
      expectArrayContaining([
        '--entrypoint',
        '/app/.venv/bin/python3',
        'smart-dms/docling-runtime:latest',
        'extract-docling-markdown',
      ]),
      expectAny(Object),
    );
  });

  it('turns runtime service failures into command failures', async () => {
    await withRuntimeServer(
      (_request, response) => {
        sendJson(response, { exitCode: 2, stdout: '', stderr: 'bad ocr args' });
      },
      async (serviceUrl) => {
        const { service } = createService({
          ocrServiceUrl: serviceUrl,
        });

        await expect(service.run('ocrmypdf', ['--bad'])).rejects.toMatchObject<
          Partial<CommandFailedError>
        >({
          message: 'ocrmypdf failed with exit code 2. stderr: bad ocr args',
          command: 'ocrmypdf',
          args: ['--bad'],
          result: { exitCode: 2, stdout: '', stderr: 'bad ocr args' },
        });
      },
    );
  });

  it('turns unreachable runtime services into command failures', async () => {
    const closedServerUrl = await listenAndCloseRuntimeServer();
    const { service } = createService({
      ocrServiceUrl: closedServerUrl,
    });

    await expect(service.run('ocrmypdf', ['--version'])).rejects.toMatchObject<
      Partial<CommandFailedError>
    >({
      command: 'ocrmypdf',
      args: ['--version'],
      result: {
        exitCode: 1,
        stdout: '',
        stderr: expectStringContaining('Runtime service request failed:'),
      },
    });
  });
});

function createService(options: {
  ocrServiceUrl?: string | null;
  doclingServiceUrl?: string | null;
}) {
  const config = {
    ocrDockerImage: 'smart-dms/ocr-runtime:latest',
    doclingDockerImage: 'smart-dms/docling-runtime:latest',
    ocrServiceUrl: options.ocrServiceUrl ?? null,
    doclingServiceUrl: options.doclingServiceUrl ?? null,
    ocrHelperScriptPath: '/app/apps/backend/scripts/ocr-helper.py',
    ocrStorageContainerRoot: '/data',
    ocrTimeoutMs: 1800000,
  };
  const storage = {
    root: '/storage',
    resolveRelativePath: jest.fn((path: string) => `/storage/${path}`),
    toContainerPath: jest.fn((path: string, root: string) => `${root}/${path}`),
  };
  const commandRunner = {
    run: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  };
  const service = new OcrCommandService(
    config as never,
    storage as never,
    commandRunner,
  );

  return { commandRunner, service };
}

async function withRuntimeServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
  test: (serviceUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  const serviceUrl = await listen(server);

  try {
    await test(serviceUrl);
  } finally {
    await close(server);
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, body: Record<string, unknown>) {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

async function listenAndCloseRuntimeServer(): Promise<string> {
  const server = createServer((_request, response) => {
    response.end();
  });
  const serviceUrl = await listen(server);
  await close(server);
  return serviceUrl;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
