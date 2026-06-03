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
  setFilters: (filters) => set(filters),
  setResultsData: (results, found, totalPages) => set({ results, found, totalPages }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setHasSearched: (hasSearched) => set({ hasSearched }),
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
