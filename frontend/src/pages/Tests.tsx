import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, ListChecks, XCircle } from "lucide-react";

import { authFetch, authJson } from "../auth";
import { config, ITEMS_PER_PAGE, TEST } from "../config";
import { BentoSearch } from "../components/BentoSearch";
import { LoadingText } from "../components/LoadingText";
import { Pagination } from "../components/Pagination";
import { PsFunctionSelectorField } from "../components/PsFunctionSelectorField";
import { TestCard } from "../components/TestCard";
import { useClassifierTree } from "../hooks/useClassifierTree";
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
  const navigate = useNavigate();
  const location = useLocation();
  const initialRefreshRef = useRef(false);
  const restoredSelectionRef = useRef(false);
  const {
    keywordInput,
    onlyUnpassed,
    selectedSkills,
    selectedPsFunctions,
    results,
    currentPage,
    totalPages,
    hasSearched,
    lastSearchKeyword,
    lastSearchOnlyUnpassed,
    lastSearchSkillIds,
    lastSearchPsFunctionIds,
    setKeywordInput,
    setOnlyUnpassed,
    setSelectedSkills,
    setSelectedPsFunctions,
    setSearchState,
  } = useTestsStore();

  const { items: classifierTree, isLoading: isClassifierLoading } = useClassifierTree();
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestPublicItem | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);
  const attemptState = location.state as {
    skillId?: number;
    skillLevelId?: number;
    forceRefresh?: boolean;
  } | null;

  const doSearch = useCallback(async (
    page: number,
    keyword: string,
    psFunctions = selectedPsFunctions,
    onlyUnpassedValue = onlyUnpassed,
    skillLevels = selectedSkills,
  ) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ITEMS_PER_PAGE.TESTS.toString(),
      });
      if (keyword.trim()) params.append("keyword", keyword.trim());
      if (onlyUnpassedValue) params.append("only_unpassed", "true");
      for (const item of skillLevels) {
        params.append("skill_level_ids", String(item.id));
      }
      for (const item of psFunctions) {
        params.append("ps_function_ids", String(item.id));
      }
      const data = await authJson<TestPublicSearchResponse>(`/tests/public?${params.toString()}`);
      setSearchState({
        results: data.items,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        hasSearched: true,
        lastSearchKeyword: keyword.trim(),
        lastSearchOnlyUnpassed: onlyUnpassedValue,
        lastSearchSkillIds: skillLevels.map((item) => item.id),
        lastSearchPsFunctionIds: psFunctions.map((item) => item.id),
      });
    } catch (error) {
      console.error("Failed to search tests", error);
    } finally {
      setIsLoading(false);
    }
  }, [onlyUnpassed, selectedPsFunctions, selectedSkills, setSearchState]);

  useEffect(() => {
    if (initialRefreshRef.current) return;
    initialRefreshRef.current = true;

    // lastSearchSkillIds хранит временный фильтр при открытии рекомендации.
    // После восстановления нужной карточки selectedSkills очищается, поэтому при
    // следующем входе возвращаем обычную первую страницу без скрытого фильтра.
    if (!hasSearched || lastSearchSkillIds.length > 0) {
      doSearch(1, keywordInput, selectedPsFunctions, onlyUnpassed);
      return;
    }

    if (attemptState?.forceRefresh || attemptState?.skillLevelId) {
      doSearch(currentPage, lastSearchKeyword || keywordInput, selectedPsFunctions, onlyUnpassed);
    }
  }, [
    attemptState?.forceRefresh,
    attemptState?.skillLevelId,
    currentPage,
    doSearch,
    hasSearched,
    keywordInput,
    lastSearchKeyword,
    lastSearchSkillIds.length,
    onlyUnpassed,
    selectedPsFunctions,
  ]);

  const handleSearch = () => doSearch(1, keywordInput, selectedPsFunctions, onlyUnpassed);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) doSearch(page, keywordInput, selectedPsFunctions, onlyUnpassed);
  };

  const selectedPsFunctionIds = selectedPsFunctions.map((item) => item.id);
  const isSearchChanged =
    keywordInput.trim() !== lastSearchKeyword ||
    onlyUnpassed !== lastSearchOnlyUnpassed ||
    lastSearchSkillIds.length > 0 ||
    selectedPsFunctionIds.length !== lastSearchPsFunctionIds.length ||
    !selectedPsFunctionIds.every((id) => lastSearchPsFunctionIds.includes(id));

  const openTestDetails = (test: TestPublicItem, level: TestPublicLevelItem) => {
    setSelectedTest(test);
    setSelectedLevelId(level.id);
  };

  const activeModalLevel = useMemo(() => {
    if (!selectedTest) return null;
    return selectedTest.levels.find((level) => level.id === selectedLevelId) ?? selectedTest.levels[0] ?? null;
  }, [selectedLevelId, selectedTest]);

  useEffect(() => {
    if (!selectedTest) return;
    const updatedTest = results.find((test) => test.skill_id === selectedTest.skill_id);
    if (!updatedTest) return;
    const updatedLevel = updatedTest.levels.find((level) => level.id === selectedLevelId) ?? updatedTest.levels[0] ?? null;
    setSelectedTest(updatedTest);
    setSelectedLevelId(updatedLevel?.id ?? null);
  }, [results, selectedLevelId, selectedTest]);

  const modalDescription = activeModalLevel?.description_preview || "Описание теста пока не заполнено.";
  useEffect(() => {
    if (restoredSelectionRef.current || !attemptState?.skillLevelId || results.length === 0) {
      return;
    }
    const test = results.find((item) => (
      attemptState.skillId
        ? item.skill_id === attemptState.skillId
        : item.levels.some((level) => level.skill_level_id === attemptState.skillLevelId)
    ));
    const level = test?.levels.find((item) => item.skill_level_id === attemptState.skillLevelId);
    if (!test || !level) return;
    restoredSelectionRef.current = true;
    setSelectedTest(test);
    setSelectedLevelId(level.id);
    setSelectedSkills([]);
    navigate("/tests", { replace: true, state: null });
  }, [attemptState, navigate, results, setSelectedSkills]);

  const handleStartAttempt = async () => {
    if (!activeModalLevel || isStarting) return;
    setIsStarting(true);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/tests/public/${activeModalLevel.skill_level_id}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        await doSearch(currentPage, lastSearchKeyword || keywordInput, selectedPsFunctions, onlyUnpassed);
        return;
      }
      const attempt = await response.json() as { attempt_id: string };
      navigate(`/tests/attempt/${attempt.attempt_id}`, {
        state: {
          attempt,
          skillId: selectedTest?.skill_id,
          skillLevelId: activeModalLevel.skill_level_id,
        },
      });
    } catch (error) {
      console.error("Failed to start test attempt", error);
    } finally {
      setIsStarting(false);
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const renderLevel = (level: TestPublicLevelItem) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{level.level_name}</span>
      {level.latest_attempt_passed === true && (
        <CheckCircle2 className={`h-4 w-4 shrink-0 ${level.id === activeModalLevel?.id ? "text-white" : "text-success"}`} />
      )}
      {level.latest_attempt_passed === false && (
        <XCircle className={`h-4 w-4 shrink-0 ${level.id === activeModalLevel?.id ? "text-white" : "text-danger"}`} />
      )}
    </span>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="sticky top-0 z-20 bg-gray-50 px-8 pt-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Банк тестов</h1>
        <h2 className="mb-6 ml-1 text-xl font-bold text-gray-800">для проверки теоретических основ</h2>

        <label className="mb-3 ml-1 flex w-fit items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={onlyUnpassed}
            onChange={(event) => setOnlyUnpassed(event.target.checked)}
            className="checkbox-field"
          />
          Искать только среди непройденных тестов
        </label>
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
            className="primary-button flex-1 flex items-center justify-center"
          >
            {isLoading ? <LoadingText text="Поиск..." /> : "Найти"}
          </button>
        </div>

        <PsFunctionSelectorField
          items={classifierTree}
          selectedFunctions={selectedPsFunctions}
          isLoading={isClassifierLoading}
          maxSelected={null}
          onChange={setSelectedPsFunctions}
        />

        <div className="h-6 pointer-events-none bg-linear-to-b from-gray-50 to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {!hasSearched || isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            {isLoading ? <LoadingText text="Загрузка..." /> : ""}
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
                renderItem={renderLevel}
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

            {activeModalLevel.latest_attempt_completed_at && (
              <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">
                  Последний результат: {activeModalLevel.latest_attempt_score} из {activeModalLevel.latest_attempt_total_score} баллов
                </p>
                <p className="mt-1">
                  Статус: {activeModalLevel.latest_attempt_passed ? "тест пройден успешно" : "тест не пройден"}
                </p>
                <p className="mt-1">
                  Завершено: {formatDateTime(activeModalLevel.latest_attempt_completed_at)}
                </p>
                {activeModalLevel.next_attempt_at && activeModalLevel.can_start_attempt === false && (
                  <p className="mt-1">
                    Следующая попытка будет доступна: {formatDateTime(activeModalLevel.next_attempt_at)}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => setSelectedTest(null)}
                className="flex-1 py-3 px-6 border border-gray-400 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all"
              >
                Вернуться
              </button>
              <button
                onClick={handleStartAttempt}
                disabled={activeModalLevel.can_start_attempt === false || isStarting}
                className="flex-1 py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-all shadow-md hover:shadow-lg flex items-center justify-center"
              >
                {isStarting ? <LoadingText text="Запуск..." /> : "Начать тест"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
