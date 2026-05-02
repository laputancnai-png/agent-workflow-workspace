import 'dotenv/config';

import { buildApp } from './app.js';
import { startWatchdog } from './jobs/watchdog.js';
import { startSSERelay } from './lib/sse.js';
import { startEmbeddedWorker } from './services/embedded-worker/index.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp();

startSSERelay();
startWatchdog();

const worker = startEmbeddedWorker();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await worker.stop();
  await app.close();
  process.exit(0);
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host, port });

app.log.info(`AWW Backend running on :${port}`);
