import { useEffect } from 'react';
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

export function useSSEConnection(workspaceId: string, token: string | null): void {
  const setStatus = useSSEStore((state) => state.setStatus);
  const setLastEventId = useSSEStore((state) => state.setLastEventId);
  const lastEventId = useSSEStore((state) => state.lastEventId);

  useEffect(() => {
    if (!workspaceId || !token) return;

    setStatus('connecting');
    const params = new URLSearchParams({ token });
    if (lastEventId) params.set('lastEventId', lastEventId);

    const eventSource = new EventSource(`/api/v1/workspaces/${workspaceId}/events?${params.toString()}`);

    eventSource.onopen = () => setStatus('open');
    eventSource.onerror = () => setStatus('reconnecting');

    const handleEvent = (event: MessageEvent) => {
      if (event.lastEventId) setLastEventId(event.lastEventId);

      try {
        const payload = JSON.parse(event.data as string) as RealtimeEvent;
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

    EVENT_TYPES.forEach((type) => eventSource.addEventListener(type, handleEvent));

    return () => {
      eventSource.close();
      setStatus('idle');
    };
  }, [lastEventId, setLastEventId, setStatus, token, workspaceId]);
}
