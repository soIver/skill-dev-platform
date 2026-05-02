import { config } from "./config";
import { useUserStore, type User } from "./hooks/useStore";

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

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail || payload.message || "Ошибка запроса";
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
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: buildHeaders(init.headers),
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
    headers: buildHeaders(init.headers),
  });
}

export async function authJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authFetch(`${config.apiBaseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
