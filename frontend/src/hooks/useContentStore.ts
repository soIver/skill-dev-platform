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

export interface TaskItem {
  id: number;
  description_preview: string;
  issued_count: number;
  average_rating: string;
  status: string;
}

export interface SkillTaskItem {
  proficiency_id: number;
  skill_name: string;
  level_name: string;
}

export interface TaskEditorData {
  description: string;
  check_repo: boolean;
  is_published: boolean;
  skills: SkillTaskItem[];
}

interface TasksState {
  keywordInput: string;
  results: TaskItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { keyword: string; page: number };
  
  // Editor state
  selectedId: number | "new" | null;
  editorData: TaskEditorData;
  hasUnsavedChanges: boolean;
  pendingSelectId: number | "new" | null; // Used for "unsaved changes" intercept
}

const initialSkillsState: SkillsState = {
  skillInput: "",
  levelInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { skill: "", level: "", page: 1 },
};

const initialTasksState: TasksState = {
  keywordInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { keyword: "", page: 1 },
  selectedId: null,
  editorData: { description: "", check_repo: false, is_published: false, skills: [] },
  hasUnsavedChanges: false,
  pendingSelectId: null,
};

interface ContentStore {
  skills: SkillsState;
  tasks: TasksState;
  setSkillsState: (state: Partial<SkillsState>) => void;
  resetSkillsState: () => void;
  setTasksState: (state: Partial<TasksState>) => void;
  resetTasksState: () => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  skills: initialSkillsState,
  tasks: initialTasksState,
  setSkillsState: (newState) =>
    set((state) => ({
      skills: { ...state.skills, ...newState },
    })),
  resetSkillsState: () => set({ skills: initialSkillsState }),
  setTasksState: (newState) =>
    set((state) => ({
      tasks: { ...state.tasks, ...newState },
    })),
  resetTasksState: () => set({ tasks: initialTasksState }),
}));
