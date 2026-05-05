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

export interface RecommendationItem {
  id: number;
  description_preview: string;
  issued_count: number;
  average_rating: string;
  status: string;
}

interface RecommendationsState {
  keywordInput: string;
  results: RecommendationItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { keyword: string; page: number };
}

const initialSkillsState: SkillsState = {
  skillInput: "",
  levelInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { skill: "", level: "", page: 1 },
};

const initialRecommendationsState: RecommendationsState = {
  keywordInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { keyword: "", page: 1 },
};

interface ContentStore {
  skills: SkillsState;
  recommendations: RecommendationsState;
  setSkillsState: (state: Partial<SkillsState>) => void;
  resetSkillsState: () => void;
  setRecommendationsState: (state: Partial<RecommendationsState>) => void;
  resetRecommendationsState: () => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  skills: initialSkillsState,
  recommendations: initialRecommendationsState,
  setSkillsState: (newState) =>
    set((state) => ({
      skills: { ...state.skills, ...newState },
    })),
  resetSkillsState: () => set({ skills: initialSkillsState }),
  setRecommendationsState: (newState) =>
    set((state) => ({
      recommendations: { ...state.recommendations, ...newState },
    })),
  resetRecommendationsState: () => set({ recommendations: initialRecommendationsState }),
}));
