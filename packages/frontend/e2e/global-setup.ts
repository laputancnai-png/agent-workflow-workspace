import { chromium } from '@playwright/test';

const BACKEND_URL = 'http://localhost:3000';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

async function waitForBackend(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        console.log('[global-setup] Backend is healthy.');
        return;
      }
    } catch {
      // backend not ready yet
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`[global-setup] Backend at ${BACKEND_URL} did not become healthy after ${MAX_RETRIES} attempts.`);
}

export default async function globalSetup(): Promise<void> {
  await waitForBackend();

  // Verify test-login endpoint is available (non-production only)
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'setup-probe@e2e.test' }),
  });

  if (response.status === 403) {
    throw new Error('[global-setup] test-login endpoint returned 403 — is NODE_ENV set to production?');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[global-setup] test-login probe failed: ${response.status} ${text}`);
  }

  console.log('[global-setup] test-login endpoint verified. Starting E2E suite.');

  // Install browser if needed
  const browser = await chromium.launch();
  await browser.close();
}
