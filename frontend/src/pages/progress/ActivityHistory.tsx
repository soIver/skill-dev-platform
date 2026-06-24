import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { authJson } from "../../auth";
import { LoadingText } from "../../components/LoadingText";
import { Pagination } from "../../components/Pagination";
import { useTasksStore } from "../../hooks/useTasksStore";
import { useTestsStore } from "../../hooks/useTestsStore";

const ACTIONS_PER_PAGE = 20;

interface ActivitySkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
}

interface ActivityItem {
  id: string;
  content_type: "test" | "task" | "vacancy";
  target_id: number;
  title: string;
  action_text: string;
  description: string | null;
  occurred_at: string;
  successful: boolean | null;
  skill_level: ActivitySkillLevelItem | null;
}

interface ActivityListResponse {
  items: ActivityItem[];
  total_pages: number;
  current_page: number;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getActionButtonText(item: ActivityItem) {
  if (item.content_type === "test") return "Перейти к тесту";
  if (item.content_type === "task") return "Перейти к заданию";
  return "Перейти к вакансии";
}

export default function ActivityHistory() {
  const navigate = useNavigate();
  const tasksStore = useTasksStore();
  const testsStore = useTestsStore();
  const [data, setData] = useState<ActivityListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const loadActions = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const response = await authJson<ActivityListResponse>(
        `/progress/actions?page=${page}&limit=${ACTIONS_PER_PAGE}`,
      );
      setData(response);
      setCurrentPage(response.current_page);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActions(currentPage);
  }, [currentPage, loadActions]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleOpen = (item: ActivityItem) => {
    if (item.content_type === "task") {
      tasksStore.resetSearchState();
      tasksStore.setOnlyUncompleted(false);
      tasksStore.setSelectedPsFunctions([]);
      navigate("/tasks", { state: { taskId: item.target_id } });
      return;
    }

    if (item.content_type === "test") {
      testsStore.resetSearchState();
      testsStore.setOnlyUnpassed(false);
      testsStore.setSelectedSkills(item.skill_level ? [item.skill_level] : []);
      testsStore.setSelectedPsFunctions([]);
      navigate("/tests", { state: { skillLevelId: item.target_id, forceRefresh: true } });
      return;
    }

    navigate("/vacancies/analysis", { state: { vacancyId: item.target_id } });
  };

  return (
    <section className="workspace-panel min-h-0 flex h-full flex-col">
      <h2 className="workspace-panel-header shrink-0">История действий</h2>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            <LoadingText text="Загрузка..." />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            История действий пока пуста
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.items.map((item) => (
              <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-primary">{item.action_text}</p>
                    <h3 className="mt-1 wrap-break-word text-lg font-bold text-gray-900">{item.title}</h3>
                  </div>
                  <span className="flex w-fit shrink-0 items-center gap-1.5 text-sm font-medium text-gray-500">
                    <Clock className="h-4 w-4" />
                    {formatDateTime(item.occurred_at)}
                  </span>
                </div>

                {item.description && (
                  <p className="mb-4 text-sm leading-6 text-gray-600">{item.description}</p>
                )}

                {item.successful !== null && (
                  <div className={`mb-4 flex items-center gap-2 text-sm font-semibold ${item.successful ? "text-success" : "text-danger"}`}>
                    {item.successful ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {item.successful ? "Успешно" : "Требует повторной попытки"}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  className="primary-button flex w-full items-center justify-center gap-2"
                >
                  {getActionButtonText(item)}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={data?.total_pages ?? 1}
        onPageChange={handlePageChange}
        className="mt-4 border-t border-gray-100 pt-3 shrink-0"
      />
    </section>
  );
}
