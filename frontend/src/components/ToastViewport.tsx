import { useToast } from "./ToastProvider";

export default function ToastViewport() {
  const { dismissToast, toasts } = useToast();

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item ${
            toast.variant === "success" ? "toast-success" : "toast-error"
          }`}
          role="status"
        >
          <div className="min-w-0">
            <p className="toast-title">{toast.title}</p>
            {toast.message ? <p className="toast-message">{toast.message}</p> : null}
          </div>

          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="toast-close"
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
