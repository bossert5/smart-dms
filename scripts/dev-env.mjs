#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const envExamplePath = join(backendDir, '.env.example');
const envPath = join(backendDir, '.env');

const networkName = 'smart-dms-dev';
const postgresContainer = 'smart-dms-postgres';
const postgresVolume = 'smart-dms-postgres-data';
const redisContainer = 'smart-dms-redis';
const redisVolume = 'smart-dms-redis-data';
const defaultPostgresImage = 'postgres:16-alpine';
const redisImage = 'redis:7-alpine';
const defaultOcrImage = 'smart-dms/ocr-runtime:latest';
const defaultDoclingImage = 'smart-dms/docling-runtime:latest';

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.deleteAllData) {
  options.deletePostgresData = true;
  options.deleteRedisData = true;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  console.log('Smart DMS dev environment setup');
  console.log(`Repository: ${repoRoot}`);

  ensureCommand('docker', 'Docker CLI was not found. Install Docker and make sure docker is available in PATH.');
  ensureCommand('pnpm', 'pnpm was not found. Enable Corepack or install pnpm and make sure pnpm is available in PATH.');
  invokeChecked('docker', ['info'], 'Docker is not running or is not reachable');

  ensureEnvFile();
  const envValues = readDotEnv(envPath);
  const postgresSettings = getPostgresSettings(envValues);

  ensureConfiguredDirectories(envValues);
  ensureDockerNetwork();
  ensurePostgres(postgresSettings, envValues);
  ensureRedis(envValues);
  await waitForPostgres(postgresSettings);
  await waitForRedis(envValues);
  ensureRuntimeImages(envValues);
  runAppSetup();

  console.log('');
  console.log('Dev environment is ready.');
  console.log('Start the API with: pnpm run dev:api');
}

function parseArgs(args) {
  const parsed = {
    deletePostgresData: false,
    deleteRedisData: false,
    deleteAllData: false,
    stopBackendProcesses: false,
    help: false,
  };
  const aliases = new Map([
    ['-h', 'help'],
    ['--help', 'help'],
    ['-deletepostgresdata', 'deletePostgresData'],
    ['--delete-postgres-data', 'deletePostgresData'],
    ['-deleteredisdata', 'deleteRedisData'],
    ['--delete-redis-data', 'deleteRedisData'],
    ['-deletealldata', 'deleteAllData'],
    ['--delete-all-data', 'deleteAllData'],
    ['-stopbackendprocesses', 'stopBackendProcesses'],
    ['--stop-backend-processes', 'stopBackendProcesses'],
  ]);

  for (const arg of args) {
    if (arg === '--') {
      continue;
    }

    const key = aliases.get(arg.toLowerCase());
    if (!key) {
      throw new Error(`Unknown option: ${arg}`);
    }
    parsed[key] = true;
  }

  return parsed;
}

function printHelp() {
  console.log(`Smart DMS dev environment setup

Usage:
  pnpm run dev:setup
  pnpm run dev:setup -- -DeletePostgresData
  pnpm run dev:setup -- --delete-postgres-data

Options:
  -DeletePostgresData, --delete-postgres-data
  -DeleteRedisData, --delete-redis-data
  -DeleteAllData, --delete-all-data
  -StopBackendProcesses, --stop-backend-processes
  -h, --help`);
}

function invokeChecked(command, args, failureMessage, spawnOptions = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...spawnOptions,
  });

  if (result.error) {
    throw new Error(`${failureMessage}. ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${failureMessage}. Exit code: ${result.status}`);
  }
}

function readCommand(command, args, spawnOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
  });

  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
    error: result.error,
  };
}

function ensureCommand(command, failureMessage) {
  const result = readCommand(command, ['--version']);
  if (!result.ok) {
    throw new Error(failureMessage);
  }
}

function testDockerObject(kind, name) {
  return readCommand('docker', [kind, 'inspect', name]).ok;
}

function readDotEnv(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      continue;
    }

    const match = line.match(/^\s*([^=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }

  return values;
}

function getEnvValue(values, key, defaultValue) {
  const value = values.get(key);
  return value && value.trim() ? value : defaultValue;
}

function resolveConfiguredPath(pathValue) {
  return isAbsolute(pathValue) ? resolve(pathValue) : resolve(backendDir, pathValue);
}

function ensureDirectory(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
    console.log(`Created directory: ${path}`);
    return;
  }

  console.log(`Directory exists: ${path}`);
}

