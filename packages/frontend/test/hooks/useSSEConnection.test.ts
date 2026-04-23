import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSSEConnection } from '../../src/hooks/useSSEConnection.js';
import { useSSEStore } from '../../src/stores/sse.store.js';

class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (event: MessageEvent) => void) {
    this.listeners.set(type, fn);
  }

  close() {
    this.closed = true;
  }

  simulateOpen() {
    this.onopen?.();
  }
}

vi.stubGlobal('EventSource', MockEventSource);

afterEach(() => {
  MockEventSource.instances.length = 0;
  useSSEStore.setState({ status: 'idle', lastEventId: null });
});

describe('useSSEConnection', () => {
  it('sets status to connecting on mount', () => {
    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    expect(useSSEStore.getState().status).toBe('connecting');
  });

  it('sets status to open on EventSource open', () => {
    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    act(() => {
      MockEventSource.instances[0]?.simulateOpen();
    });
    expect(useSSEStore.getState().status).toBe('open');
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    unmount();
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });
});
