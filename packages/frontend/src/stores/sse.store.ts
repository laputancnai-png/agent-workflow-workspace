import { create } from 'zustand';

export type SSEStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

interface SSEState {
  status: SSEStatus;
  lastEventId: string | null;
  setStatus: (status: SSEStatus) => void;
  setLastEventId: (id: string) => void;
}

export const useSSEStore = create<SSEState>()((set) => ({
  status: 'idle',
  lastEventId: null,
  setStatus: (status) => set({ status }),
  setLastEventId: (lastEventId) => set({ lastEventId }),
}));
