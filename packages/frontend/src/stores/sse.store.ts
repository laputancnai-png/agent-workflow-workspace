import { create } from 'zustand';

export type SSEStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

export interface RunnerStatusPayload {
  runner_id: string;
  machine_id: string;
  status: 'online' | 'offline' | 'draining';
  capabilities: string[];
}

interface SSEState {
  status: SSEStatus;
  lastEventId: string | null;
  runnerStatuses: Record<string, RunnerStatusPayload>;
  setStatus: (status: SSEStatus) => void;
  setLastEventId: (id: string) => void;
  setRunnerStatus: (payload: RunnerStatusPayload) => void;
}

export const useSSEStore = create<SSEState>()((set) => ({
  status: 'idle',
  lastEventId: null,
  runnerStatuses: {},
  setStatus: (status) => set({ status }),
  setLastEventId: (lastEventId) => set({ lastEventId }),
  setRunnerStatus: (payload) =>
    set((state) => ({
      runnerStatuses: { ...state.runnerStatuses, [payload.runner_id]: payload },
    })),
}));
