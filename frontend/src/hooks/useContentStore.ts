import { create } from "zustand";

export interface TestItem {
  id: number;
  skill_name: string;
  level_name: string;
  attempts_count: number;
  passed_count: number;
  status: string;
}

export interface TestEditorData {
  time_limit_minutes: number | null;
  threshold_score: number | null;
  is_published: boolean;
  skill_level_id: number | null;
}

interface TestsState {
  searchInput: string;
  results: TestItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { search: string; page: number };
  
  selectedId: number | "new" | null;
  editorData: TestEditorData;
  hasUnsavedChanges: boolean;
  pendingSelectId: number | "new" | null;
}

export interface SkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
  obtained_count: number;
}

export interface SkillTaskItem {
  skill_level_id: number;
  skill_name: string;
  level_name: string;
}

export interface TaskItem {
  id: number;
  description_preview: string;
  issued_count: number;
  average_rating: string;
  status: string;
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
  
  // состояние редактора
  selectedId: number | "new" | null;
  editorData: TaskEditorData;
  hasUnsavedChanges: boolean;
  pendingSelectId: number | "new" | null;
}

// типы для редактора навыков
export interface LevelEditorItem {
  id: number;
  level_name: string;
  order_index: number;
}

export interface SkillRelationEditorItem {
  skill_id: number;
  skill_name: string;
  incoming_id: number | null;
  incoming_weight: number | null;
  outgoing_id: number | null;
  outgoing_weight: number | null;
}

export interface SkillEditorData {
  skill_id: number;
  skill_name: string;
  levels: LevelEditorItem[];
  relations: SkillRelationEditorItem[];
}

const emptyEditorData: SkillEditorData = {
  skill_id: 0,
  skill_name: "",
  levels: [],
  relations: [],
};

interface SkillsState {
  skillInput: string;
  levelInput: string;
  results: SkillLevelItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { skill: string; level: string; page: number };

  // состояние редактора
  selectedId: number | null;
  editorData: SkillEditorData;
  hasUnsavedChanges: boolean;
  pendingSelectId: number | null;
}

const initialSkillsState: SkillsState = {
  skillInput: "",
  levelInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { skill: "", level: "", page: 1 },
  selectedId: null,
  editorData: { ...emptyEditorData },
  hasUnsavedChanges: false,
  pendingSelectId: null,
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

const initialTestsState: TestsState = {
  searchInput: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { search: "", page: 1 },
  selectedId: null,
  editorData: { time_limit_minutes: null, threshold_score: null, is_published: false, skill_level_id: null },
  hasUnsavedChanges: false,
  pendingSelectId: null,
};

interface ContentStore {
  skills: SkillsState;
  tasks: TasksState;
  tests: TestsState;
  setSkillsState: (state: Partial<SkillsState>) => void;
  resetSkillsState: () => void;
  setTasksState: (state: Partial<TasksState>) => void;
  resetTasksState: () => void;
  setTestsState: (state: Partial<TestsState>) => void;
  resetTestsState: () => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  skills: initialSkillsState,
  tasks: initialTasksState,
  tests: initialTestsState,
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
  setTestsState: (newState) =>
    set((state) => ({
      tests: { ...state.tests, ...newState },
    })),
  resetTestsState: () => set({ tests: initialTestsState }),
}));
