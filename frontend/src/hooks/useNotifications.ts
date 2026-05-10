import { useEffect } from "react";
import { useToast } from "../components/ToastProvider";
import { useUserStore } from "./useUserStore";

export function useNotifications() {
  const { showToast } = useToast();
  const user = useUserStore((state) => state.user);

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
  }, [showToast, user]);
}
