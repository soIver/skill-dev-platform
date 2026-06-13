import { create } from "zustand";

export interface TestItem {
  id: number;
  skill_name: string;
  level_name: string;
  variant_number: number;
  attempts_count: number;
  passed_count: number;
  status: string;
}

export interface AnswerEditorItem {
  id: string | number;
  answer_text: string;
  is_correct: boolean;
}

export interface QuestionEditorItem {
  id: string | number;
  question_text: string;
  points: number;
  is_expanded?: boolean;
  answers: AnswerEditorItem[];
}

export interface TestEditorData {
  description: string;
  time_limit_minutes: number | null;
  threshold_score: number | null;
  is_published: boolean;
  skill_level_id: number | null;
  skill_name?: string;
  level_name?: string;
  variant_number?: number;
  ps_functions: PsFunctionItem[];
  questions: QuestionEditorItem[];
}

interface TestsState {
  keywordInput: string;
  skillInput: string;
  ownerId: number | null;
  ownerUsername: string;
  results: TestItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { keyword: string; skill: string; ownerId: number | null; page: number };
  
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

export interface PsFunctionItem {
  id: number;
  code: number;
  name: string;
}

export interface TaskItem {
  id: number;
  title: string;
  description_preview: string;
  issued_count: number;
  average_rating: string;
  status: string;
}

export interface TaskEditorData {
  title: string;
  description: string;
  is_published: boolean;
  skills: SkillTaskItem[];
  ps_functions: PsFunctionItem[];
}

interface TasksState {
  keywordInput: string;
  skillInput: string;
  ownerId: number | null;
  ownerUsername: string;
  results: TaskItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { keyword: string; skill: string; ownerId: number | null; page: number };
  
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
  ownerId: number | null;
  ownerUsername: string;
  results: SkillLevelItem[];
  currentPage: number;
  totalPages: number;
  lastSearch: { skill: string; level: string; ownerId: number | null; page: number };

  // состояние редактора
  selectedId: number | null;
  editorData: SkillEditorData;
  hasUnsavedChanges: boolean;
  pendingSelectId: number | null;
}

export interface ClassifierFunctionTreeItem {
  id: number;
  code: number;
  name: string;
}

export interface ClassifierGroupTreeItem {
  id: number;
  code: string;
  name: string;
  qualification_level: number;
  functions: ClassifierFunctionTreeItem[];
}

export interface ClassifierProfStandardTreeItem {
  id: number;
  code: number;
  name: string;
  groups: ClassifierGroupTreeItem[];
}

export interface ClassifierGroupSummary {
  id: number;
  code: string;
  name: string;
  qualification_level: number;
}

export interface ClassifierFunctionSummary {
  id: number;
  code: number;
  name: string;
}

export type ClassifierEditorData =
  | {
    kind: "ps";
    id: number | "new";
    codeInput: string;
    name: string;
    description: string;
    groups: ClassifierGroupSummary[];
  }
  | {
    kind: "group";
    id: number | "new";
    code: string;
    name: string;
    qualification_level: number;
    prof_standard: { id: number; code: number; name: string };
    functions: ClassifierFunctionSummary[];
  }
  | {
    kind: "function";
    id: number | "new";
    code: number;
    name: string;
    functions_group: { id: number; code: string; name: string; qualification_level: number };
    prof_standard: { id: number; code: number; name: string };
  };

export type ClassifierPendingAction =
  | { type: "load-ps"; id: number }
  | { type: "load-group"; id: number }
  | { type: "load-function"; id: number }
  | { type: "new-ps" }
  | { type: "new-group"; standard: { id: number; code: number; name: string }; code: string }
  | { type: "new-function"; standard: { id: number; code: number; name: string }; group: { id: number; code: string; name: string; qualification_level: number }; code: number };

interface ClassifierState {
  queryInput: string;
  results: ClassifierProfStandardTreeItem[];
  lastSearch: { query: string };
  hasLoaded: boolean;
  editorData: ClassifierEditorData | null;
  hasUnsavedChanges: boolean;
  pendingAction: ClassifierPendingAction | null;
}

const initialSkillsState: SkillsState = {
  skillInput: "",
  levelInput: "",
  ownerId: null,
  ownerUsername: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { skill: "", level: "", ownerId: null, page: 1 },
  selectedId: null,
  editorData: { ...emptyEditorData },
  hasUnsavedChanges: false,
  pendingSelectId: null,
};

const initialTasksState: TasksState = {
  keywordInput: "",
  skillInput: "",
  ownerId: null,
  ownerUsername: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { keyword: "", skill: "", ownerId: null, page: 1 },
  selectedId: null,
  editorData: { title: "", description: "", is_published: false, skills: [], ps_functions: [] },
  hasUnsavedChanges: false,
  pendingSelectId: null,
};

const initialTestsState: TestsState = {
  keywordInput: "",
  skillInput: "",
  ownerId: null,
  ownerUsername: "",
  results: [],
  currentPage: 1,
  totalPages: 1,
  lastSearch: { keyword: "", skill: "", ownerId: null, page: 1 },
  selectedId: null,
  editorData: { description: "", time_limit_minutes: null, threshold_score: null, is_published: false, skill_level_id: null, ps_functions: [], questions: [] },
  hasUnsavedChanges: false,
  pendingSelectId: null,
};

const initialClassifierState: ClassifierState = {
  queryInput: "",
  results: [],
  lastSearch: { query: "" },
  hasLoaded: false,
  editorData: null,
  hasUnsavedChanges: false,
  pendingAction: null,
};

interface ContentStore {
  skills: SkillsState;
  tasks: TasksState;
  tests: TestsState;
  classifier: ClassifierState;
  setSkillsState: (state: Partial<SkillsState>) => void;
  resetSkillsState: () => void;
  setTasksState: (state: Partial<TasksState>) => void;
  resetTasksState: () => void;
  setTestsState: (state: Partial<TestsState>) => void;
  resetTestsState: () => void;
  setClassifierState: (state: Partial<ClassifierState>) => void;
  resetClassifierState: () => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  skills: initialSkillsState,
  tasks: initialTasksState,
  tests: initialTestsState,
  classifier: initialClassifierState,
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
  setClassifierState: (newState) =>
    set((state) => ({
      classifier: { ...state.classifier, ...newState },
    })),
  resetClassifierState: () => set({ classifier: initialClassifierState }),
}));
