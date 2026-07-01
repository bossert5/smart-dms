import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [summaryPath, statements, branches, functions, lines] = process.argv.slice(2);

if (!summaryPath || !statements || !branches || !functions || !lines) {
  console.error(
    'Usage: node scripts/check-coverage.mjs <coverage-summary.json> <statements> <branches> <functions> <lines>',
  );
  process.exit(1);
}

const summary = JSON.parse(readFileSync(resolve(summaryPath), 'utf8'));
const thresholds = {
  statements: Number(statements),
  branches: Number(branches),
  functions: Number(functions),
  lines: Number(lines),
};
const total = summary.total;
const failures = Object.entries(thresholds).filter(([key, threshold]) => {
  return total[key].pct < threshold;
});

for (const [key, threshold] of Object.entries(thresholds)) {
  console.log(`${key}: ${total[key].pct}% (threshold ${threshold}%)`);
}

if (failures.length > 0) {
  console.error(
    `Coverage thresholds failed: ${failures
      .map(([key, threshold]) => `${key} ${total[key].pct}% < ${threshold}%`)
      .join(', ')}`,
  );
  process.exit(1);
}
