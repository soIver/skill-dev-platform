import { create } from "zustand";

export type ToastVariant = "success" | "error";

export interface ToastPayload {
  title: string;
  message?: string;
  variant: ToastVariant;
}

export interface ToastItem extends ToastPayload {
  id: string;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (payload: ToastPayload) => void;
  dismissToast: (id: string) => void;
}

const TOAST_DURATION_MS = 4200;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (payload) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}`;
    
    set((state) => ({
      toasts: [...state.toasts, { ...payload, id }],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, TOAST_DURATION_MS);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// Helper for calling from non-React code
export const toast = {
  success: (title: string, message?: string) => 
    useToastStore.getState().showToast({ title, message, variant: "success" }),
  error: (title: string, message?: string) => 
    useToastStore.getState().showToast({ title, message, variant: "error" }),
};
