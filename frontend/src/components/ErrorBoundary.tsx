import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-lg w-full border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-danger/10 text-danger rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Ой! Что-то пошло не так</h1>
              <p className="text-gray-600 mb-8 leading-relaxed">
                Произошла непредвиденная ошибка в интерфейсе. Мы уже работаем над её исправлением.
              </p>
              <div className="w-full bg-gray-50 rounded-xl p-4 text-left mb-8 overflow-auto max-h-32 border border-gray-100">
                <code className="text-xs text-danger font-mono break-all">
                  {this.state.error?.toString()}
                </code>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-all shadow-md hover:shadow-lg"
              >
                Перезагрузить страницу
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
