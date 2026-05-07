export interface EditorConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "danger" | "success";
  onConfirm: () => void;
  onCancel: () => void;
}

export function EditorConfirmModal({
  title,
  message,
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: EditorConfirmModalProps) {
  const confirmButtonColorClass = {
    primary: "bg-primary hover:bg-primary-hover text-white",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    danger: "bg-danger hover:bg-danger-hover text-white",
  }[confirmVariant];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl backdrop-blur-[10px]">
      <div className="bg-white rounded-xl shadow-xl p-4 max-w-sm w-full mx-4 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">{title}</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-line text-center">{message}</p>
        <div className="flex gap-3 justify-around">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${confirmButtonColorClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
