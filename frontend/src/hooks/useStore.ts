import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface User {
  id: number;
  email: string;
  role: string;
  githubUsername: string;
}

interface SessionPayload {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface UserStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string;
  isHydrated: boolean;
  setSession: (session: SessionPayload) => void;
  setAccessToken: (accessToken: string | null) => void;
  clearSession: () => void;
  setHydrated: (isHydrated: boolean) => void;
}

function createDeviceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`;
}

export const useUserStore = create<UserStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        accessToken: null,
        refreshToken: null,
        deviceId: createDeviceId(),
        isHydrated: false,
        setSession: (session) =>
          set({
            user: session.user,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          }),
        setAccessToken: (accessToken) => set({ accessToken }),
        clearSession: () =>
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
          }),
        setHydrated: (isHydrated) => set({ isHydrated }),
      }),
      {
        name: "auth-store",
        partialize: (state) => ({
          user: state.user,
          refreshToken: state.refreshToken,
          deviceId: state.deviceId,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
        },
      },
    ),
  ),
);
