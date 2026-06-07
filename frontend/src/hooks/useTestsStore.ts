import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SkillLevelItem } from "./useTasksStore";

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
  results: TestPublicItem[];
  currentPage: number;
  totalPages: number;
  hasSearched: boolean;
  lastSearchKeyword: string;
  lastSearchSkillIds: number[];
  setKeywordInput: (keywordInput: string) => void;
  setSelectedSkills: (selectedSkills: SkillLevelItem[]) => void;
  setSearchState: (state: {
    results: TestPublicItem[];
    currentPage: number;
    totalPages: number;
    hasSearched: boolean;
    lastSearchKeyword: string;
    lastSearchSkillIds: number[];
  }) => void;
  resetSearchState: () => void;
}

const initialState = {
  keywordInput: "",
  selectedSkills: [],
  results: [],
  currentPage: 1,
  totalPages: 1,
  hasSearched: false,
  lastSearchKeyword: "",
  lastSearchSkillIds: [] as number[],
};

export const useTestsStore = create<TestsSearchStore>()(
  persist(
    (set) => ({
      ...initialState,
      setKeywordInput: (keywordInput) => set({ keywordInput }),
      setSelectedSkills: (selectedSkills) => set({ selectedSkills }),
      setSearchState: (state) => set(state),
      resetSearchState: () => set(initialState),
    }),
    {
      name: "tests-search-store",
    },
  ),
);
