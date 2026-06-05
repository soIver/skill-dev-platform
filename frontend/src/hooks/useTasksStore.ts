import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TaskPublicSkillItem {
  skill_name: string;
  level_name: string;
}

export interface TaskPublicItem {
  id: number;
  title: string;
  description_preview: string;
  skills: TaskPublicSkillItem[];
  attached_repo_name?: string | null;
}

export interface SkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
}

interface TasksSearchStore {
  keywordInput: string;
  selectedSkills: SkillLevelItem[];
  results: TaskPublicItem[];
  currentPage: number;
  totalPages: number;
  hasSearched: boolean;
  lastSearchKeyword: string;
  lastSearchSkillIds: number[];
  setKeywordInput: (keywordInput: string) => void;
  setSelectedSkills: (selectedSkills: SkillLevelItem[]) => void;
  setSearchState: (state: {
    results: TaskPublicItem[];
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

export const useTasksStore = create<TasksSearchStore>()(
  persist(
    (set) => ({
      ...initialState,
      setKeywordInput: (keywordInput) => set({ keywordInput }),
      setSelectedSkills: (selectedSkills) => set({ selectedSkills }),
      setSearchState: (state) => set(state),
      resetSearchState: () => set(initialState),
    }),
    {
      name: "tasks-search-store",
    },
  ),
);
