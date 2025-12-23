import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface User {
    id: number;
    name: string;
    email: string;
    token: string;
    role: string;
}

interface UserStore {
    user: User | null;
    setUser: (user: User) => any;
    setUserName: (name: string) => any;
    clearUser: () => any;
}

export const useUserStore = create<UserStore>()(
    devtools(
        persist(
            (set) => ({
                user: null,
                setUser: (user: User) => set({ user }),
                setUserName: (name: string) => set((state) => ({user: state.user ? { ...state.user, name } : null})),
                clearUser: () => set({ user: null }),
            }),
            { name: 'user-store' },
        ),
    ),
)