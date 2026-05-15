import { useState, useCallback, useEffect } from "react";
import { authJson } from "../auth";
import { ITEMS_PER_PAGE, TASK, SEARCH_DEBOUNCE_MS, ITEMS_PER_TABLE_PAGE } from "../config";
import { BentoSearch } from "../components/BentoSearch";
import { AutocompleteSearch } from "../components/AutocompleteSearch";
import { useToast } from "../components/ToastProvider";
import { useRepositoriesStore, type RepoItem } from "../hooks/useRepositoriesStore";
import { useUserStore } from "../hooks/useUserStore";
import GitHubIcon from "../assets/icons/github.svg?react";
import { Loader2 } from "lucide-react";

// интерфейсы

interface TaskPublicItem {
  id: number;
  title: string;
  description_preview: string;
  skills: { skill_name: string; level_name: string }[];
}

interface TaskPublicSearchResponse {
  items: TaskPublicItem[];
  total_pages: number;
  current_page: number;
}

interface SkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
}

interface SkillLevelSearchResponse {
  items: SkillLevelItem[];
  total_pages: number;
}

interface TaskDetail {
  id: number;
  title: string;
  description: string;
  skills: { skill_name: string; level_name: string }[];
}

// максимальная длина превью описания (аналогично content/Tasks.tsx)
const DESCRIPTION_PREVIEW_MAX = 120;

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_PREVIEW_MAX) return text;
  return text.slice(0, DESCRIPTION_PREVIEW_MAX) + "…";
}

