import { create } from "zustand";

export interface CuratorManagementItem {
  id: number | string;
  kind: "user" | "invitation";
  username?: string | null;
  email: string;
  role?: "curator" | "admin" | null;
  tests_count?: number | null;
  skills_count?: number | null;
  tasks_count?: number | null;
}

interface ManagementState {
  query: string;
  results: CuratorManagementItem[];
  currentPage: number;
  totalPages: number;
  hasLoaded: boolean;
  lastSearch: { query: string; page: number };
  setManagementState: (state: Partial<Omit<ManagementState, "setManagementState" | "resetManagementState">>) => void;
  resetManagementState: () => void;
}

const initialState = {
  query: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  hasLoaded: false,
  lastSearch: { query: "", page: 1 },
};

export const useManagementStore = create<ManagementState>((set) => ({
  ...initialState,
  setManagementState: (newState) => set((state) => ({ ...state, ...newState })),
  resetManagementState: () => set(initialState),
}));
