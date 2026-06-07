import { useState, useCallback, useEffect, useMemo } from "react";
import { CheckCircle2, Clock, ListChecks } from "lucide-react";

import { authJson } from "../auth";
import { ITEMS_PER_PAGE, TEST } from "../config";
import { BentoSearch } from "../components/BentoSearch";
import { Pagination } from "../components/Pagination";
import { TestCard } from "../components/TestCard";
import { useTestsStore, type TestPublicItem, type TestPublicLevelItem } from "../hooks/useTestsStore";

interface TestPublicSearchResponse {
  items: TestPublicItem[];
  total_pages: number;
  current_page: number;
}

function getQuestionsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "вопросов";
  if (mod10 === 1) return "вопрос";
  if (mod10 >= 2 && mod10 <= 4) return "вопроса";
  return "вопросов";
}

function getMinutesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "минут";
  if (mod10 === 1) return "минута";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

export default function Tests() {
  const {
    keywordInput,
    results,
    currentPage,
    totalPages,
    hasSearched,
    lastSearchKeyword,
    lastSearchSkillIds,
    setKeywordInput,
    setSearchState,
  } = useTestsStore();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestPublicItem | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);

  const doSearch = useCallback(async (page: number, keyword: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ITEMS_PER_PAGE.TESTS.toString(),
      });
      if (keyword.trim()) params.append("keyword", keyword.trim());
      const data = await authJson<TestPublicSearchResponse>(`/tests/public?${params.toString()}`);
      setSearchState({
        results: data.items,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        hasSearched: true,
        lastSearchKeyword: keyword.trim(),
        lastSearchSkillIds: [],
      });
    } catch (error) {
      console.error("Failed to search tests", error);
    } finally {
      setIsLoading(false);
    }
  }, [setSearchState]);

  useEffect(() => {
    if (!hasSearched || lastSearchSkillIds.length > 0) {
      doSearch(1, keywordInput);
    }
  }, [doSearch, hasSearched, keywordInput, lastSearchSkillIds.length]);

  const handleSearch = () => doSearch(1, keywordInput);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) doSearch(page, keywordInput);
  };

  const isSearchChanged = keywordInput.trim() !== lastSearchKeyword || lastSearchSkillIds.length > 0;

  const openTestDetails = (test: TestPublicItem, level: TestPublicLevelItem) => {
    setSelectedTest(test);
    setSelectedLevelId(level.id);
  };

  const activeModalLevel = useMemo(() => {
    if (!selectedTest) return null;
    return selectedTest.levels.find((level) => level.id === selectedLevelId) ?? selectedTest.levels[0] ?? null;
  }, [selectedLevelId, selectedTest]);

  const modalDescription = activeModalLevel?.description_preview || "Описание теста пока не заполнено.";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="sticky top-0 z-20 bg-gray-50 px-8 pt-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Банк тестов</h1>
        <h2 className="mb-6 ml-1 text-xl font-bold text-gray-800">для повторения теоретических навыков</h2>

        <div className="flex gap-3 items-center mb-4 w-1/2 min-w-md">
          <input
            type="text"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleSearch(); }}
            maxLength={TEST.SEARCH_KEYWORDS.MAX_LENGTH}
            className="input-field mt-0! flex-3"
            placeholder="Поиск по навыку и содержанию"
          />
          <button
            onClick={handleSearch}
            disabled={!isSearchChanged || isLoading}
            className="primary-button flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? "Поиск..." : "Найти"}
          </button>
        </div>

        <div className="h-6 pointer-events-none bg-linear-to-b from-gray-50 to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {!hasSearched || isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            {isLoading ? "Загрузка..." : ""}
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            Тесты не найдены
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              {results.map((test) => (
                <TestCard key={test.id} test={test} onClick={openTestDetails} />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              className="mt-8"
            />
          </>
        )}
      </div>

      {selectedTest && activeModalLevel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-overlay-animate"
          onClick={(event) => event.target === event.currentTarget && setSelectedTest(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-gray-100 modal-content-animate flex flex-col max-h-[90vh]">
            <h3 className="text-2xl font-bold text-gray-900 mb-5 text-center">
              {selectedTest.skill_name}
            </h3>

            <div className="mb-6">
              <BentoSearch<TestPublicLevelItem, TestPublicLevelItem>
                items={selectedTest.levels}
                itemToString={(level) => level.level_name}
                itemToId={(level) => level.id}
                renderItem={(level) => level.level_name}
                prefixTitle="Уровни"
                activeItemId={activeModalLevel.id}
                reorderEnabled={false}
                closeable={false}
                customSelectLogic={false}
                onItemClick={(level) => setSelectedLevelId(level.id)}
                onSearch={async () => []}
                onAdd={() => undefined}
                searchItemToString={(level) => level.level_name}
                hideSearch={true}
              />
            </div>

            <div className="flex flex-wrap gap-4 mb-6 text-sm font-semibold text-gray-600">
              <span className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary" />
                {activeModalLevel.question_count} {getQuestionsWord(activeModalLevel.question_count)}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                {activeModalLevel.time_limit_minutes} {getMinutesWord(activeModalLevel.time_limit_minutes)}
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                {activeModalLevel.threshold_score} баллов из {activeModalLevel.total_score} необходимо набрать
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 mb-8 custom-scrollbar">
              <div className="text-gray-700 whitespace-pre-line text-lg leading-relaxed">
                {modalDescription}
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Тест доступен к прохождению один раз в 7 дней вне зависимости от результата.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setSelectedTest(null)}
                className="flex-1 py-3 px-6 border border-gray-400 text-gray-700 font-semibold rounded-xl cursor-pointer hover:bg-gray-50 transition-all"
              >
                Вернуться
              </button>
              <button
                onClick={() => undefined}
                className="flex-1 py-3 px-6 bg-primary text-white font-semibold rounded-xl cursor-pointer hover:bg-primary-hover transition-all shadow-md hover:shadow-lg"
              >
                Начать тест
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
