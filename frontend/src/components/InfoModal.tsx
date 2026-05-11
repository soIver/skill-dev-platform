export interface InfoModalProps {
  title: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
}

export function InfoModal({
  title,
  message,
  buttonText = "Понятно!",
  onClose,
}: InfoModalProps) {
  return (
    <div 
      className="fixed inset-0 z-40 flex items-center justify-center modal-overlay-animate"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-lg w-full mx-4 border border-gray-200 modal-content-animate">
        <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">{title}</h3>
        <div className="text-gray-600 mb-8 whitespace-pre-line text-lg leading-relaxed">
          {message}
        </div>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
