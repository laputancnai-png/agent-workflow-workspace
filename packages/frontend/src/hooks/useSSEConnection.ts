import { useEffect, useRef } from 'react';
import { queryClient } from '../lib/query-client.js';
import { useSSEStore } from '../stores/sse.store.js';
import type { RunnerStatusPayload } from '../stores/sse.store.js';

const EVENT_TYPES = [
  'step.status_changed',
  'artifact.created',
  'agent_run.started',
  'agent_run.completed',
  'agent_run.failed',
  'runner.status_changed',
];

interface SSEEnvelope {
  event_type: string;
  workspace_id?: string;
  payload: Record<string, unknown>;
}

interface ParsedSSEEvent {
  id?: string;
  event?: string;
  data: string;
}

function parseSSESegment(segment: string): ParsedSSEEvent | null {
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of segment.split('\n')) {
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  const data = dataLines.join('\n');
  return data ? { id, event, data } : null;
}

export function useSSEConnection(workspaceId: string, token: string | null): void {
  const setStatus = useSSEStore((state) => state.setStatus);
  const setLastEventId = useSSEStore((state) => state.setLastEventId);
  const setRunnerStatus = useSSEStore((state) => state.setRunnerStatus);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!workspaceId || !token) return;

    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * 2 ** (reconnectAttemptRef.current - 1), 30_000);
      setStatus('reconnecting');
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const handleEvent = (eventId: string | undefined, rawData: string) => {
      if (eventId) setLastEventId(eventId);

      try {
        const envelope = JSON.parse(rawData) as SSEEnvelope;
        const { event_type, payload } = envelope;
        const runId = payload.run_id as string | undefined;

        if (event_type === 'step.status_changed' && runId) {
          queryClient.invalidateQueries({ queryKey: ['run', runId] });
        }
        if (event_type === 'artifact.created' && runId) {
          queryClient.invalidateQueries({ queryKey: ['run', runId, 'artifacts'] });
        }
        if (event_type.startsWith('agent_run.') && runId) {
          queryClient.invalidateQueries({ queryKey: ['run', runId] });
        }
        if (event_type === 'runner.status_changed') {
          setRunnerStatus(payload as unknown as RunnerStatusPayload);
        }
      } catch {
        // Ignore malformed realtime payloads; the next query refresh will reconcile state.
      }
    };

    const connect = async () => {
      try {
        setStatus('connecting');
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        };
        const currentLastEventId = useSSEStore.getState().lastEventId;
        if (currentLastEventId) headers['Last-Event-ID'] = currentLastEventId;

        const response = await fetch(`/api/v1/workspaces/${workspaceId}/events`, {
          method: 'GET',
          headers,
          signal: controller.signal,
          credentials: 'include'
        });

        if (!response.ok || !response.body) {
          setStatus('error');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let isOpen = false;

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const segments = buffer.split('\n\n');
          buffer = segments.pop() ?? '';

          if (!isOpen) {
            isOpen = true;
            reconnectAttemptRef.current = 0;
            setStatus('open');
          }

          for (const segment of segments.map((item) => item.trim()).filter(Boolean)) {
            const event = parseSSESegment(segment);
            if (event && (!event.event || EVENT_TYPES.includes(event.event))) {
              handleEvent(event.id, event.data);
            }
          }
        }

        if (!controller.signal.aborted) {
          scheduleReconnect();
        }
      } catch {
        if (!controller.signal.aborted) {
          scheduleReconnect();
        }
      }
    };

    void connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller.abort();
      setStatus('idle');
    };
  }, [setLastEventId, setRunnerStatus, setStatus, token, workspaceId]);
}
