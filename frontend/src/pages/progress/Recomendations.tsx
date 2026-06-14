import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authJson } from "../../auth";
import { LoadingText } from "../../components/LoadingText";
import { RecommendationCard, type RecommendationItem } from "../../components/RecommendationCard";
import { useToast } from "../../components/ToastProvider";
import { useTasksStore } from "../../hooks/useTasksStore";
import { useTestsStore } from "../../hooks/useTestsStore";

interface RecommendationListResponse {
  items: RecommendationItem[];
  skip_limit: number;
  skips_used: number;
  skips_available: number;
}

interface RecommendationSkipResponse {
  skipped: boolean;
  skips_used: number;
  skips_available: number;
}

export default function Recomendations() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const tasksStore = useTasksStore();
  const testsStore = useTestsStore();
  const [data, setData] = useState<RecommendationListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [skippingId, setSkippingId] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await authJson<RecommendationListResponse>("/recommendations");
      setData(response);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const handleSkip = async (item: RecommendationItem) => {
    if (skippingId) return;
    setSkippingId(item.id);
    try {
      const response = await authJson<RecommendationSkipResponse>(`/recommendations/${item.id}/skip`, {
        method: "POST",
      });
      setData((current) => current ? {
        ...current,
        items: current.items.filter((candidate) => candidate.id !== item.id),
        skips_used: response.skips_used,
        skips_available: response.skips_available,
      } : current);
    } finally {
      setSkippingId(null);
    }
  };

  const handleOpen = (item: RecommendationItem) => {
    if (item.content_type === "task") {
      tasksStore.resetSearchState();
      tasksStore.setOnlyUncompleted(true);
      tasksStore.setSelectedPsFunctions([]);
      navigate("/tasks", { state: { taskId: item.target_id } });
      return;
    }

    testsStore.resetSearchState();
    testsStore.setOnlyUnpassed(false);
    testsStore.setSelectedSkills(item.skill_levels.map((skill) => ({
      id: skill.id,
      skill_name: skill.skill_name,
      level_name: skill.level_name,
    })));
    testsStore.setSelectedPsFunctions([]);
    navigate("/tests", { state: { skillLevelId: item.target_id } });
  };

  return (
    <div className="workspace-container">
      <div className="workspace-panel">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="workspace-panel-header mb-1">Рекомендации</h2>
            <p className="text-sm text-gray-500">
              Доступно пропусков на этой неделе: {data?.skips_available ?? 0} из {data?.skip_limit ?? 0}
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecommendations}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Обновить
          </button>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            <LoadingText text="Загрузка..." />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            Сейчас нет активных рекомендаций
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {data.items.map((item) => (
              <RecommendationCard
                key={item.id}
                item={item}
                onSkip={(candidate) => {
                  if (data.skips_available <= 0) {
                    showToast({
                      title: "Лимит пропусков",
                      message: "На этой неделе больше нельзя пропускать рекомендации.",
                      variant: "error",
                    });
                    return;
                  }
                  void handleSkip(candidate);
                }}
                onOpen={handleOpen}
                isSkipping={skippingId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
