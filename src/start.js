import { createDemoServer } from './server.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '3000');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');

const server = createDemoServer();
server.listen(port, host, () => {
  console.log(`NON-PRODUCTION synthetic demo listening on http://${host}:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
