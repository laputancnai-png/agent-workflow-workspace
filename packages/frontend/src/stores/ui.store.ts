import { create } from 'zustand';

interface UIState {
  selectedStepId: string | null;
  selectedArtifactId: string | null;
  isFindingSelOpen: boolean;
  isTakeOverModalOpen: boolean;
  isEditOutputOpen: boolean;
  editOutputStepId: string | null;
  editOutputArtifactId: string | null;
  selectStep: (id: string | null) => void;
  selectArtifact: (id: string | null) => void;
  openFindingSel: () => void;
  closeFindingSel: () => void;
  openTakeOverModal: () => void;
  closeTakeOverModal: () => void;
  openEditOutput: (stepId: string, artifactId: string | null) => void;
  closeEditOutput: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedStepId: null,
  selectedArtifactId: null,
  isFindingSelOpen: false,
  isTakeOverModalOpen: false,
  isEditOutputOpen: false,
  editOutputStepId: null,
  editOutputArtifactId: null,
  selectStep: (selectedStepId) => set({ selectedStepId }),
  selectArtifact: (selectedArtifactId) => set({ selectedArtifactId }),
  openFindingSel: () => set({ isFindingSelOpen: true }),
  closeFindingSel: () => set({ isFindingSelOpen: false }),
  openTakeOverModal: () => set({ isTakeOverModalOpen: true }),
  closeTakeOverModal: () => set({ isTakeOverModalOpen: false }),
  openEditOutput: (editOutputStepId, editOutputArtifactId) =>
    set({ isEditOutputOpen: true, editOutputStepId, editOutputArtifactId }),
  closeEditOutput: () =>
    set({ isEditOutputOpen: false, editOutputStepId: null, editOutputArtifactId: null }),
}));
