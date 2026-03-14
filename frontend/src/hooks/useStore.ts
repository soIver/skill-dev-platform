import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface User {
    id: number;
    email: string;
    token: string;
    role: string;
    githubUsername: string;
}

interface UserStore {
    user: User | null;
    setUser: (user: User) => any;
    clearUser: () => any;
}

export const useUserStore = create<UserStore>()(
    devtools(
        persist(
            (set) => ({
                user: null,
                setUser: (user: User) => set({ user }),
                clearUser: () => set({ user: null }),
            }),
            { name: 'user-store' },
        ),
    ),
)