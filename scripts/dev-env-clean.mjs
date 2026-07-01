#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const networkName = 'smart-dms-dev';
const postgresContainer = 'smart-dms-postgres';
const postgresVolume = 'smart-dms-postgres-data';
const redisContainer = 'smart-dms-redis';
const redisVolume = 'smart-dms-redis-data';
const defaultOcrImage = 'smart-dms/ocr-runtime:latest';
const defaultDoclingImage = 'smart-dms/docling-runtime:latest';

let hadRemovalFailure = false;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  main(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function main(options) {
  console.log('Smart DMS dev Docker cleanup');

  const images = unique([defaultOcrImage, defaultDoclingImage]);

  if (options.dryRun) {
    printPlannedCleanup(images, options);
    return;
  }

  ensureCommand('docker', 'Docker CLI was not found. Install Docker and make sure docker is available in PATH.');
  invokeChecked('docker', ['info'], 'Docker is not running or is not reachable');

  removeContainerIfExists(postgresContainer);
  removeContainerIfExists(redisContainer);

  if (!options.keepVolumes) {
    removeVolumeIfExists(postgresVolume);
    removeVolumeIfExists(redisVolume);
  }

  if (!options.keepNetwork) {
    removeNetworkIfExists(networkName);
  }

  if (!options.keepImages) {
    for (const image of images) {
      removeImageIfExists(image);
    }
  }

  if (hadRemovalFailure) {
    throw new Error('Cleanup finished with errors. See messages above for resources that could not be removed.');
  }

  console.log('');
  console.log('Dev Docker resources were removed.');
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    help: false,
    keepImages: false,
    keepNetwork: false,
    keepVolumes: false,
  };
  const aliases = new Map([
    ['-h', 'help'],
    ['--help', 'help'],
    ['--dry-run', 'dryRun'],
    ['--keep-images', 'keepImages'],
    ['--keep-network', 'keepNetwork'],
    ['--keep-volumes', 'keepVolumes'],
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
  console.log(`Smart DMS dev Docker cleanup

Usage:
  pnpm run dev:clean
  pnpm run dev:clean -- --dry-run
  pnpm run dev:clean -- --keep-images

Options:
  --dry-run
  --keep-images
  --keep-network
  --keep-volumes
  -h, --help`);
}

function printPlannedCleanup(images, options) {
  console.log('');
  console.log('Would remove Docker containers:');
  console.log(`  - ${postgresContainer}`);
  console.log(`  - ${redisContainer}`);

  if (!options.keepVolumes) {
    console.log('Would remove Docker volumes:');
    console.log(`  - ${postgresVolume}`);
    console.log(`  - ${redisVolume}`);
  }

  if (!options.keepNetwork) {
    console.log('Would remove Docker network:');
    console.log(`  - ${networkName}`);
  }

  if (!options.keepImages) {
    console.log('Would remove Docker images:');
    for (const image of images) {
      console.log(`  - ${image}`);
    }
  }
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

function invokeRemoval(command, args, failureMessage) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0 && !result.error) {
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    return;
  }

  hadRemovalFailure = true;
  const detail = result.error?.message || result.stderr.trim() || `Exit code: ${result.status}`;
  console.error(`${failureMessage}. ${detail}`);
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

function removeContainerIfExists(name) {
  if (!testDockerObject('container', name)) {
    console.log(`Docker container not found: ${name}`);
    return;
  }

  invokeRemoval('docker', ['rm', '-f', name], `Failed to remove Docker container ${name}`);
}

function removeVolumeIfExists(name) {
  if (!testDockerObject('volume', name)) {
    console.log(`Docker volume not found: ${name}`);
    return;
  }

  invokeRemoval('docker', ['volume', 'rm', name], `Failed to remove Docker volume ${name}`);
}

function removeNetworkIfExists(name) {
  if (!testDockerObject('network', name)) {
    console.log(`Docker network not found: ${name}`);
    return;
  }

  invokeRemoval('docker', ['network', 'rm', name], `Failed to remove Docker network ${name}`);
}

function removeImageIfExists(name) {
  if (!testDockerObject('image', name)) {
    console.log(`Docker image not found: ${name}`);
    return;
  }

  invokeRemoval('docker', ['image', 'rm', name], `Failed to remove Docker image ${name}`);
}

function unique(values) {
  return [...new Set(values.filter((value) => value && value.trim()))];
}
