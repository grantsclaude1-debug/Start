import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const required = [
  /NON-PRODUCTION/i,
  /SYNTHETIC/i,
  /PRIVATE_GATE_VERIFIER/,
  /PRIVATE_GATE_SESSION_SECRET/,
  /in-memory/i,
  /no real PII/i,
  /payment.+disabled/is,
  /Yellow Dog.+read-only/is,
  /Splash Radio.+manual-only/is,
  /migration.+read-only/is,
  /not scanner-compatible/i,
  /npm run verify/,
];
for (const pattern of required) if (!pattern.test(readme)) throw new Error(`README missing required safety/setup statement: ${pattern}`);
for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1].split('#')[0];
  if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
  if (!existsSync(resolve(dirname(readmePath), target))) throw new Error(`Broken local README link: ${target}`);
}
for (const script of ['start', 'test', 'check', 'docs:check', 'verify', 'gate:setup']) if (!pkg.scripts?.[script]) throw new Error(`Missing package script: ${script}`);
console.log('PASS docs: required safety claims, exact setup variables, scripts, and local links are present');