function ensureDockerNetwork() {
  if (testDockerObject('network', networkName)) {
    console.log(`Docker network exists: ${networkName}`);
    return;
  }

  invokeChecked('docker', ['network', 'create', networkName], `Failed to create Docker network ${networkName}`);
}

function ensureDockerVolume(name) {
  if (testDockerObject('volume', name)) {
    console.log(`Docker volume exists: ${name}`);
    return;
  }

  invokeChecked('docker', ['volume', 'create', name], `Failed to create Docker volume ${name}`);
}

function removeDockerContainerIfExists(name) {
  if (testDockerObject('container', name)) {
    invokeChecked('docker', ['rm', '-f', name], `Failed to remove Docker container ${name}`);
  }
}

function removeDockerVolumeIfExists(name) {
  if (testDockerObject('volume', name)) {
    invokeChecked('docker', ['volume', 'rm', name], `Failed to remove Docker volume ${name}`);
  }
}

function getDockerContainerImage(name) {
  if (!testDockerObject('container', name)) {
    return null;
  }

  const result = readCommand('docker', ['inspect', '-f', '{{.Config.Image}}', name]);
  if (!result.ok) {
    throw new Error(`Failed to inspect Docker container image for ${name}. Exit code: ${result.status}`);
  }

  return result.stdout.trim();
}

function startContainerIfExists(name) {
  if (!testDockerObject('container', name)) {
    return false;
  }

  const result = readCommand('docker', ['inspect', '-f', '{{.State.Running}}', name]);
  if (!result.ok) {
    throw new Error(`Failed to inspect Docker container ${name}. Exit code: ${result.status}`);
  }

  if (result.stdout.trim() === 'true') {
    console.log(`Docker container is running: ${name}`);
    return true;
  }

  invokeChecked('docker', ['start', name], `Failed to start Docker container ${name}`);
  return true;
}

function getPostgresSettings(envValues) {
  const databaseUrl = getEnvValue(
    envValues,
    'DATABASE_URL',
    'postgresql://smart_dms:smart_dms@localhost:5432/smart_dms?schema=public',
  );
  const uri = new URL(databaseUrl);

  if (!['localhost', '127.0.0.1'].includes(uri.hostname)) {
    console.warn(
      `DATABASE_URL host is '${uri.hostname}'. The dev Docker PostgreSQL container is still exposed on localhost:${uri.port || '5432'}.`,
    );
  }

  return {
    user: decodeURIComponent(uri.username),
    password: decodeURIComponent(uri.password),
    database: uri.pathname.replace(/^\/+/, ''),
    port: uri.port || '5432',
  };
}

function ensurePostgres(settings, envValues) {
  const postgresImage = getEnvValue(envValues, 'DMS_POSTGRES_DOCKER_IMAGE', defaultPostgresImage);

  if (options.deletePostgresData) {
    removeDockerContainerIfExists(postgresContainer);
    removeDockerVolumeIfExists(postgresVolume);
  }

  ensureDockerVolume(postgresVolume);

  const existingPostgresImage = getDockerContainerImage(postgresContainer);
  if (existingPostgresImage && existingPostgresImage !== postgresImage) {
    console.warn(
      `PostgreSQL container ${postgresContainer} uses image '${existingPostgresImage}', but '${postgresImage}' is configured. Recreating the container and preserving volume ${postgresVolume}.`,
    );
    removeDockerContainerIfExists(postgresContainer);
  }

  if (startContainerIfExists(postgresContainer)) {
    return;
  }

  invokeChecked(
    'docker',
    [
      'run',
      '--name',
      postgresContainer,
      '--network',
      networkName,
      '-e',
      `POSTGRES_USER=${settings.user}`,
      '-e',
      `POSTGRES_PASSWORD=${settings.password}`,
      '-e',
      `POSTGRES_DB=${settings.database}`,
      '-p',
      `${settings.port}:5432`,
      '-v',
      `${postgresVolume}:/var/lib/postgresql/data`,
      '-d',
      postgresImage,
    ],
    'Failed to create PostgreSQL container',
  );
}

