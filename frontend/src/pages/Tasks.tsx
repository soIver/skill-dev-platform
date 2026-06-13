import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { authJson } from "../auth";
import { ITEMS_PER_PAGE, TASK, SEARCH_DEBOUNCE_MS, ITEMS_PER_TABLE_PAGE } from "../config";
import { BentoSearch } from "../components/BentoSearch";
import { AutocompleteSearch } from "../components/AutocompleteSearch";
import { Pagination } from "../components/Pagination";
import { LoadingText } from "../components/LoadingText";
import { TaskCard } from "../components/TaskCard";
import { useToast } from "../components/ToastProvider";
import { useRepositoriesStore, type RepoItem } from "../hooks/useRepositoriesStore";
import {
  useTasksStore,
  type SkillLevelItem,
  type TaskLatestAttempt,
  type TaskPublicItem,
  type TaskPublicSkillItem,
  type TaskRequirementItem,
} from "../hooks/useTasksStore";
import { useUserStore } from "../hooks/useUserStore";
import GitHubIcon from "../assets/icons/github.svg?react";

// интерфейсы

interface TaskPublicSearchResponse {
  items: TaskPublicItem[];
  total_pages: number;
  current_page: number;
}

interface SkillLevelSearchResponse {
  items: SkillLevelItem[];
  total_pages: number;
}

interface TaskDetail {
  id: number;
  title: string;
  description: string;
  skills: TaskPublicSkillItem[];
  requirements: TaskRequirementItem[];
  attached_repo_name?: string | null;
  latest_attempt?: TaskLatestAttempt | null;
  analysis_status?: "preparing" | "processing" | null;
  analysis_repo_name?: string | null;
  analysis_repo_url?: string | null;
}

