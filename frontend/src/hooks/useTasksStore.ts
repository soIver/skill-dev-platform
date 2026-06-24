import { create } from "zustand";
import type { PsFunctionItem } from "./useContentStore";

export interface TaskPublicSkillItem {
  skill_level_id: number;
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
  analysis_status?: TaskAnalysisStatus | null;
  analysis_repo_name?: string | null;
  analysis_repo_url?: string | null;
  ps_functions: PsFunctionItem[];
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
  repo_url?: string | null;
  completed_at: string | null;
  successful: boolean;
  failed_requirements: TaskFailedRequirementItem[];
}

export type TaskAnalysisStatus = "preparing" | "processing";

interface TasksSearchStore {
  keywordInput: string;
  onlyUncompleted: boolean;
  selectedPsFunctions: PsFunctionItem[];
  results: TaskPublicItem[];
  currentPage: number;
  totalPages: number;
  hasSearched: boolean;
  lastSearchKeyword: string;
  lastSearchOnlyUncompleted: boolean;
  lastSearchPsFunctionIds: number[];
  setKeywordInput: (keywordInput: string) => void;
  setOnlyUncompleted: (onlyUncompleted: boolean) => void;
  setSelectedPsFunctions: (selectedPsFunctions: PsFunctionItem[]) => void;
  setSearchState: (state: {
    results: TaskPublicItem[];
    currentPage: number;
    totalPages: number;
    hasSearched: boolean;
    lastSearchKeyword: string;
    lastSearchOnlyUncompleted: boolean;
    lastSearchPsFunctionIds: number[];
  }) => void;
  setTaskAnalysisStatus: (
    taskId: number,
    status: TaskAnalysisStatus | null,
    repo?: { name?: string | null; url?: string | null },
  ) => void;
  updateTaskLatestAttempt: (taskId: number, latestAttempt: TaskLatestAttempt) => void;
  resetSearchState: () => void;
}

const initialState = {
  keywordInput: "",
  onlyUncompleted: false,
  selectedPsFunctions: [],
  results: [],
  currentPage: 1,
  totalPages: 1,
  hasSearched: false,
  lastSearchKeyword: "",
  lastSearchOnlyUncompleted: false,
  lastSearchPsFunctionIds: [] as number[],
};

if (typeof window !== "undefined") {
  window.localStorage.removeItem("tasks-search-store");
}

export const useTasksStore = create<TasksSearchStore>()((set) => ({
  ...initialState,
  setKeywordInput: (keywordInput) => set({ keywordInput }),
  setOnlyUncompleted: (onlyUncompleted) => set({ onlyUncompleted }),
  setSelectedPsFunctions: (selectedPsFunctions) => set({ selectedPsFunctions }),
  setSearchState: (newState) => set((state) => {
    const currentTasksById = new Map(state.results.map((task) => [task.id, task]));
    return {
      ...newState,
      results: newState.results.map((task) => {
        const currentTask = currentTasksById.get(task.id);
        if (!currentTask?.analysis_status) return task;
        return {
          ...task,
          analysis_status: currentTask.analysis_status,
          analysis_repo_name: currentTask.analysis_repo_name,
          analysis_repo_url: currentTask.analysis_repo_url,
        };
      }),
    };
  }),
  setTaskAnalysisStatus: (taskId, status, repo) => set((state) => ({
    results: state.results.map((task) => (
      task.id === taskId
        ? {
            ...task,
            analysis_status: status,
            analysis_repo_name: status ? repo?.name ?? task.analysis_repo_name ?? null : null,
            analysis_repo_url: status ? repo?.url ?? task.analysis_repo_url ?? null : null,
          }
        : task
    )),
  })),
  updateTaskLatestAttempt: (taskId, latestAttempt) => set((state) => ({
    results: state.results.map((task) => (
      task.id === taskId
        ? {
            ...task,
            analysis_status: null,
            analysis_repo_name: null,
            analysis_repo_url: null,
            attached_repo_name: latestAttempt.successful ? latestAttempt.repo_name : null,
            latest_attempt: latestAttempt,
          }
        : task
    )),
  })),
  resetSearchState: () => set(initialState),
}));