function ensureRedis(envValues) {
  if (options.deleteRedisData) {
    removeDockerContainerIfExists(redisContainer);
    removeDockerVolumeIfExists(redisVolume);
  }

  ensureDockerVolume(redisVolume);

  if (startContainerIfExists(redisContainer)) {
    return;
  }

  const redisPort = getEnvValue(envValues, 'REDIS_PORT', '6379');
  const redisPassword = envValues.get('REDIS_PASSWORD') ?? '';
  const redisCommand = ['redis-server', '--appendonly', 'yes'];
  if (redisPassword.trim()) {
    redisCommand.push('--requirepass', redisPassword);
  }

  invokeChecked(
    'docker',
    [
      'run',
      '--name',
      redisContainer,
      '--network',
      networkName,
      '-p',
      `${redisPort}:6379`,
      '-v',
      `${redisVolume}:/data`,
      '-d',
      redisImage,
      ...redisCommand,
    ],
    'Failed to create Redis container',
  );
}

async function waitForPostgres(settings) {
  console.log('Waiting for PostgreSQL...');
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (
      readCommand('docker', [
        'exec',
        postgresContainer,
        'pg_isready',
        '-U',
        settings.user,
        '-d',
        settings.database,
      ]).ok
    ) {
      console.log('PostgreSQL is ready.');
      return;
    }
    await sleep(1000);
  }

  throw new Error('PostgreSQL did not become ready in time.');
}

async function waitForRedis(envValues) {
  const redisPassword = envValues.get('REDIS_PASSWORD') ?? '';
  console.log('Waiting for Redis...');
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const args = ['exec', redisContainer, 'redis-cli'];
    if (redisPassword.trim()) {
      args.push('-a', redisPassword);
    }
    args.push('ping');

    if (readCommand('docker', args).ok) {
      console.log('Redis is ready.');
      return;
    }
    await sleep(1000);
  }

  throw new Error('Redis did not become ready in time.');
}

function ensureEnvFile() {
  if (!existsSync(envExamplePath)) {
    throw new Error(`Missing env template: ${envExamplePath}`);
  }

  if (existsSync(envPath)) {
    console.log(`Env file exists: ${envPath}`);
    return;
  }

  copyFileSync(envExamplePath, envPath);
  console.log(`Created env file: ${envPath}`);
}

function ensureConfiguredDirectories(envValues) {
  const storageRoot = resolveConfiguredPath(getEnvValue(envValues, 'DMS_STORAGE_ROOT', './storage'));
  const scannerImportDir = resolveConfiguredPath(
    getEnvValue(envValues, 'DMS_SCANNER_IMPORT_DIR', './scanner-import'),
  );

  ensureDirectory(storageRoot);
  ensureDirectory(scannerImportDir);
}

function ensureRuntimeImages(envValues) {
  const ocrImage = getEnvValue(envValues, 'DMS_OCR_DOCKER_IMAGE', defaultOcrImage);
  const doclingImage = getEnvValue(envValues, 'DMS_DOCLING_DOCKER_IMAGE', defaultDoclingImage);

  if (ocrImage === defaultOcrImage) {
    invokeChecked(
      'docker',
      ['build', '-t', ocrImage, '-f', 'docker/ocr-runtime/Dockerfile', '.'],
      'Failed to build OCR runtime Docker image',
    );
  } else if (!testDockerObject('image', ocrImage)) {
    invokeChecked('docker', ['pull', ocrImage], 'Failed to pull OCR runtime Docker image');
  } else {
    console.log(`OCR runtime Docker image exists: ${ocrImage}`);
  }

  invokeChecked('docker', ['run', '--rm', ocrImage, '--version'], 'Failed to verify OCR runtime Docker image');
  invokeChecked(
    'docker',
    ['run', '--rm', '--entrypoint', 'tesseract', ocrImage, '--list-langs'],
    'Failed to verify Tesseract languages',
  );

  if (doclingImage === defaultDoclingImage) {
    invokeChecked(
      'docker',
      ['build', '-t', doclingImage, '-f', 'docker/docling-runtime/Dockerfile', '.'],
      'Failed to build Docling runtime Docker image',
    );
  } else if (!testDockerObject('image', doclingImage)) {
    invokeChecked('docker', ['pull', doclingImage], 'Failed to pull Docling runtime Docker image');
  } else {
    console.log(`Docling runtime Docker image exists: ${doclingImage}`);
  }

  invokeChecked(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      '/app/.venv/bin/python3',
      doclingImage,
      '-c',
      'import docling; print("docling ok")',
    ],
    'Failed to verify Docling runtime Docker image',
  );
}

