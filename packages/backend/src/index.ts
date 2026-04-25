import 'dotenv/config';

import { buildApp } from './app.js';
import { startWatchdog } from './jobs/watchdog.js';
import { startSSERelay } from './lib/sse.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp();

startSSERelay();
startWatchdog();

await app.listen({ host, port });

console.log(`AWW Backend running on :${port}`);
