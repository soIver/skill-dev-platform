import { useEffect } from "react";
import { useToast } from "../components/ToastProvider";
import { useUserStore } from "./useUserStore";
import { useRepositoriesStore } from "./useRepositoriesStore";

export function useNotifications() {
  const { showToast } = useToast();
  const user = useUserStore((state) => state.user);
  const updateRepoStatus = useRepositoriesStore((state) => state.updateRepoStatus);

  useEffect(() => {
    if (!user) return;

    // Используем относительный путь, так как Vite проксирует /api
    const eventSource = new EventSource("/api/notifications/stream", {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      // Игнорируем heartbeat и пустые сообщения
      if (!event.data || event.data === "heartbeat") return;

      try {
        const data = JSON.parse(event.data);
        if (data.type === "repository_analyzed") {
          showToast({
            title: "Анализ завершён",
            message: data.message,
            variant: "success",
          });
          // Обновляем статус репозитория в сторе без перезагрузки страницы
          updateRepoStatus(data.repo_name, "Проверен");
        } else if (data.type === "repository_analysis_failed") {
          showToast({
            title: "Ошибка анализа",
            message: data.message,
            variant: "error",
          });
          // Возвращаем статус в «Доступен», чтобы можно было повторить
          updateRepoStatus(data.repo_name, "Доступен");
        }
      } catch (err) {
        console.error("Failed to parse notification", err);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      // EventSource автоматически пытается переподключиться
    };

    return () => {
      eventSource.close();
    };
  }, [showToast, user, updateRepoStatus]);
}