export default function Tasks() {
  const {
    keywordInput,
    selectedSkills,
    results,
    currentPage,
    totalPages,
    hasSearched,
    lastSearchKeyword,
    lastSearchSkillIds,
    setKeywordInput,
    setSelectedSkills,
    setSearchState,
    setTaskAnalysisStatus,
  } = useTasksStore();
  const [isLoading, setIsLoading] = useState(false);

  // состояние модального окна
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalView, setModalView] = useState<"details" | "attach">("details");
  const [isTaskLoading, setIsTaskLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showToast } = useToast();
  const {
    repos,
    isInitialized,
    setReposData,
    updateRepoStatus,
  } = useRepositoriesStore();
  const githubProfile = useUserStore((state) => state.githubProfile);

  // функция поиска только по кнопке или при смене страницы
  const doSearch = useCallback(async (page: number, keyword: string, skills: SkillLevelItem[]) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ITEMS_PER_PAGE.TASKS.toString(),
        only_published: "true"
      });
      if (keyword.trim()) params.append("keyword", keyword.trim());
      for (const s of skills) {
        params.append("skill_level_ids", String(s.id));
      }
      const data = await authJson<TaskPublicSearchResponse>(`/tasks?${params.toString()}`);
      setSearchState({
        results: data.items,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        hasSearched: true,
        lastSearchKeyword: keyword.trim(),
        lastSearchSkillIds: skills.map((skill) => skill.id),
      });
    } catch (e) {
      console.error("Failed to search tasks", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // начальная загрузка первой страницы при монтировании
  useEffect(() => {
    if (!hasSearched) {
      doSearch(1, keywordInput, selectedSkills);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => doSearch(1, keywordInput, selectedSkills);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) doSearch(page, keywordInput, selectedSkills);
  };

  const isSearchChanged =
    keywordInput.trim() !== lastSearchKeyword ||
    selectedSkills.length !== lastSearchSkillIds.length ||
    !selectedSkills.every(s => lastSearchSkillIds.includes(s.id));

  // поиск навыков для BentoSearch
  const fetchSkillLevels = useCallback(async (query: string): Promise<SkillLevelItem[]> => {
    const params = new URLSearchParams();
    if (query.includes(" - ")) {
      const [skill, level] = query.split(" - ", 2);
      if (skill) params.append("skill", skill.trim());
      if (level) params.append("level", level.trim());
    } else {
      if (query) params.append("skill", query.trim());
    }
    const data = await authJson<SkillLevelSearchResponse>(`/skills/skill_levels?${params.toString()}`);
    return data.items;
  }, []);

  // фильтрация: не добавляем только точные дубликаты одного и того же уровня
  const fetchSkillsForSearch = useCallback(async (query: string): Promise<SkillLevelItem[]> => {
    const items = await fetchSkillLevels(query);
    return items.filter(item => !selectedSkills.some(s => s.id === item.id));
  }, [fetchSkillLevels, selectedSkills]);

  const handleAddSkill = (item: SkillLevelItem) => {
    setSelectedSkills([...selectedSkills, item]);
  };

  const handleRemoveSkill = (item: SkillLevelItem) => {
    setSelectedSkills(selectedSkills.filter((skill) => skill.id !== item.id));
  };

  const openTaskDetails = async (taskId: number) => {
    setIsTaskLoading(true);
    setIsModalOpen(true);
    setModalView("details");
    try {
      const data = await authJson<TaskDetail>(`/tasks/${taskId}/public`);
      setSelectedTask(data);
    } catch (e) {
      console.error("Failed to fetch task details", e);
      setIsModalOpen(false);
    } finally {
      setIsTaskLoading(false);
    }
  };

  const fetchPage = useCallback(async (page: number, limit: number) => {
    try {
      const data = await authJson<{ items: RepoItem[]; total_items: number }>(
        `/github/repos?page=${page}&limit=${limit}`
      );
      return data;
    } catch (err) {
      console.error("Failed to fetch repos", err);
      return null;
    }
  }, []);

  const loadRepos = useCallback(async () => {
    if (isInitialized || !githubProfile?.connected) return;

    // подгружаем сразу побольше для автокомплита (например, 100 штук)
    const data = await fetchPage(1, 100);
    if (data) {
      const computedTotalPages = Math.max(1, Math.ceil(data.total_items / ITEMS_PER_TABLE_PAGE.REPOS));
      const itemsWithId = data.items.map(item => ({ ...item, id: item.name }));
      setReposData(itemsWithId, computedTotalPages, [1]);
    }
  }, [fetchPage, githubProfile?.connected, isInitialized, setReposData]);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    if (!selectedTask) return;
    const updatedTask = results.find((task) => task.id === selectedTask.id);
    if (!updatedTask) return;

    setSelectedTask((currentTask) => (
      currentTask?.id === updatedTask.id
        ? {
            ...currentTask,
            attached_repo_name: updatedTask.attached_repo_name,
            latest_attempt: updatedTask.latest_attempt,
            analysis_status: updatedTask.analysis_status,
            analysis_repo_name: updatedTask.analysis_repo_name,
            analysis_repo_url: updatedTask.analysis_repo_url,
          }
        : currentTask
    ));
  }, [results, selectedTask?.id]);

  const handleFetchRepos = async (query: string): Promise<RepoItem[]> => {
    // если профиль привязан, но репозитории еще не загружены — пробуем загрузить
    if (githubProfile?.connected && !isInitialized) {
      await loadRepos();
    }

    // фильтруем из стора
    const lowerQuery = query.toLowerCase();
    return repos.filter(r => r.name.toLowerCase().includes(lowerQuery));
  };

  const isRepoAlreadyChecked = (repo: RepoItem) => {
    if (!repo.analyzed_at || !repo.last_commit_date) return false;
    return new Date(repo.analyzed_at).getTime() >= new Date(repo.last_commit_date).getTime();
  };

  const handleAttachRepo = async (repo: RepoItem) => {
    if (!selectedTask) return;
    if (isRepoAlreadyChecked(repo)) return;

    setIsSubmitting(true);
    try {
      await authJson("/analysis/repository", {
        method: "POST",
        body: JSON.stringify({
          gh_id: repo.gh_id,
          repo_name: repo.name,
          repo_url: repo.url,
          last_commit_date: repo.last_commit_date,
          task_id: selectedTask.id,
        }),
      });
      showToast({
        title: "Успех",
        message: `Репозиторий ${repo.name} поставлен в очередь на обработку.`,
        variant: "success",
      });
      updateRepoStatus(repo.name, "Подготовка");
      setTaskAnalysisStatus(selectedTask.id, "preparing", { name: repo.name, url: repo.url });
      setSelectedTask({
        ...selectedTask,
        analysis_status: "preparing",
        analysis_repo_name: repo.name,
        analysis_repo_url: repo.url,
      });
      setModalView("details");
    } catch (err) {
      // ошибка уже показана authJson
      if (err instanceof Error && err.message.includes("Репозиторий слишком большой")) {
        updateRepoStatus(repo.name, "Недоступен");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectGitHub = async () => {
    setIsSubmitting(true);
    try {
      const data = await authJson<{ authorization_url: string }>("/github/connect-url");
      window.location.assign(data.authorization_url);
    } catch (err) {
      showToast({
        title: "Ошибка GitHub",
        message: err instanceof Error && err.message ? err.message : "Не удалось начать авторизацию GitHub.",
        variant: "error",
      });
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const getAttemptRepoUrl = (repoName: string | null | undefined) => {
    if (!repoName) return null;
    if (selectedTask?.latest_attempt?.repo_name === repoName && selectedTask.latest_attempt.repo_url) {
      return selectedTask.latest_attempt.repo_url;
    }
    return repos.find((repo) => repo.name === repoName)?.url ?? null;
  };

  const getRequirementStatus = (requirementId: number) => {
    if (selectedTask?.analysis_status) return null;
    if (!selectedTask?.latest_attempt) return null;
    if (selectedTask.latest_attempt.successful) return "success";
    if (selectedTask.latest_attempt.failed_requirements.length === 0) return "failed";
    return selectedTask.latest_attempt.failed_requirements.some((requirement) => requirement.id === requirementId)
      ? "failed"
      : "success";
  };

  const getTaskStatusText = (task: TaskDetail) => {
    if (task.analysis_status === "preparing") {
      return "подготовка";
    }
    if (task.analysis_status === "processing") {
      return "проверка";
    }
    if (task.latest_attempt?.successful) {
      return "задание выполнено успешно";
    }
    if (task.latest_attempt) {
      return "задание не выполнено";
    }
    return null;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* sticky панель поиска — bg совпадает с фоном, без рамок */}
      <div className="sticky top-0 z-20 bg-gray-50 px-8 pt-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Банк заданий</h1>
        <h2 className="mb-6 ml-1 text-xl font-bold text-gray-800">для закрепления навыков на практике</h2>
        {/* поле по названию/описанию + кнопка — занимают половину ширины, соотношение 3:1 */}
        <div className="flex gap-3 items-center mb-4 w-1/2 min-w-md">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            maxLength={TASK.SEARCH_KEYWORDS.MAX_LENGTH}
            className="input-field mt-0! flex-3"
            placeholder="Поиск по названию и описанию"
          />
          <button
            onClick={handleSearch}
            disabled={!isSearchChanged || isLoading}
            className="primary-button flex-1 flex items-center justify-center"
          >
            {isLoading ? <LoadingText text="Поиск..." /> : "Найти"}
          </button>
        </div>

        {/* бенто поиск по навыкам — overflow-visible чтобы дропдаун не обрезался */}
        <div className="pb-4 overflow-visible">
          <BentoSearch<SkillLevelItem, SkillLevelItem>
            items={selectedSkills}
            itemToString={(s) => `${s.skill_name} - ${s.level_name}`}
            itemToId={(s) => s.id}
            renderItem={(s) => (
              <>
                {s.skill_name} - <span className="opacity-70">{s.level_name}</span>
              </>
            )}
            prefixTitle="Навыки"
            reorderEnabled={false}
            closeable={true}
            customSelectLogic={false}
            onRemove={handleRemoveSkill}
            onSearch={fetchSkillsForSearch}
            onAdd={handleAddSkill}
            searchItemToString={(s) => `${s.skill_name} - ${s.level_name}`}
            renderSearchItem={(s) => (
              <>
                {s.skill_name} - <span className="text-gray-500">{s.level_name}</span>
              </>
            )}
            placeholder="Название навыка"
            buttonText="Добавить"
            debounceMs={SEARCH_DEBOUNCE_MS}
          />
        </div>

        {/* градиент начинается ровно там, где кончается панель поиска */}
        <div className="h-6 pointer-events-none bg-linear-to-b from-gray-50 to-transparent" />
      </div>

      {/* область результатов */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {!hasSearched || isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            {isLoading ? <LoadingText text="Загрузка..." /> : ""}
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            Задания не найдены
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {results.map((task) => (
                <TaskCard key={task.id} task={task} onClick={openTaskDetails} />
              ))}
            </div>

            {/* пагинация */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              className="mt-8"
            />
          </>
        )}
      </div>

      {/* модальное окно подробностей и прикрепления проекта */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-overlay-animate"
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-gray-100 modal-content-animate flex flex-col max-h-[90vh]">
            {isTaskLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <LoadingText text="Загрузка информации..." className="text-gray-500" iconClassName="h-10 w-10 text-primary" />
              </div>
            ) : selectedTask && (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  {modalView === "details" ? selectedTask.title : "Прикрепить репозиторий"}
                </h3>

                {modalView === "details" ? (
                  <>
                    <div className="flex-1 overflow-y-auto pr-2 mb-8 custom-scrollbar">
                      <div className="text-gray-700 whitespace-pre-line text-lg leading-relaxed mb-6">
                        {selectedTask.description}
                      </div>
                      {selectedTask.requirements.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                            Требования
                          </h4>
                          <ul className="space-y-2">
                            {selectedTask.requirements.map((requirement) => {
                              const status = getRequirementStatus(requirement.id);
                              const isFailed = status === "failed";
                              const isSuccessful = status === "success";

                              return (
                                <li
                                  key={requirement.id}
                                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                                    isFailed
                                      ? "border-red-100 bg-red-50 text-danger"
                                      : isSuccessful
                                        ? "border-green-100 bg-green-50 text-success"
                                        : "border-gray-100 bg-gray-50 text-gray-700"
                                  }`}
                                >
                                  {isFailed && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                                  {isSuccessful && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                                  <span>{requirement.description}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      <div className="mb-4">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                          Навыки
                        </h4>
                        <BentoSearch<TaskPublicSkillItem, SkillLevelItem>
                          items={selectedTask.skills}
                          itemToString={(skill) => `${skill.skill_name} - ${skill.level_name}`}
                          itemToId={(skill) => skill.skill_level_id}
                          renderItem={(skill) => (
                            <>
                              {skill.skill_name} - <span className="opacity-70">{skill.level_name}</span>
                            </>
                          )}
                          reorderEnabled={false}
                          closeable={false}
                          customSelectLogic={false}
                          onSearch={async () => [] as SkillLevelItem[]}
                          onAdd={() => undefined}
                          searchItemToString={(skill) => `${skill.skill_name} - ${skill.level_name}`}
                          hideSearch={true}
                        />
                      </div>
                      {(selectedTask.analysis_status || selectedTask.latest_attempt) && (
                        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                          {(() => {
                            const status = getTaskStatusText(selectedTask);
                            const repoName = selectedTask.analysis_status
                              ? selectedTask.analysis_repo_name
                              : selectedTask.latest_attempt?.repo_name;
                            const repoUrl = selectedTask.analysis_status
                              ? selectedTask.analysis_repo_url
                              : getAttemptRepoUrl(repoName);

                            return (
                              <>
                                {repoName && (
                                  <p className="font-semibold text-gray-900">
                                    Последняя попытка:{" "}
                                    {repoUrl ? (
                                      <a
                                        href={repoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        {repoName}
                                      </a>
                                    ) : (
                                      repoName
                                    )}
                                  </p>
                                )}
                                {status && (
                                  <p className="mt-1">
                                    Статус: {status}
                                  </p>
                                )}
                                {selectedTask.latest_attempt?.completed_at && !selectedTask.analysis_status && (
                                  <p className="mt-1">
                                    Завершено: {formatDateTime(selectedTask.latest_attempt.completed_at)}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 py-3 px-6 border border-gray-400 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                      >
                        Вернуться
                      </button>
                      {selectedTask.analysis_status ? (
                        <div className="flex-1 py-3 px-6 border border-warning text-warning font-semibold rounded-xl text-center bg-transparent">
                          Проверка выполняется
                        </div>
                      ) : selectedTask.latest_attempt?.successful ? (
                        <div className="flex-1 py-3 px-6 border border-success text-success font-semibold rounded-xl text-center bg-transparent">
                          Задание выполнено
                        </div>
                      ) : (
                        <button
                          onClick={() => setModalView("attach")}
                          className="flex-1 py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-all shadow-md hover:shadow-lg"
                        >
                          Прикрепить репозиторий
                        </button>
                      )}
                    </div>
                  </>
                ) : !githubProfile?.connected ? (
                  <div className="flex flex-col items-start py-6">
                    <p className="text-gray-600 mb-8 text-center text-lg leading-relaxed">
                      Привяжите свой профиль GitHub в настройках профиля, чтобы выбрать репозиторий для проверки.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectGitHub}
                      disabled={isSubmitting}
                      className="github-connect-button justify-center py-4 mb-6"
                    >
                      <GitHubIcon className="w-8 h-8" />
                      <span className="font-semibold text-lg">Привязать профиль GitHub</span>
                    </button>
                    <button
                      onClick={() => setModalView("details")}
                      disabled={isSubmitting}
                      className="flex-1 py-3 px-6 border border-gray-400 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Назад
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-600 mb-6 text-center">
                      Выберите свой репозиторий GitHub для проверки на соответствие требованиям этого задания.
                    </p>
                    <div className="mb-10">
                      <AutocompleteSearch<RepoItem>
                        onSearch={handleFetchRepos}
                        onSelect={handleAttachRepo}
                        itemToString={(r) => r.name}
                        isItemDisabled={isRepoAlreadyChecked}
                        placeholder="Название репозитория"
                        buttonText="Выбрать и отправить"
                        debounceMs={isInitialized ? 0 : SEARCH_DEBOUNCE_MS}
                        renderItem={(r) => (
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{r.name}</span>
                            {r.description && <span className="text-xs text-gray-500 truncate">{r.description}</span>}
                            {isRepoAlreadyChecked(r) && (
                              <span className="text-xs text-gray-500">
                                Репозиторий уже проверен для текущей версии кода
                              </span>
                            )}
                          </div>
                        )}
                      />
                    </div>
                    {isSubmitting && (
                      <div className="flex items-center justify-center gap-2 text-primary font-medium mb-6">
                        <LoadingText text="Отправка на проверку..." iconClassName="h-5 w-5" />
                      </div>
                    )}
                    <button
                      onClick={() => setModalView("details")}
                      disabled={isSubmitting}
                      className="flex-1 py-3 px-6 border border-gray-400 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Назад
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
