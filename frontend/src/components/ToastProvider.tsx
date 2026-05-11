import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useToastStore, type ToastPayload, type ToastItem } from "../hooks/useToastStore";

interface ToastContextValue {
  showToast: (payload: ToastPayload) => void;
  dismissToast: (id: string) => void;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, dismissToast } = useToastStore();

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      dismissToast,
    }),
    [dismissToast, showToast, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast должен использоваться внутри ToastProvider");
  }

  return context;
}
