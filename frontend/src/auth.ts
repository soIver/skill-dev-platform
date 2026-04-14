import { config } from "./config";
import { useUserStore, type User } from "./hooks/useStore";

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

interface Credentials {
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

function buildHeaders(
  headers?: HeadersInit,
  accessToken?: string | null,
): Record<string, string> {
  const normalizedHeaders = new Headers(headers);

  if (accessToken) {
    normalizedHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  return Object.fromEntries(normalizedHeaders.entries());
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
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as AuthResponse;
}

function applyAuthSession(data: AuthResponse): void {
  useUserStore.getState().setSession({
    user: data.user,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });
}

export async function login(credentials: Credentials): Promise<void> {
  const data = await fetchAuth("/auth/login", credentials);
  applyAuthSession(data);
}

export async function register(credentials: Credentials): Promise<void> {
  const data = await fetchAuth("/auth/register", credentials);
  applyAuthSession(data);
}

export async function restoreSession(): Promise<boolean> {
  const { refreshToken } = useUserStore.getState();
  if (!refreshToken) {
    return false;
  }

  try {
    const data = await fetchAuth("/auth/refresh", { refresh_token: refreshToken });
    applyAuthSession(data);
    return true;
  } catch {
    useUserStore.getState().clearSession();
    return false;
  }
}

export async function logout(): Promise<void> {
  const { accessToken, refreshToken } = useUserStore.getState();
  if (!refreshToken) {
    useUserStore.getState().clearSession();
    return;
  }

  try {
    await fetch(`${config.apiBaseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        ...getDefaultHeaders(),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } finally {
    useUserStore.getState().clearSession();
  }
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken } = useUserStore.getState();
  const response = await fetch(input, {
    ...init,
    headers: buildHeaders(init.headers, accessToken),
  });

  if (response.status !== 401) {
    return response;
  }

  const restored = await restoreSession();
  if (!restored) {
    return response;
  }

  const { accessToken: nextAccessToken } = useUserStore.getState();
  return fetch(input, {
    ...init,
    headers: buildHeaders(init.headers, nextAccessToken),
  });
}
