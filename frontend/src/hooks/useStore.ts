import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

type User = {
    id: number;
    name: string;
    email: string;
    token: string;
    role: string;
}

type Store = {
    user: User | null;
}

type Actions = {
    setUser: (user: User) => any;
    clearUser: () => any;
}

const useStore = create<Store & Actions>()(
    devtools(
        persist(
            (set) => ({
                user: null,
                setUser: (user: User) => set({ user }),
                clearUser: () => set({ user: null }),
            }),
            { name: 'main-store' },
        ),
    ),
)

export default useStore;