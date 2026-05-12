const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL не задан в .env!");
}

export const config = {
  apiBaseUrl: API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL,
};

export const RECOMMENDATION = {
  DESCRIPTION: {
    MIN_LENGTH: 32,
    MAX_LENGTH: 2048,
  }
} as const;

export const PROFICIENCY = {
  SKILL_NAME: {
    MAX_LENGTH: 32,
  },
  LEVEL_NAME: {
    MAX_LENGTH: 32,
  },
} as const;

export const SEARCH_DEBOUNCE_MS = 2000;