export default function Tasks() {
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<SkillLevelItem[]>([]);
  const [results, setResults] = useState<TaskPublicItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // храним параметры последнего выполненного поиска
  const [lastSearchKeyword, setLastSearchKeyword] = useState("");
  const [lastSearchSkillIds, setLastSearchSkillIds] = useState<number[]>([]);

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

  // функция поиска — только по кнопке (или при смене страницы)
  const doSearch = useCallback(async (page: number, keyword: string, skills: SkillLevelItem[]) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: ITEMS_PER_PAGE.TASKS.toString() });
      if (keyword.trim()) params.append("keyword", keyword.trim());
      for (const s of skills) {
        params.append("skill_level_ids", String(s.id));
      }
      const data = await authJson<TaskPublicSearchResponse>(`/tasks?${params.toString()}`);
      setResults(data.items);
      setCurrentPage(data.current_page);
      setTotalPages(data.total_pages);
      setHasSearched(true);

      // запоминаем успешный поиск
      setLastSearchKeyword(keyword.trim());
      setLastSearchSkillIds(skills.map(s => s.id));
    } catch (e) {
      console.error("Failed to search tasks", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // начальная загрузка первой страницы при монтировании
  useEffect(() => {
    doSearch(1, "", []);
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

  // фильтрация: нельзя добавить другой уровень того же навыка
  const fetchSkillsForSearch = useCallback(async (query: string): Promise<SkillLevelItem[]> => {
    const items = await fetchSkillLevels(query);
    return items.filter(item => !selectedSkills.some(s => s.skill_name === item.skill_name));
  }, [fetchSkillLevels, selectedSkills]);

  const handleAddSkill = (item: SkillLevelItem) => {
    setSelectedSkills(prev => [...prev, item]);
  };

  const handleRemoveSkill = (item: SkillLevelItem) => {
    setSelectedSkills(prev => prev.filter(s => s.id !== item.id));
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

  const handleFetchRepos = async (query: string): Promise<RepoItem[]> => {
    // если профиль привязан, но репозитории еще не загружены — пробуем загрузить
    if (githubProfile?.connected && !isInitialized) {
      await loadRepos();
    }

    // фильтруем из стора
    const lowerQuery = query.toLowerCase();
    return repos.filter(r => r.name.toLowerCase().includes(lowerQuery));
  };

  const handleAttachRepo = async (repo: RepoItem) => {
    if (!selectedTask) return;
    setIsSubmitting(true);
    try {
      await authJson("/analysis/repository", {
        method: "POST",
        body: JSON.stringify({
          repo_name: repo.name,
          repo_url: repo.url,
          last_commit_date: repo.last_commit_date,
          task_id: selectedTask.id,
        }),
      });
      showToast({
        title: "Анализ запущен",
        message: `Репозиторий ${repo.name} анализируется по навыкам задания.`,
        variant: "success",
      });
      updateRepoStatus(repo.name, "В процессе...");
      setIsModalOpen(false);
    } catch (e) {
      showToast({
        title: "Ошибка",
        message: e instanceof Error ? e.message : "Не удалось запустить анализ",
        variant: "error",
      });
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* sticky панель поиска — bg совпадает с фоном, без рамок */}
      <div className="sticky top-0 z-20 bg-gray-50 px-8 pt-6">
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
            className="primary-button flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? "Поиск..." : "Найти"}
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
            placeholder="Навык - Уровень"
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
            {isLoading ? "Загрузка..." : ""}
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            Задания не найдены
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {results.map((task) => (
                <div
                  key={task.id}
                  onClick={() => openTaskDetails(task.id)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-2 hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <p className="font-semibold text-gray-900 truncate" title={task.title}>
                    {task.title}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {truncateDescription(task.description_preview)}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {task.skills.slice(0, 5).map((s, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        {s.skill_name} — {s.level_name}
                      </span>
                    ))}
                    {task.skills.length > 5 && (
                      <span className="px-2 py-0.5 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                        +{task.skills.length - 5}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-2">
                    <span className="text-primary font-medium text-sm transition-colors">
                      Подробнее
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* пагинация */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
                >
                  ←
                </button>
                <span className="text-sm text-gray-600">
                  Страница {currentPage} из {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
                >
                  →
                </button>
              </div>
            )}
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
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-gray-500">Загрузка информации...</p>
              </div>
            ) : selectedTask && (
              <>
                <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  {modalView === "details" ? selectedTask.title : "Прикрепить проект"}
                </h3>

                {modalView === "details" ? (
                  <>
                    <div className="flex-1 overflow-y-auto pr-2 mb-8 custom-scrollbar">
                      <div className="text-gray-700 whitespace-pre-line text-lg leading-relaxed mb-6">
                        {selectedTask.description}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {selectedTask.skills.map((s, idx) => (
                          <span key={idx} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                            {s.skill_name} — {s.level_name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 py-3 px-6 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                      >
                        Вернуться
                      </button>
                      <button
                        onClick={() => setModalView("attach")}
                        className="flex-1 py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-all shadow-md hover:shadow-lg"
                      >
                        Прикрепить проект
                      </button>
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
                      className="w-1/4 py-3 px-6 border border-gray-200 text-gray-700 font-semibold rounded-full hover:bg-gray-50 transition-all disabled:opacity-50"
                    >
                      Назад
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-600 mb-6 text-center">
                      Выберите свой репозиторий GitHub для анализа соответствия навыкам этого задания.
                    </p>
                    <div className="mb-10">
                      <AutocompleteSearch<RepoItem>
                        onSearch={handleFetchRepos}
                        onSelect={handleAttachRepo}
                        itemToString={(r) => r.name}
                        placeholder="Начните вводить название репозитория..."
                        buttonText="Выбрать и отправить"
                        debounceMs={isInitialized ? 0 : SEARCH_DEBOUNCE_MS}
                        renderItem={(r) => (
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{r.name}</span>
                            {r.description && <span className="text-xs text-gray-500 truncate">{r.description}</span>}
                          </div>
                        )}
                      />
                    </div>
                    {isSubmitting && (
                      <div className="flex items-center justify-center gap-2 text-primary font-medium mb-6">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Отправка на анализ...
                      </div>
                    )}
                    <button
                      onClick={() => setModalView("details")}
                      disabled={isSubmitting}
                      className=" px-6 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
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
