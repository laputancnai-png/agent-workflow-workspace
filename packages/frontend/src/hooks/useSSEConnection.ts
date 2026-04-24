import { useEffect, useRef } from 'react';
import { queryClient } from '../lib/query-client.js';
import { useSSEStore } from '../stores/sse.store.js';

const EVENT_TYPES = [
  'step.status_changed',
  'artifact.created',
  'agent_run.started',
  'agent_run.completed',
  'agent_run.failed'
];

interface RealtimeEvent {
  event_type: string;
  run_id?: string;
  step_id?: string;
}

interface ParsedSSEEvent {
  id?: string;
  event?: string;
  data: string;
}

function parseSSEChunk(chunk: string): ParsedSSEEvent[] {
  return chunk
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const parsed: ParsedSSEEvent = { data: '' };

      for (const line of block.split('\n')) {
        if (line.startsWith('id:')) parsed.id = line.slice(3).trim();
        if (line.startsWith('event:')) parsed.event = line.slice(6).trim();
        if (line.startsWith('data:')) parsed.data += line.slice(5).trim();
      }

      return parsed;
    })
    .filter((event) => event.data);
}

export function useSSEConnection(workspaceId: string, token: string | null): void {
  const setStatus = useSSEStore((state) => state.setStatus);
  const setLastEventId = useSSEStore((state) => state.setLastEventId);
  const lastEventId = useSSEStore((state) => state.lastEventId);
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
        const payload = JSON.parse(rawData) as RealtimeEvent;
        if (payload.event_type === 'step.status_changed' && payload.run_id) {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id] });
        }
        if (payload.event_type === 'artifact.created' && payload.run_id) {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id, 'artifacts'] });
        }
        if (payload.event_type.startsWith('agent_run.') && payload.run_id) {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id] });
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
        if (lastEventId) headers['Last-Event-ID'] = lastEventId;

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

          for (const event of segments.flatMap(parseSSEChunk)) {
            if (!event.event || EVENT_TYPES.includes(event.event)) {
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
  }, [lastEventId, setLastEventId, setStatus, token, workspaceId]);
}
