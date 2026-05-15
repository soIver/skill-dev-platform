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
  TITLE: {
    MIN_LENGTH: 4,
    MAX_LENGTH: 48,
  },
  DESCRIPTION: {
    MIN_LENGTH: 64,
    MAX_LENGTH: 2048,
  },
  SEARCH_KEYWORDS: {
    MAX_LENGTH: 48,
  },
} as const;

export const SKILL_LEVEL = {
  SEARCH_SKILL: {
    MAX_LENGTH: 16,
  },
  SEARCH_LEVEL: {
    MAX_LENGTH: 16,
  },
} as const;

export const SEARCH_DEBOUNCE_MS = 1000;

export const ITEMS_PER_TABLE_PAGE = {
  REPOS: 5,
  DEFAULT: 7,
} as const;

export const ITEMS_PER_PAGE = {
  TASKS: 20,
} as const;