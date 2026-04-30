import { buildApp as buildBackendApp } from '../../src/app.js';

export async function buildApp() {
  const app = await buildBackendApp();
  await app.ready();

  return app;
}
