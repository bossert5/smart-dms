import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export class CommandFailedError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly args: string[],
    readonly result: CommandResult,
  ) {
    super(message);
  }
}

@Injectable()
export class CommandRunnerService {
  run(
    command: string,
    args: string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;
      const timeout = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, options.timeoutMs)
        : undefined;

      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        reject(error);
      });
      child.on('close', (exitCode) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        const result = {
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        };

        if (timedOut) {
          reject(
            new CommandFailedError(
              `${command} timed out.`,
              command,
              args,
              result,
            ),
          );
          return;
        }

        if (result.exitCode !== 0) {
          reject(
            new CommandFailedError(
              commandFailedMessage(command, result),
              command,
              args,
              result,
            ),
          );
          return;
        }

        resolve(result);
      });
    });
  }
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
