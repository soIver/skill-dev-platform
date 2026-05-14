import { useState, useCallback, useEffect } from "react";
import { authJson } from "../auth";
import { ITEMS_PER_PAGE, TASK, SEARCH_DEBOUNCE_MS } from "../config";
import { BentoSearch } from "../components/BentoSearch";

// интерфейсы

interface TaskPublicItem {
  id: number;
  title: string;
  description_preview: string;
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
            disabled={isLoading}
            className="primary-button flex-1 disabled:opacity-60"
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
        <div className="h-6 pointer-events-none bg-gradient-to-b from-gray-50 to-transparent" />
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
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-2 hover:border-gray-400 hover:shadow-md transition-all"
                >
                  <p className="font-semibold text-gray-900 truncate" title={task.title}>
                    {task.title}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {truncateDescription(task.description_preview)}
                  </p>
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
    </div>
  );
}
