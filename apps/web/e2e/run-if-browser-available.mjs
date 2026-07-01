import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';

const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

const executablePath = candidates.find((candidate) => {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!executablePath) {
  console.warn(
    'Skipping web Playwright smoke tests: no Chromium executable is available and Playwright browser install is unsupported on this OS.',
  );
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'playwright', 'test'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath,
  },
});

process.exit(result.status ?? 1);
