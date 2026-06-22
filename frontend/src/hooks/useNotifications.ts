import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { useUserStore } from "./useUserStore";
import { useRepositoriesStore } from "./useRepositoriesStore";
import type { RepoItem } from "./useRepositoriesStore";
import { useTasksStore, type TaskLatestAttempt } from "./useTasksStore";
import { useVacanciesStore } from "./useVacanciesStore";
import { config } from "../config";

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

function getCachedVacancyId(): number | null {
  const state = useVacanciesStore.getState();
  const id = state.analysisResult?.vacancy.id ?? state.analysisVacancy?.id;
  if (!id) return null;
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

export function useNotifications() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.user?.id ?? null);
  const clearSession = useUserStore((state) => state.clearSession);
  const updateRepoStatus = useRepositoriesStore((state) => state.updateRepoStatus);
  const setTaskAnalysisStatus = useTasksStore((state) => state.setTaskAnalysisStatus);
  const updateTaskLatestAttempt = useTasksStore((state) => state.updateTaskLatestAttempt);
  const setVacancyAnalysisState = useVacanciesStore((state) => state.setAnalysisState);

  useEffect(() => {
    if (!userId) return;

    const eventSource = new EventSource(`${config.apiBaseUrl}/notifications/stream`, {
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
          if (typeof data.task_id === "number" && data.latest_attempt) {
            updateTaskLatestAttempt(data.task_id, data.latest_attempt as TaskLatestAttempt);
          }
        } else if (data.type === "repository_analysis_processing") {
          updateRepoStatus(data.repo_name, "В процессе...");
          if (typeof data.task_id === "number") {
            setTaskAnalysisStatus(data.task_id, "processing", {
              name: data.repo_name,
              url: typeof data.repo_url === "string" ? data.repo_url : null,
            });
          }
        } else if (data.type === "repository_analysis_failed") {
          if (shouldShowNotification(`${data.type}:${data.repo_name}:${data.message}:${data.status ?? ""}`)) {
            showToast({
              title: "Ошибка анализа",
              message: data.message,
              variant: "error",
            });
          }
          updateRepoStatus(data.repo_name, isRepoStatus(data.status) ? data.status : "Доступен");
          if (typeof data.task_id === "number") {
            setTaskAnalysisStatus(data.task_id, null);
          }
        } else if (data.type === "vacancy_analyzed") {
          if (data.vacancy_id === getCachedVacancyId()) {
            setVacancyAnalysisState({ analysisIsAnalyzing: false });
          }
          if (shouldShowNotification(`${data.type}:${data.vacancy_id}:${data.message}`)) {
            showToast({
              title: "Анализ завершён",
              message: data.message,
              variant: "success",
            });
          }
          window.dispatchEvent(new CustomEvent("vacancy-analysis-completed", { detail: data }));
        } else if (data.type === "vacancy_analysis_processing") {
          if (data.vacancy_id === getCachedVacancyId()) {
            setVacancyAnalysisState({ analysisIsAnalyzing: true });
          }
          window.dispatchEvent(new CustomEvent("vacancy-analysis-processing", { detail: data }));
        } else if (data.type === "vacancy_analysis_failed") {
          if (data.vacancy_id === getCachedVacancyId()) {
            setVacancyAnalysisState({ analysisIsAnalyzing: false });
          }
          if (shouldShowNotification(`${data.type}:${data.vacancy_id}:${data.message}`)) {
            showToast({
              title: "Ошибка анализа",
              message: data.message,
              variant: "error",
            });
          }
          window.dispatchEvent(new CustomEvent("vacancy-analysis-failed", { detail: data }));
        } else if (data.type === "session_invalidated") {
          clearSession();
          if (!window.location.pathname.startsWith("/auth")) {
            showToast({
              title: "Сессия завершена",
              message: data.message || "Войдите в аккаунт заново.",
              variant: "error",
            });
            navigate("/auth/login", { replace: true });
          }
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
  }, [
    clearSession,
    navigate,
    setVacancyAnalysisState,
    setTaskAnalysisStatus,
    showToast,
    updateRepoStatus,
    updateTaskLatestAttempt,
    userId,
  ]);
}
