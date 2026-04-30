import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSEConnection } from '../../src/hooks/useSSEConnection.js';
import { useSSEStore } from '../../src/stores/sse.store.js';

function createReader(chunks: string[], keepOpen = false) {
  let index = 0;

  return {
    read: vi.fn(async () => {
      if (index >= chunks.length) {
        if (keepOpen) {
          return new Promise(() => undefined);
        }
        return { done: true, value: undefined };
      }

      const value = new TextEncoder().encode(chunks[index]);
      index += 1;
      return { done: false, value };
    }),
    releaseLock: vi.fn()
  };
}

describe('useSSEConnection', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    window.fetch = fetchMock as typeof window.fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    useSSEStore.setState({ status: 'idle', lastEventId: null });
  });

  it('sets status to connecting on mount', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => createReader([]) }
    });

    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    expect(useSSEStore.getState().status).toBe('connecting');
  });

  it('sends Authorization and Last-Event-ID headers and opens on first event', async () => {
    useSSEStore.setState({ status: 'idle', lastEventId: 'evt-1' });
    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () =>
          createReader(
            ['id: evt-2\nevent: step.status_changed\ndata: {"event_type":"step.status_changed","run_id":"run_1"}\n\n'],
            true
          )
      }
    });

    renderHook(() => useSSEConnection('ws_1', 'token_abc'));

    await waitFor(() => expect(useSSEStore.getState().status).toBe('open'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/ws_1/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token_abc',
          'Last-Event-ID': 'evt-1'
        })
      })
    );
    expect(useSSEStore.getState().lastEventId).toBe('evt-2');
  });

  it('aborts fetch on unmount', async () => {
    let abortSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      abortSignal = init?.signal as AbortSignal;
      return {
        ok: true,
        body: { getReader: () => createReader([]) }
      };
    });

    const { unmount } = renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    await act(async () => {
      unmount();
    });

    expect(abortSignal?.aborted).toBe(true);
  });

  it('backs off before reconnecting after failure', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('network down'));

    renderHook(() => useSSEConnection('ws_1', 'token_abc'));

    await act(async () => {
      await Promise.resolve();
    });
    expect(useSSEStore.getState().status).toBe('reconnecting');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('uses exponential backoff up to 30s and resets after success', async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    fetchMock
      .mockRejectedValueOnce(new Error('down-1'))
      .mockRejectedValueOnce(new Error('down-2'))
      .mockRejectedValueOnce(new Error('down-3'))
      .mockRejectedValueOnce(new Error('down-4'))
      .mockRejectedValueOnce(new Error('down-5'))
      .mockRejectedValueOnce(new Error('down-6'))
      .mockResolvedValue({
        ok: true,
        body: {
          getReader: () =>
            createReader(['id: evt-9\nevent: step.status_changed\ndata: {"event_type":"step.status_changed","run_id":"run_ok"}\n\n'])
        }
      });

    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(1999);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      vi.advanceTimersByTime(8000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await act(async () => {
      vi.advanceTimersByTime(16000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(
      timeoutSpy.mock.calls.map((call) => call[1]).filter((delay): delay is number => typeof delay === 'number')
    ).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 1000]);
    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
