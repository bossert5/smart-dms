import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { AppConfigService } from '../common/app-config.service';
import { StorageService } from '../storage/storage.service';
import {
  CommandFailedError,
  CommandRunnerService,
  type CommandResult,
} from './command-runner.service';

const OCR_HELPER_CONTAINER_PATH = '/usr/local/bin/smart-dms-ocr-helper';
const RUNTIME_SERVICE_TIMEOUT_BUFFER_MS = 60_000;

export type OcrCommand = 'ocrmypdf' | 'gs' | 'python3';

@Injectable()
export class OcrCommandService {
  constructor(
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
    private readonly commandRunner: CommandRunnerService,
  ) {}

  get helperScriptPath(): string {
    return isRunningInContainer()
      ? this.config.ocrHelperScriptPath
      : OCR_HELPER_CONTAINER_PATH;
  }

  storagePath(path: { readonly relativePath: string }): string {
    if (isRunningInContainer()) {
      return this.storage.resolveRelativePath(path.relativePath);
    }

    return this.storage.toContainerPath(
      path.relativePath,
      this.config.ocrStorageContainerRoot,
    );
  }

  async run(
    command: OcrCommand,
    args: string[],
    options: { readonly timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    const runtimeServiceUrl = this.runtimeServiceUrl(command, args);
    if (runtimeServiceUrl) {
      return this.runRuntimeService(runtimeServiceUrl, command, args, options);
    }

    if (isRunningInContainer()) {
      return this.commandRunner.run(command, args, {
        cwd: this.storage.root,
        timeoutMs: options.timeoutMs ?? this.config.ocrTimeoutMs,
      });
    }

    const dockerArgs = [
      'run',
      '--rm',
      '--workdir',
      this.config.ocrStorageContainerRoot,
      '-v',
      `${this.storage.root}:${this.config.ocrStorageContainerRoot}`,
    ];

    if (command === 'gs') {
      dockerArgs.push('--entrypoint', '/usr/bin/gs');
    }

    if (command === 'python3') {
      dockerArgs.push('--entrypoint', '/app/.venv/bin/python3');
    }

    dockerArgs.push(this.dockerImageFor(command, args), ...args);
    return this.commandRunner.run('docker', dockerArgs, {
      timeoutMs: options.timeoutMs ?? this.config.ocrTimeoutMs,
    });
  }

  private runtimeServiceUrl(
    command: OcrCommand,
    args: string[],
  ): string | null {
    if (this.isDoclingCommand(command, args)) {
      return this.config.doclingServiceUrl;
    }

    return this.config.ocrServiceUrl;
  }

  private dockerImageFor(command: OcrCommand, args: string[]): string {
    return this.isDoclingCommand(command, args)
      ? this.config.doclingDockerImage
      : this.config.ocrDockerImage;
  }

  private isDoclingCommand(command: OcrCommand, args: string[]): boolean {
    return command === 'python3' && args[1] === 'extract-docling-markdown';
  }

  private runtimeServiceArgs(command: OcrCommand, args: string[]): string[] {
    if (command === 'python3' && args[0] === this.config.ocrHelperScriptPath) {
      return [OCR_HELPER_CONTAINER_PATH, ...args.slice(1)];
    }

    return args;
  }

  private async runRuntimeService(
    serviceUrl: string,
    command: OcrCommand,
    args: string[],
    options: { readonly timeoutMs?: number },
  ): Promise<CommandResult> {
    const commandTimeoutMs = options.timeoutMs ?? this.config.ocrTimeoutMs;
    const response = await postRuntimeJson(
      `${serviceUrl}/run`,
      {
        command,
        args: this.runtimeServiceArgs(command, args),
        timeoutMs: commandTimeoutMs,
      },
      commandTimeoutMs + RUNTIME_SERVICE_TIMEOUT_BUFFER_MS,
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        exitCode: 1,
        stdout: '',
        stderr: `Runtime service request failed: ${message}`,
      };
      throw new CommandFailedError(
        commandFailedMessage(command, result),
        command,
        args,
        result,
      );
    });
    const responseBody = response.body;
    const result: CommandResult = {
      exitCode:
        typeof responseBody.exitCode === 'number'
          ? responseBody.exitCode
          : response.ok
            ? 1
            : response.status,
      stdout:
        typeof responseBody.stdout === 'string' ? responseBody.stdout : '',
      stderr:
        typeof responseBody.stderr === 'string'
          ? responseBody.stderr
          : 'error' in responseBody && typeof responseBody.error === 'string'
            ? responseBody.error
            : response.statusText,
    };

    if (!response.ok || result.exitCode !== 0) {
      throw new CommandFailedError(
        commandFailedMessage(command, result),
        command,
        args,
        result,
      );
    }

    return result;
  }
}

export function isRunningInContainer(): boolean {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
}

function commandFailedMessage(command: string, result: CommandResult): string {
  const output = commandOutputSummary(result);
  return `${command} failed with exit code ${result.exitCode}.${output}`;
}

function commandOutputSummary(result: CommandResult): string {
  const stderr = result.stderr.trim();
  if (stderr) {
    return ` stderr: ${truncateOutput(stderr)}`;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    return ` stdout: ${truncateOutput(stdout)}`;
  }

  return '';
}

function truncateOutput(output: string): string {
  const singleLineOutput = output.replace(/\s+/g, ' ');
  if (singleLineOutput.length <= 800) {
    return singleLineOutput;
  }

  return `${singleLineOutput.slice(0, 397)}...${singleLineOutput.slice(-397)}`;
}

type RuntimeJsonResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: Record<string, unknown>;
};

function postRuntimeJson(
  url: string,
  payload: unknown,
  timeoutMs: number,
): Promise<RuntimeJsonResponse> {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const request = requestForProtocol(target.protocol);
  const requestOptions: RequestOptions = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = request(target, requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          body: parseRuntimeJsonBody(responseText),
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request timed out after ${timeoutMs} ms`));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function requestForProtocol(protocol: string) {
  if (protocol === 'http:') {
    return httpRequest;
  }

  if (protocol === 'https:') {
    return httpsRequest;
  }

  throw new Error(`Unsupported runtime service protocol: ${protocol}`);
}

function parseRuntimeJsonBody(responseText: string): Record<string, unknown> {
  if (!responseText) {
    return {};
  }

  try {
    const parsed = JSON.parse(responseText) as unknown;
    return isRecord(parsed)
      ? parsed
      : { error: 'Runtime service returned invalid JSON.' };
  } catch {
    return { error: responseText };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
