import { useEffect } from "react";
import { useToast } from "../components/ToastProvider";
import { useUserStore } from "./useUserStore";
import { useRepositoriesStore } from "./useRepositoriesStore";
import type { RepoItem } from "./useRepositoriesStore";

const RECENT_NOTIFICATION_TTL_MS = 2000;
const recentNotificationKeys = new Map<string, number>();

const repoStatuses: RepoItem["status"][] = [
  "Доступен",
  "Недоступен",
  "Проверен",
  "Подготовка",
  "В процессе...",
];

function isRepoStatus(value: unknown): value is RepoItem["status"] {
  return typeof value === "string" && repoStatuses.includes(value as RepoItem["status"]);
}

function shouldShowNotification(key: string): boolean {
  const now = Date.now();
  const lastShownAt = recentNotificationKeys.get(key);
  recentNotificationKeys.set(key, now);

  for (const [storedKey, storedAt] of recentNotificationKeys) {
    if (now - storedAt > RECENT_NOTIFICATION_TTL_MS) {
      recentNotificationKeys.delete(storedKey);
    }
  }

  return lastShownAt === undefined || now - lastShownAt > RECENT_NOTIFICATION_TTL_MS;
}

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
          if (shouldShowNotification(`${data.type}:${data.repo_name}:${data.message}`)) {
            showToast({
              title: "Анализ завершён",
              message: data.message,
              variant: "success",
            });
          }
          // Обновляем статус репозитория в сторе без перезагрузки страницы
          updateRepoStatus(data.repo_name, "Проверен");
        } else if (data.type === "repository_analysis_processing") {
          updateRepoStatus(data.repo_name, "В процессе...");
        } else if (data.type === "repository_analysis_failed") {
          if (shouldShowNotification(`${data.type}:${data.repo_name}:${data.message}:${data.status ?? ""}`)) {
            showToast({
              title: "Ошибка анализа",
              message: data.message,
              variant: "error",
            });
          }
          updateRepoStatus(data.repo_name, isRepoStatus(data.status) ? data.status : "Доступен");
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
