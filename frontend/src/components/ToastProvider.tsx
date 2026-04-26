import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error";

export interface ToastPayload {
  title: string;
  message?: string;
  variant: ToastVariant;
}

export interface ToastItem extends ToastPayload {
  id: string;
}

interface ToastContextValue {
  showToast: (payload: ToastPayload) => void;
  dismissToast: (id: string) => void;
  toasts: ToastItem[];
}

const TOAST_DURATION_MS = 4200;
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const timeoutId of timersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timersRef.current.clear();
    };
  }, []);

  const showToast = useCallback(({ title, message, variant }: ToastPayload) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}`;

    setToasts((current) => [...current, { id, title, message, variant }]);

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timersRef.current.delete(id);
    }, TOAST_DURATION_MS);

    timersRef.current.set(id, timeoutId);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timeoutId = timersRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

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