function runAppSetup() {
  invokeChecked('pnpm', ['install'], 'pnpm install failed');
  invokeChecked('pnpm', ['run', 'build:shared'], 'Shared DTO build failed');
  ensurePrismaClientCanBeGenerated();
  invokeChecked('pnpm', ['--filter', 'backend', 'prisma:generate'], 'Prisma generate failed');
  invokeChecked('pnpm', ['--filter', 'backend', 'prisma:migrate'], 'Prisma migrate failed');
}

function ensurePrismaClientCanBeGenerated() {
  const backendProcesses = getBackendNodeProcesses();
  if (backendProcesses.length === 0) {
    return;
  }

  if (options.stopBackendProcesses) {
    for (const processInfo of backendProcesses) {
      console.warn(`Stopping backend Node.js process ${processInfo.pid} before Prisma generate.`);
      stopProcess(processInfo.pid);
    }
    return;
  }

  const processSummary = backendProcesses
    .map((processInfo) => `PID ${processInfo.pid}: ${processInfo.commandLine}`)
    .join('\n');

  if (process.platform === 'win32') {
    throw new Error(
      `Prisma generate cannot replace the Windows query engine while backend/processor Node.js processes are running. Stop them first or rerun this script with -StopBackendProcesses. Running processes:\n${processSummary}`,
    );
  }

  console.warn(
    `Detected running Smart DMS backend/processor Node.js processes. Prisma generate will continue on this platform. Use -StopBackendProcesses if you want this script to stop them first. Running processes:\n${processSummary}`,
  );
}

function getBackendNodeProcesses() {
  const backendPath = join(repoRoot, 'apps', 'backend').toLowerCase().replaceAll('\\', '/');
  const matchFragments = [
    backendPath,
    'run dev:api',
    'run dev:processor',
    'start:dev -w backend',
    'start:processor:dev -w backend',
    'apps/backend/dist/src/main.js',
    'apps/backend/dist/src/processor.js',
  ];

  if (process.platform === 'win32') {
    return getWindowsNodeProcesses(matchFragments);
  }

  const result = readCommand('ps', ['-eo', 'pid=,comm=,args=']);
  if (!result.ok) {
    console.warn(`Could not inspect Node.js process command lines. ps exit code: ${result.status}`);
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .filter((match) => ['node', 'nodejs'].includes(match[2]))
    .map((match) => ({
      pid: Number(match[1]),
      commandLine: match[3],
    }))
    .filter((processInfo) => commandLineMatches(processInfo.commandLine, matchFragments));
}

function getWindowsNodeProcesses(matchFragments) {
  const powershell = ['powershell.exe', 'powershell'].find((command) =>
    readCommand(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], { cwd: repoRoot }).ok,
  );
  if (!powershell) {
    console.warn(
      'Could not inspect Node.js process command lines because Windows PowerShell was not found. Stop running backend/processor processes manually before Prisma generate if EPERM occurs.',
    );
    return [];
  }

  const result = readCommand(powershell, [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
  ]);
  if (!result.ok) {
    console.warn(
      'Could not inspect Node.js process command lines. Stop running backend/processor processes manually before Prisma generate if EPERM occurs.',
    );
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^(\d+)\t(.*)$/))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      commandLine: match[2],
    }))
    .filter((processInfo) => commandLineMatches(processInfo.commandLine, matchFragments));
}

function commandLineMatches(commandLine, matchFragments) {
  const normalizedCommandLine = commandLine.toLowerCase().replaceAll('\\', '/');
  return matchFragments.some((fragment) => normalizedCommandLine.includes(fragment));
}

function stopProcess(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    throw new Error(`Failed to stop process ${pid}. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  });
}
