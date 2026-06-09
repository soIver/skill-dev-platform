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
const RECENT_TOAST_TTL_MS = 2000;
const recentToastKeys = new Map<string, number>();

function shouldShowToast(payload: ToastPayload): boolean {
  const now = Date.now();
  const key = `${payload.variant}:${payload.title}:${payload.message ?? ""}`;
  const lastShownAt = recentToastKeys.get(key);
  recentToastKeys.set(key, now);

  for (const [storedKey, storedAt] of recentToastKeys) {
    if (now - storedAt > RECENT_TOAST_TTL_MS) {
      recentToastKeys.delete(storedKey);
    }
  }

  return lastShownAt === undefined || now - lastShownAt > RECENT_TOAST_TTL_MS;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (payload) => {
    if (!shouldShowToast(payload)) {
      return;
    }

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
