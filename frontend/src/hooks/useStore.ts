import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface GitHubProfile {
  connected: boolean;
  login: string | null;
  name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
}

interface UserStore {
  user: User | null;
  githubProfile: GitHubProfile | null;
  deviceId: string;
  isHydrated: boolean;
  isAuthChecked: boolean;
  setSession: (user: User) => void;
  setGitHubProfile: (githubProfile: GitHubProfile | null) => void;
  clearSession: () => void;
  setHydrated: (isHydrated: boolean) => void;
  setAuthChecked: (isAuthChecked: boolean) => void;
}

function createDeviceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`;
}

export const useUserStore = create<UserStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        githubProfile: null,
        deviceId: createDeviceId(),
        isHydrated: false,
        isAuthChecked: false,
        setSession: (user) =>
          set({
            user,
            isAuthChecked: true,
          }),
        setGitHubProfile: (githubProfile) => set({ githubProfile }),
        clearSession: () =>
          set({
            user: null,
            githubProfile: null,
            isAuthChecked: true,
          }),
        setHydrated: (isHydrated) => set({ isHydrated }),
        setAuthChecked: (isAuthChecked) => set({ isAuthChecked }),
      }),
      {
        name: "auth-store",
        partialize: (state) => ({
          user: state.user,
          githubProfile: state.githubProfile,
          deviceId: state.deviceId,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
          state?.setAuthChecked(false);
        },
      },
    ),
  ),
);
