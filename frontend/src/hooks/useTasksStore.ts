import { create } from "zustand";

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
  latest_attempt?: TaskLatestAttempt | null;
}

export interface TaskRequirementItem {
  id: number;
  description: string;
}

export interface TaskFailedRequirementItem {
  id: number | null;
  description: string;
}

export interface TaskLatestAttempt {
  repo_name: string;
  completed_at: string | null;
  successful: boolean;
  failed_requirements: TaskFailedRequirementItem[];
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

if (typeof window !== "undefined") {
  window.localStorage.removeItem("tasks-search-store");
}

export const useTasksStore = create<TasksSearchStore>()((set) => ({
  ...initialState,
  setKeywordInput: (keywordInput) => set({ keywordInput }),
  setSelectedSkills: (selectedSkills) => set({ selectedSkills }),
  setSearchState: (state) => set(state),
  resetSearchState: () => set(initialState),
}));
