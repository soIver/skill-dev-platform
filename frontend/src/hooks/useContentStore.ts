import { create } from "zustand";

export interface ProficiencyItem {
  id: number;
  skill_name: string;
  level_name: string;
  obtained_count: number;
}

interface SkillsState {
  skillInput: string;
  levelInput: string;
  results: ProficiencyItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { skill: string; level: string; page: number };
}

const initialSkillsState: SkillsState = {
  skillInput: "",
  levelInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { skill: "", level: "", page: 1 },
};

interface ContentStore {
  skills: SkillsState;
  setSkillsState: (state: Partial<SkillsState>) => void;
  resetSkillsState: () => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  skills: initialSkillsState,
  setSkillsState: (newState) =>
    set((state) => ({
      skills: { ...state.skills, ...newState },
    })),
  resetSkillsState: () => set({ skills: initialSkillsState }),
}));
