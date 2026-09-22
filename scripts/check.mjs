import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [];
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else files.push(path); } }
for (const directory of ['api', 'src', 'scripts', 'test', 'public']) walk(join(root, directory));
for (const file of files.filter((path) => ['.js', '.mjs'].includes(extname(path)))) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (pkg.dependencies || pkg.devDependencies || pkg.optionalDependencies || pkg.peerDependencies) throw new Error('External dependencies are prohibited');
const bannedImports = /from ['"](?:https?:|node:(?:https|http2|net|tls|dgram))|import\(['"](?:https?:|node:(?:https|http2|net|tls|dgram))/;
for (const file of files.filter((path) => ['.js', '.mjs'].includes(extname(path)))) {
  const text = readFileSync(file, 'utf8');
  if (bannedImports.test(text)) throw new Error(`External network-capable import prohibited: ${relative(root, file)}`);
  if (/from ['"]node:http['"]/.test(text) && !['src/server.js', 'test/server.test.js', 'test/serverless-handler.test.js'].includes(relative(root, file))) throw new Error(`HTTP import outside server/test boundary: ${relative(root, file)}`);
}
const fixtureText = readFileSync(join(root, 'src/fixtures/non-pii.js'), 'utf8');
for (const pattern of [/@/, /\b(?:\d[ -]*?){13,19}\b/, /PRIVATE_GATE_VERIFIER\s*=/]) if (pattern.test(fixtureText)) throw new Error('Fixture may contain sensitive data');
const shipped = files.filter((path) => ['api', 'src', 'public'].includes(relative(root, path).split('/')[0]));
for (const file of shipped) {
  const text = readFileSync(file, 'utf8');
  if (/sk_(?:live|test)_[A-Za-z0-9]{12,}|(?:api|secret)[_-]?key\s*[:=]\s*['"][^'"]+/i.test(text)) throw new Error(`Possible embedded secret: ${relative(root, file)}`);
  if (/fetch\(['"]https?:\/\//.test(text) || /https?:\/\/(?:api\.)?(?:stripe|roller|yellowdog|splash)/i.test(text)) throw new Error(`Vendor network boundary violated: ${relative(root, file)}`);
}
console.log(`PASS check: ${files.filter((path) => ['.js', '.mjs'].includes(extname(path))).length} JS files parsed; zero dependencies; HTTP confined to server/test; external network imports, vendor calls, embedded secrets, and fixture PII absent`);
