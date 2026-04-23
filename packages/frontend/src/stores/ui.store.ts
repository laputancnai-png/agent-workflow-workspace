import { create } from 'zustand';

interface UIState {
  selectedStepId: string | null;
  selectedArtifactId: string | null;
  isFindingSelOpen: boolean;
  isTakeOverModalOpen: boolean;
  selectStep: (id: string | null) => void;
  selectArtifact: (id: string | null) => void;
  openFindingSel: () => void;
  closeFindingSel: () => void;
  openTakeOverModal: () => void;
  closeTakeOverModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedStepId: null,
  selectedArtifactId: null,
  isFindingSelOpen: false,
  isTakeOverModalOpen: false,
  selectStep: (selectedStepId) => set({ selectedStepId }),
  selectArtifact: (selectedArtifactId) => set({ selectedArtifactId }),
  openFindingSel: () => set({ isFindingSelOpen: true }),
  closeFindingSel: () => set({ isFindingSelOpen: false }),
  openTakeOverModal: () => set({ isTakeOverModalOpen: true }),
  closeTakeOverModal: () => set({ isTakeOverModalOpen: false })
}));
