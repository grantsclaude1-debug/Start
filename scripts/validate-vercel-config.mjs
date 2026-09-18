import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configPath = join(root, 'vercel.json');
const handlerPath = join(root, 'api/handler.js');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

if (config.version !== 2) throw new Error('vercel.json must use configuration version 2');
if (config.functions?.['api/handler.js']?.runtime !== 'nodejs24.x') throw new Error('Vercel handler must use Node.js 24');
if (config.functions?.['api/handler.js']?.includeFiles !== 'public/**') throw new Error('Vercel handler must include existing public assets');
if (config.rewrites?.length !== 1 || config.rewrites[0].source !== '/:path*' || config.rewrites[0].destination !== '/api/handler') throw new Error('Vercel must route every preview path through the guarded handler route');
if (!existsSync(handlerPath)) throw new Error('Configured Vercel handler does not exist');

const serialized = JSON.stringify(config);
if (/PRIVATE_GATE_(?:VERIFIER|SESSION_SECRET)/.test(serialized)) throw new Error('Gate configuration must not be embedded in vercel.json');
const handler = readFileSync(handlerPath, 'utf8');
if (!/createDemoRequestHandler/.test(handler) || !/secureCookie:\s*true/.test(handler) || !/trustProxy:\s*true/.test(handler)) throw new Error('Vercel handler must use the shared guarded server with secure proxy behavior');

console.log('PASS vercel config: Node.js 24 handler, bundled public assets, guarded catch-all routing, and no embedded gate secrets');
