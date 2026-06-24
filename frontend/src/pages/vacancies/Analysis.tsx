import { useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";

import { authJson } from "../../auth";
import { LoadingText } from "../../components/LoadingText";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { RecommendationCard, type RecommendationItem } from "../../components/RecommendationCard";
import { useToast } from "../../components/ToastProvider";
import { VacancyInfo } from "../../components/VacancyCard";
import { useTasksStore } from "../../hooks/useTasksStore";
import { useTestsStore } from "../../hooks/useTestsStore";
import {
  useVacanciesStore,
  type VacancyAnalysisRecommendation,
  type VacancyAnalysisResponse,
  type VacancySearchItem,
  type VacancySkillComparisonItem,
} from "../../hooks/useVacanciesStore";

type VacancyRouteState = {
  vacancy?: VacancySearchItem;
  vacancyId?: number;
  autoAnalyze?: boolean;
} | null;

const SKILLS_PER_PAGE = 5;

function getVacancyId(vacancy: VacancySearchItem | null) {
  if (!vacancy) return null;
  const parsed = Number(vacancy.id);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function VacancyAnalysis() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const tasksStore = useTasksStore();
  const testsStore = useTestsStore();
  const {
    analysisUrl: url,
    analysisVacancy,
    analysisResult: analysis,
    analysisIsLoading: isLoading,
    analysisIsAnalyzing: isAnalyzing,
    analysisCurrentPage: currentPage,
    setAnalysisState,
  } = useVacanciesStore();
  const routeState = location.state as VacancyRouteState;
  const autoAnalyzeRef = useRef<string | null>(null);

  const selectedVacancy = analysis?.vacancy ?? analysisVacancy;
  const selectedVacancyId = getVacancyId(selectedVacancy);
  const allSkillsSatisfied = analysis?.is_analyzed && analysis.skills.length > 0 && analysis.skills.every((skill) => skill.is_satisfied);

  const loadAnalysis = useCallback(async (vacancyId: number) => {
    setAnalysisState({ analysisIsLoading: true });
    try {
      const response = await authJson<VacancyAnalysisResponse>(`/vacancies/${vacancyId}/analysis`);
      setAnalysisState({
        analysisResult: response,
        analysisVacancy: response.vacancy,
        analysisUrl: response.vacancy.original_url,
        analysisIsAnalyzing: response.is_queued && !response.is_analyzed,
      });
    } finally {
      setAnalysisState({ analysisIsLoading: false });
    }
  }, [setAnalysisState]);

  const submitAnalysis = useCallback(async (targetUrl: string) => {
    if (!targetUrl.trim()) return;

    setAnalysisState({ analysisUrl: targetUrl, analysisIsAnalyzing: true });
    try {
      const response = await authJson<VacancyAnalysisResponse>("/vacancies/analyze", {
        method: "POST",
        body: JSON.stringify({ url: targetUrl }),
      });
      setAnalysisState({
        analysisResult: response,
        analysisVacancy: response.vacancy,
        analysisUrl: response.vacancy.original_url,
        analysisIsAnalyzing: response.is_queued && !response.is_analyzed,
        analysisCurrentPage: 1,
      });

      if (response.is_queued) {
        showToast({
          title: "Анализ запущен",
          message: `Вакансия ${response.vacancy.title} поставлена в очередь на анализ.`,
          variant: "success",
        });
      }
    } catch {
      setAnalysisState({ analysisIsAnalyzing: false });
    }
  }, [setAnalysisState, showToast]);

  useEffect(() => {
    if (routeState?.vacancyId) {
      void loadAnalysis(routeState.vacancyId);
      navigate("/vacancies/analysis", { replace: true, state: null });
      return;
    }

    if (!routeState?.vacancy) return;
    const nextUrl = routeState.vacancy.original_url;
    setAnalysisState({
      analysisVacancy: routeState.vacancy,
      analysisUrl: nextUrl,
      analysisResult: null,
      analysisIsAnalyzing: false,
      analysisCurrentPage: 1,
    });
    navigate("/vacancies/analysis", { replace: true, state: null });

    if (routeState.autoAnalyze && autoAnalyzeRef.current !== nextUrl) {
      autoAnalyzeRef.current = nextUrl;
      void submitAnalysis(nextUrl);
    }
  }, [loadAnalysis, navigate, routeState?.autoAnalyze, routeState?.vacancy, routeState?.vacancyId, setAnalysisState, submitAnalysis]);

  useEffect(() => {
    setAnalysisState({ analysisCurrentPage: 1 });
  }, [analysis?.vacancy.id, setAnalysisState]);

  useEffect(() => {
    const handleCompleted = (event: Event) => {
      const data = (event as CustomEvent<{ vacancy_id?: number }>).detail;
      if (!data?.vacancy_id || data.vacancy_id !== selectedVacancyId) return;
      setAnalysisState({ analysisIsAnalyzing: false });
      void loadAnalysis(data.vacancy_id);
    };
    const handleFailed = (event: Event) => {
      const data = (event as CustomEvent<{ vacancy_id?: number }>).detail;
      if (!data?.vacancy_id || data.vacancy_id !== selectedVacancyId) return;
      setAnalysisState({ analysisIsAnalyzing: false });
    };

    window.addEventListener("vacancy-analysis-completed", handleCompleted);
    window.addEventListener("vacancy-analysis-failed", handleFailed);
    return () => {
      window.removeEventListener("vacancy-analysis-completed", handleCompleted);
      window.removeEventListener("vacancy-analysis-failed", handleFailed);
    };
  }, [loadAnalysis, selectedVacancyId, setAnalysisState]);

  const handleUrlChange = (value: string) => {
    setAnalysisState({ analysisUrl: value });
    if (selectedVacancy && value !== selectedVacancy.original_url) {
      setAnalysisState({
        analysisResult: null,
        analysisVacancy: null,
        analysisIsAnalyzing: false,
        analysisCurrentPage: 1,
      });
    }
  };

  const handleOpenRecommendation = (item: Pick<VacancyAnalysisRecommendation, "content_type" | "target_id">) => {
    if (item.content_type === "task") {
      tasksStore.resetSearchState();
      tasksStore.setOnlyUncompleted(false);
      tasksStore.setSelectedPsFunctions([]);
      navigate("/tasks", { state: { taskId: item.target_id } });
      return;
    }

    testsStore.resetSearchState();
    testsStore.setOnlyUnpassed(false);
    testsStore.setSelectedSkills([]);
    testsStore.setSelectedPsFunctions([]);
    navigate("/tests", { state: { skillLevelId: item.target_id, forceRefresh: true } });
  };

  const mapVacancyRecommendation = (item: VacancyAnalysisRecommendation): RecommendationItem => ({
    id: item.id,
    content_type: item.content_type,
    target_id: item.target_id,
    score: 0,
    created_at: "",
    expires_at: "",
    title: item.title,
    description: item.description,
    skill_levels: [
      {
        id: item.target_id,
        skill_name: item.skill_name,
        level_name: item.required_level_name ?? "требуемый уровень",
      },
    ],
    ps_functions: [],
  });

  const columns = useMemo<Column<VacancySkillComparisonItem>[]>(() => [
    {
      key: "skill_name",
      header: "Навык",
      align: "center",
      render: (item) => <span className="font-medium text-gray-900">{item.skill_name}</span>,
    },
    {
      key: "current_level_name",
      header: "Текущий",
      align: "center",
      render: (item) => item.current_level_name ?? <span className="text-gray-500">Отсутствует</span>,
    },
    {
      key: "required_level_name",
      header: "Требуемый",
      align: "center",
      render: (item) => item.required_level_name ?? "Не задан",
    },
  ], []);

  return (
    <div className="workspace-container">
      <div className="workspace-panel min-h-0 min-w-0 flex flex-col">
        <h2 className="workspace-panel-header">Вакансия</h2>

        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(event) => handleUrlChange(event.target.value)}
            className="input-field mt-0! flex-1"
            placeholder="URL вакансии на hh.ru"
            disabled={isAnalyzing}
          />
          <button
            type="button"
            onClick={() => void submitAnalysis(url)}
            disabled={!url.trim() || isAnalyzing || Boolean(analysis?.is_analyzed)}
            className="primary-button flex w-auto min-w-38 items-center justify-center px-5"
          >
            {isAnalyzing ? <LoadingText text="Анализ..." /> : "Анализировать"}
          </button>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="flex h-28 items-center justify-center text-gray-400">
              <LoadingText text="Загрузка вакансии..." />
            </div>
          ) : selectedVacancy ? (
            <>
              <VacancyInfo
                vacancy={selectedVacancy}
                titleAction={(
                  <button
                    type="button"
                    onClick={() => window.open(selectedVacancy.original_url, "_blank", "noopener,noreferrer")}
                    disabled={!selectedVacancy.original_url}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:border-gray-200 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:text-gray-300"
                    title="Открыть вакансию"
                    aria-label="Открыть вакансию"
                  >
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
              />
            </>
          ) : (
            <div className="h-28 flex items-center justify-center text-gray-400">
                <div className="text-center">
                    Укажите ссылку на вакансию в поле выше<br/> или выберите понравившуюся в <Link to="/vacancies/search" className="hyperlink">поисковой выдаче</Link>
                </div>
            </div>
          )}
        </div>

        {analysis?.is_analyzed && (
          <div className="mt-6 min-h-0 flex-1">
            <PaginatedTable
              columns={columns}
              data={analysis.skills}
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(analysis.skills.length / SKILLS_PER_PAGE))}
              onPageChange={(page) => setAnalysisState({ analysisCurrentPage: page })}
              itemsPerPage={SKILLS_PER_PAGE}
              useClientSlice={true}
              isLoading={false}
              emptyMessage="Навыки не найдены"
              getRowClassName={(item) => item.is_satisfied ? "bg-success/10" : "bg-danger/10"}
            />
          </div>
        )}
      </div>

      <div className="workspace-panel min-h-0 min-w-0 flex flex-col">
        <h2 className="workspace-panel-header">Рекомендации</h2>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {!analysis?.is_analyzed ? (
            <div className="flex h-40 items-center justify-center text-gray-400">
              Рекомендации появятся после анализа вакансии
            </div>
          ) : allSkillsSatisfied ? (
            <div className="flex h-40 items-center justify-center text-center text-lg font-semibold text-success">
              Вы идеально подходите для этой вакансии!
            </div>
          ) : analysis.recommendations.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-center text-gray-400">
              Для недостающих навыков пока нет опубликованных тестов или заданий
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {analysis.recommendations.map((item) => {
                const recommendationItem = mapVacancyRecommendation(item);
                return (
                  <RecommendationCard
                    key={item.id}
                    item={recommendationItem}
                    onOpen={handleOpenRecommendation}
                    goal={(
                      <>
                        Улучшить навык {item.skill_name}: {item.current_level_name ?? "Отсутствует"} <ArrowRight className="inline h-4 w-4" /> {item.required_level_name ?? "требуемый уровень"}
                      </>
                    )}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
