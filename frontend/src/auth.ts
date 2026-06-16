import { config } from "./config";
import { useUserStore, type User } from "./hooks/useUserStore";
import { toast } from "./hooks/useToastStore";

interface AuthResponse {
  token_type: string;
  user: User;
}

interface Credentials {
  identifier: string;
  password: string;
}

interface RegistrationCredentials {
  username: string;
  email: string;
  password: string;
  github_token?: string;
  github_id?: number;
}

interface EmailRegistrationCredentials {
  code: string;
  username: string;
  email: string;
  password: string;
  repeat_password: string;
}

interface UsernameAvailabilityResponse {
  available: boolean;
}

const DEVICE_ID_HEADER = "X-Device-Id";

function getDefaultHeaders(): HeadersInit {
  const { deviceId } = useUserStore.getState();

  return {
    "Content-Type": "application/json",
    [DEVICE_ID_HEADER]: deviceId,
  };
}

function buildHeaders(headers?: HeadersInit): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function stringifyApiError(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => stringifyApiError(item))
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join("; ") : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const msg = stringifyApiError(record.msg ?? record.message ?? record.error);
    if (msg) {
      const location = Array.isArray(record.loc)
        ? record.loc.filter((item) => item !== "body").join(".")
        : null;
      return location ? `${location}: ${msg}` : msg;
    }
  }

  return null;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown; error?: unknown };
    return (
      stringifyApiError(payload.detail) ||
      stringifyApiError(payload.message) ||
      stringifyApiError(payload.error) ||
      "Ошибка запроса"
    );
  } catch {
    return "Ошибка запроса";
  }
}

async function fetchAuth(
  path: string,
  body: unknown,
): Promise<AuthResponse> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: getDefaultHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as AuthResponse;
}

function applyAuthSession(data: AuthResponse): void {
  useUserStore.getState().setSession(data.user);
}

let refreshPromise: Promise<boolean> | null = null;

export async function login(credentials: Credentials): Promise<void> {
  const data = await fetchAuth("/auth/login", credentials);
  applyAuthSession(data);
}

export async function register(credentials: RegistrationCredentials): Promise<void> {
  const data = await fetchAuth("/auth/register", credentials);
  applyAuthSession(data);
}

export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const response = await authFetch(
    `${config.apiBaseUrl}/auth/username-availability?username=${encodeURIComponent(username)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const data = (await response.json()) as UsernameAvailabilityResponse;
  return data.available;
}

export async function updateUsername(username: string): Promise<void> {
  const response = await authFetch(`${config.apiBaseUrl}/auth/username`, {
    method: "PATCH",
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const data = (await response.json()) as AuthResponse;
  applyAuthSession(data);
}

export async function requestEmailConfirmation(email: string): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/auth/email-confirmation/request`, {
    method: "POST",
    headers: getDefaultHeaders(),
    credentials: "include",
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function completeEmailRegistration(
  credentials: EmailRegistrationCredentials,
): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/auth/email-confirmation/complete`, {
    method: "POST",
    headers: getDefaultHeaders(),
    credentials: "include",
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function restoreSession(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: getDefaultHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        useUserStore.getState().clearSession();
        return false;
      }

      const data = (await response.json()) as AuthResponse;
      applyAuthSession(data);
      return true;
    } catch {
      useUserStore.getState().clearSession();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function syncSession(): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/auth/session`, {
      method: "GET",
      headers: {
        [DEVICE_ID_HEADER]: useUserStore.getState().deviceId,
      },
      credentials: "include",
    });

    if (response.ok) {
      const user = (await response.json()) as User;
      useUserStore.getState().setSession(user);
      return true;
    }

    if (response.status !== 401) {
      useUserStore.getState().clearSession();
      return false;
    }
  } catch {
    useUserStore.getState().clearSession();
    return false;
  }

  return restoreSession();
}

export async function logout(): Promise<void> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/auth/logout`, {
      method: "POST",
      headers: getDefaultHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
  } finally {
    useUserStore.getState().clearSession();
  }
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = {
    ...getDefaultHeaders(),
    ...buildHeaders(init.headers),
  };

  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status !== 401) {
    return response;
  }

  if (input.endsWith("/auth/refresh")) {
    return response;
  }

  const restored = await restoreSession();
  if (!restored) {
    return response;
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

export async function authJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authFetch(`${config.apiBaseUrl}${path}`, init);
  if (!response.ok) {
    const errorMsg = await readApiError(response);
    toast.error("Ошибка запроса", errorMsg);
    throw new Error(errorMsg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
