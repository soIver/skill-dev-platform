import { create } from "zustand";

export interface VacancyAreaItem {
  id: string;
  name: string;
  full_name: string;
}

export interface VacancySearchItem {
  id: string;
  title: string;
  salary_text: string;
  tags: string[];
  employer_name: string;
  original_url: string;
}

export interface VacancySkillComparisonItem {
  id: number;
  skill_id: number;
  skill_name: string;
  current_level_name: string | null;
  current_order_index: number | null;
  required_level_name: string | null;
  required_order_index: number | null;
  required_score: number;
  is_satisfied: boolean;
}

export interface VacancyAnalysisRecommendation {
  id: string;
  content_type: "task" | "test";
  target_id: number;
  title: string;
  description: string | null;
  skill_name: string;
  current_level_name: string | null;
  required_level_name: string | null;
}

export interface VacancyAnalysisResponse {
  vacancy: VacancySearchItem;
  analyzed_at: string | null;
  is_analyzed: boolean;
  is_queued: boolean;
  skills: VacancySkillComparisonItem[];
  recommendations: VacancyAnalysisRecommendation[];
}

interface VacanciesState {
  description: string;
  excludedWords: string;
  salaryFrom: number;
  salaryTo: number;
  experience: string[];
  schedule: string[];
  education: string[];
  accreditedItEmployer: boolean;
  lessThan10Negotiations: boolean;
  onlyWithSalary: boolean;
  selectedAreas: VacancyAreaItem[];
  results: VacancySearchItem[];
  found: number;
  currentPage: number;
  totalPages: number;
  hasSearched: boolean;
  analysisUrl: string;
  analysisVacancy: VacancySearchItem | null;
  analysisResult: VacancyAnalysisResponse | null;
  analysisIsLoading: boolean;
  analysisIsAnalyzing: boolean;
  analysisCurrentPage: number;
  setFilters: (
    filters: Partial<
      Pick<
        VacanciesState,
        | "description"
        | "excludedWords"
        | "salaryFrom"
        | "salaryTo"
        | "experience"
        | "schedule"
        | "education"
        | "accreditedItEmployer"
        | "lessThan10Negotiations"
        | "onlyWithSalary"
        | "selectedAreas"
      >
    >
  ) => void;
  setResultsData: (results: VacancySearchItem[], found: number, totalPages: number) => void;
  setCurrentPage: (page: number) => void;
  setHasSearched: (hasSearched: boolean) => void;
  setAnalysisState: (state: Partial<Pick<
    VacanciesState,
    | "analysisUrl"
    | "analysisVacancy"
    | "analysisResult"
    | "analysisIsLoading"
    | "analysisIsAnalyzing"
    | "analysisCurrentPage"
  >>) => void;
  resetAnalysisState: () => void;
  resetState: () => void;
}

export const useVacanciesStore = create<VacanciesState>((set) => ({
  description: "",
  excludedWords: "",
  salaryFrom: 0,
  salaryTo: 1000000,
  experience: [],
  schedule: [],
  education: [],
  accreditedItEmployer: false,
  lessThan10Negotiations: false,
  onlyWithSalary: false,
  selectedAreas: [],
  results: [],
  found: 0,
  currentPage: 1,
  totalPages: 1,
  hasSearched: false,
  analysisUrl: "",
  analysisVacancy: null,
  analysisResult: null,
  analysisIsLoading: false,
  analysisIsAnalyzing: false,
  analysisCurrentPage: 1,
  setFilters: (filters) => set(filters),
  setResultsData: (results, found, totalPages) => set({ results, found, totalPages }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setHasSearched: (hasSearched) => set({ hasSearched }),
  setAnalysisState: (state) => set(state),
  resetAnalysisState: () =>
    set({
      analysisUrl: "",
      analysisVacancy: null,
      analysisResult: null,
      analysisIsLoading: false,
      analysisIsAnalyzing: false,
      analysisCurrentPage: 1,
    }),
  resetState: () =>
    set({
      description: "",
      excludedWords: "",
      salaryFrom: 0,
      salaryTo: 1000000,
      experience: [],
      schedule: [],
      education: [],
      accreditedItEmployer: false,
      lessThan10Negotiations: false,
      onlyWithSalary: false,
      selectedAreas: [],
      results: [],
      found: 0,
      currentPage: 1,
      totalPages: 1,
      hasSearched: false,
    }),
}));
