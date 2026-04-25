import { describe, expect, it } from 'vitest';

import { startWatchdog } from '../../src/jobs/watchdog.js';

describe('watchdog job', () => {
  it('exports startWatchdog', () => {
    expect(typeof startWatchdog).toBe('function');
  });
});
