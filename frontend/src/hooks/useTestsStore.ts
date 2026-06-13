import { create } from "zustand";
import type { PsFunctionItem } from "./useContentStore";

export interface SkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
}

export interface TestPublicLevelItem {
  id: number;
  test_id: number;
  skill_level_id: number;
  level_name: string;
  description_preview: string;
  question_count: number;
  total_score: number;
  threshold_score: number;
  time_limit_minutes: number;
  latest_attempt_score: number | null;
  latest_attempt_total_score: number | null;
  latest_attempt_threshold_score: number | null;
  latest_attempt_completed_at: string | null;
  latest_attempt_passed: boolean | null;
  next_attempt_at: string | null;
  can_start_attempt: boolean;
}

export interface TestPublicItem {
  id: number;
  skill_id: number;
  skill_name: string;
  levels: TestPublicLevelItem[];
}

interface TestsSearchStore {
  keywordInput: string;
  selectedSkills: SkillLevelItem[];
  selectedPsFunctions: PsFunctionItem[];
  results: TestPublicItem[];
  currentPage: number;
  totalPages: number;
  hasSearched: boolean;
  lastSearchKeyword: string;
  lastSearchSkillIds: number[];
  lastSearchPsFunctionIds: number[];
  setKeywordInput: (keywordInput: string) => void;
  setSelectedSkills: (selectedSkills: SkillLevelItem[]) => void;
  setSelectedPsFunctions: (selectedPsFunctions: PsFunctionItem[]) => void;
  setSearchState: (state: {
    results: TestPublicItem[];
    currentPage: number;
    totalPages: number;
    hasSearched: boolean;
    lastSearchKeyword: string;
    lastSearchSkillIds: number[];
    lastSearchPsFunctionIds: number[];
  }) => void;
  resetSearchState: () => void;
}

const initialState = {
  keywordInput: "",
  selectedSkills: [],
  selectedPsFunctions: [],
  results: [],
  currentPage: 1,
  totalPages: 1,
  hasSearched: false,
  lastSearchKeyword: "",
  lastSearchSkillIds: [] as number[],
  lastSearchPsFunctionIds: [] as number[],
};

export const useTestsStore = create<TestsSearchStore>()((set) => ({
  ...initialState,
  setKeywordInput: (keywordInput) => set({ keywordInput }),
  setSelectedSkills: (selectedSkills) => set({ selectedSkills }),
  setSelectedPsFunctions: (selectedPsFunctions) => set({ selectedPsFunctions }),
  setSearchState: (state) => set(state),
  resetSearchState: () => set(initialState),
}));
