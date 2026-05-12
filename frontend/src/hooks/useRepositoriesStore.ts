import { create } from "zustand";

export interface RepoItem {
  id: string;
  name: string;
  url: string;
  description?: string;
  analyzed_at: string | null;
  last_commit_date: string | null;
  status: "Доступен" | "Недоступен" | "Проверен" | "В процессе...";
}

interface RepositoriesState {
  repos: RepoItem[];
  totalPages: number;
  fetchedPages: number[];
  isInitialized: boolean;
  setReposData: (repos: RepoItem[], totalPages: number, fetchedPages: number[]) => void;
  updateRepoStatus: (repoName: string, status: RepoItem["status"]) => void;
  addRepos: (newRepos: RepoItem[], fetchedPage: number) => void;
  resetState: () => void;
}

export const useRepositoriesStore = create<RepositoriesState>((set) => ({
  repos: [],
  totalPages: 1,
  fetchedPages: [],
  isInitialized: false,
  setReposData: (repos, totalPages, fetchedPages) =>
    set({ repos, totalPages, fetchedPages, isInitialized: true }),
  updateRepoStatus: (repoName, status) =>
    set((state) => ({
      repos: state.repos.map((r) => (r.name === repoName ? { ...r, status } : r)),
    })),
  addRepos: (newRepos, fetchedPage) =>
    set((state) => {
      const merged = [...state.repos];
      for (const item of newRepos) {
        if (!merged.find((i) => i.name === item.name)) {
          merged.push(item);
        }
      }
      return {
        repos: merged,
        fetchedPages: state.fetchedPages.includes(fetchedPage)
          ? state.fetchedPages
          : [...state.fetchedPages, fetchedPage],
      };
    }),
  resetState: () =>
    set({ repos: [], totalPages: 1, fetchedPages: [], isInitialized: false }),
}));
