const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL не задан в .env!");
}

export const config = {
  apiBaseUrl: API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL,
};

export const TASK = {
  DESCRIPTION: {
    MIN_LENGTH: 32,
    MAX_LENGTH: 2048,
  },
  SEARCH_KEYWORDS: {
    MAX_LENGTH: 32,

  }
} as const;

export const PROFICIENCY = {
  SEARCH_SKILL: {
    MAX_LENGTH: 32,
  },
  SEARCH_LEVEL: {
    MAX_LENGTH: 32,
  },
} as const;

export const SEARCH_DEBOUNCE_MS = 1000;

export const REPOSITORIES_PER_PAGE = 10;