import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { SEARCH_DEBOUNCE_MS, TEST } from "../../config";
import { useContentStore, type TestItem, type SkillLevelItem, type QuestionEditorItem, type AnswerEditorItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { ContentOwnerFilter } from "../../components/ContentOwnerFilter";
import { IconButton } from "../../components/IconButton";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { NumberInput } from "../../components/NumberInput";
import { useToast } from "../../components/ToastProvider";
import { ChevronDown, X, Plus } from "lucide-react";

interface SearchResponse {
  items: TestItem[];
  total_pages: number;
  current_page: number;
}

interface SkillLevelSearchResponse {
  items: SkillLevelItem[];
  total_pages: number;
  current_page: number;
}

interface TestDetailAnswer {
  id: number;
  answer_text: string;
  is_correct: boolean;
}

interface TestDetailQuestion {
  id: number;
  question_text: string;
  points: number;
  answers: TestDetailAnswer[];
}

interface TestDetailResponse {
  id: number;
  description: string | null;
  time_limit_minutes: number;
  threshold_score: number;
  is_published: boolean;
  skill_level_id: number;
  skill_name: string;
  level_name: string;
  variant_number: number;
  questions: TestDetailQuestion[];
}

export default function ContentTests() {
  const { tests, setTestsState } = useContentStore();
  const {
    keywordInput,
    skillInput,
    ownerId,
    ownerUsername,
    results,
    currentPage,
    totalPages,
    lastSearch,
    selectedId,
    editorData,
    hasUnsavedChanges,
    pendingSelectId,
  } = tests;

  const { showToast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSkillToCreate, setSelectedSkillToCreate] = useState<SkillLevelItem | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newSkillLevelRef = useRef<SkillLevelItem | null>(null);

  const fetchTests = async (keyword: string, skill: string, ownerIdValue: number | null, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (keyword) params.append("keyword", keyword);
      if (skill) params.append("skill_query", skill);
      if (ownerIdValue !== null) params.append("author_id", ownerIdValue.toString());

      const response = await authJson<SearchResponse>(`/tests?${params.toString()}`);
      setTestsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { keyword, skill, ownerId: ownerIdValue, page }
      });
    } catch (error) {
      console.error("Failed to fetch tests", error);
    } finally {
      setIsSearching(false);
      setIsDebouncing(false);
    }
  };

  useEffect(() => {
    setIsDebouncing(true);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (
        keywordInput === lastSearch.keyword &&
        skillInput === lastSearch.skill &&
        ownerId === lastSearch.ownerId &&
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchTests(keywordInput, skillInput, ownerId, 1);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywordInput, skillInput, ownerId]);

  const fetchSkillLevels = async (query: string) => {
    let skill = query;
    let level = "";
    if (query.includes(" -")) {
      const parts = query.split(" -");
      skill = parts[0].trim();
      level = parts[1].trim();
    } else {
      skill = query.trim();
    }

    const params = new URLSearchParams({ skill, page: "1" });
    if (level) params.append("level", level);

    const response = await authJson<SkillLevelSearchResponse>(`/skills/skill_levels?${params.toString()}`);
    return response.items;
  };

  const handleSelectCreate = (item: SkillLevelItem) => {
    if (selectedId === "new") return;

    newSkillLevelRef.current = item;

    const newTestData = {
      description: "",
      time_limit_minutes: 3,
      threshold_score: 1,
      is_published: false,
      skill_level_id: item.id,
      skill_name: item.skill_name,
      level_name: item.level_name,
      questions: [
        {
          id: `temp-q-${Date.now()}`,
          question_text: "",
          points: 1,
          is_expanded: true,
          answers: [
            {
              id: `temp-a-${Date.now()}`,
              answer_text: "",
              is_correct: false,
            }
          ]
        }
      ]
    };

    if (hasUnsavedChanges) {
      setTestsState({ pendingSelectId: "new" });
    } else {
      setTestsState({
        selectedId: "new",
        editorData: newTestData,
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    }
  };

  const handleInputChange = (value: string) => {
    setTestsState({ skillInput: value });
  };

  const handleCreateSelectedTest = () => {
    if (!selectedSkillToCreate) return;
    handleSelectCreate(selectedSkillToCreate);
  };

  const loadTest = async (id: number) => {
    try {
      const response = await authJson<TestDetailResponse>(`/tests/${id}`);
      setTestsState({
        selectedId: id,
        editorData: {
          time_limit_minutes: response.time_limit_minutes,
          threshold_score: response.threshold_score,
          description: response.description ?? "",
          is_published: response.is_published,
          skill_level_id: response.skill_level_id,
          skill_name: response.skill_name,
          level_name: response.level_name,
          variant_number: response.variant_number,
          questions: response.questions.map((q) => ({
            id: q.id,
            question_text: q.question_text,
            points: q.points,
            is_expanded: true,
            answers: q.answers.map((a) => ({
              id: a.id,
              answer_text: a.answer_text,
              is_correct: a.is_correct
            }))
          }))
        },
        hasUnsavedChanges: false,
        pendingSelectId: null
      });
    } catch (error) {
      console.error("Failed to load test", error);
      showToast({ title: "Ошибка", message: "Не удалось загрузить тест", variant: "error" });
    }
  };

  const handleRowClick = (item: TestItem) => {
    if (item.id === selectedId) return;
    if (hasUnsavedChanges) {
      setTestsState({ pendingSelectId: item.id });
    } else {
      loadTest(item.id);
    }
  };

  const handleSave = async (publishStatus?: boolean) => {
    const isNew = selectedId === "new";
    const method = isNew ? "POST" : "PUT";
    const url = isNew ? "/tests" : `/tests/${selectedId}`;
    const newPublishStatus = publishStatus !== undefined ? publishStatus : editorData.is_published;

    try {
      const payload = {
        description: editorData.description.trim(),
        time_limit_minutes: Number(editorData.time_limit_minutes),
        threshold_score: Number(editorData.threshold_score),
        is_published: newPublishStatus,
        skill_level_id: editorData.skill_level_id,
        questions: editorData.questions.map((q) => ({
          question_text: q.question_text.trim(),
          points: Number(q.points),
          answers: q.answers.map((a) => ({
            answer_text: a.answer_text.trim(),
            is_correct: a.is_correct
          }))
        }))
      };

      const response = await authJson<{ id: number }>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
      await loadTest(response.id);
      fetchTests(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, currentPage);
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось сохранить изменения", variant: "error" });
    }
  };

  const handleDelete = async () => {
    if (selectedId === "new") {
      setTestsState({ selectedId: null, hasUnsavedChanges: false });
      return;
    }

    try {
      await authJson(`/tests/${selectedId}`, { method: "DELETE" });
      setTestsState({ selectedId: null, hasUnsavedChanges: false });
      showToast({ title: "Успех", message: "Тест удален", variant: "success" });
      fetchTests(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, currentPage);
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось удалить тест", variant: "error" });
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingSelectId) return;
    if (pendingSelectId === "new" && newSkillLevelRef.current) {
      const item = newSkillLevelRef.current;
      setTestsState({
        selectedId: "new",
        editorData: {
          description: "",
          time_limit_minutes: 3,
          threshold_score: 1,
          is_published: false,
          skill_level_id: item.id,
          skill_name: item.skill_name,
          level_name: item.level_name,
          questions: [
            {
              id: `temp-q-${Date.now()}`,
              question_text: "",
              points: 1,
              is_expanded: true,
              answers: [
                {
                  id: `temp-a-${Date.now()}`,
                  answer_text: "",
                  is_correct: false,
                }
              ]
            }
          ]
        },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    } else if (typeof pendingSelectId === "number") {
      loadTest(pendingSelectId);
    }
  };

  const handleCancelNavigation = () => {
    setTestsState({ pendingSelectId: null });
  };

  const updateEditorData = (changes: Partial<typeof editorData>) => {
    setTestsState({
      editorData: { ...editorData, ...changes },
      hasUnsavedChanges: true
    });
  };

  const handleAddQuestion = () => {
    const newQuestion: QuestionEditorItem = {
      id: `temp-q-${Date.now()}`,
      question_text: "",
      points: 1,
      is_expanded: true,
      answers: [
        {
          id: `temp-a-${Date.now()}`,
          answer_text: "",
          is_correct: false,
        }
      ]
    };
    updateEditorData({
      questions: [...editorData.questions, newQuestion]
    });
  };

  const handleRemoveQuestion = (qId: string | number) => {
    updateEditorData({
      questions: editorData.questions.filter((q) => q.id !== qId)
    });
  };

  const handleToggleExpandQuestion = (qId: string | number) => {
    updateEditorData({
      questions: editorData.questions.map((q) =>
        q.id === qId ? { ...q, is_expanded: !q.is_expanded } : q
      )
    });
  };

  const handleUpdateQuestion = <K extends "question_text" | "points">(
    qId: string | number,
    field: K,
    value: QuestionEditorItem[K],
  ) => {
    updateEditorData({
      questions: editorData.questions.map((q) =>
        q.id === qId ? { ...q, [field]: value } : q
      )
    });
  };

  const handleUpdateQuestionPoints = (qId: string | number, pointsVal: number) => {
    let val = pointsVal;
    if (val > 99) val = 99;
    handleUpdateQuestion(qId, "points", val);
  };

  const handleAddAnswer = (qId: string | number) => {
    const newAnswer: AnswerEditorItem = {
      id: `temp-a-${Date.now()}-${Math.random()}`,
      answer_text: "",
      is_correct: false,
    };
    updateEditorData({
      questions: editorData.questions.map((q) =>
        q.id === qId ? { ...q, answers: [...q.answers, newAnswer] } : q
      )
    });
  };

  const handleRemoveAnswer = (qId: string | number, aId: string | number) => {
    updateEditorData({
      questions: editorData.questions.map((q) =>
        q.id === qId ? { ...q, answers: q.answers.filter((a) => a.id !== aId) } : q
      )
    });
  };

  const handleUpdateAnswer = <K extends "answer_text" | "is_correct">(
    qId: string | number,
    aId: string | number,
    field: K,
    value: AnswerEditorItem[K],
  ) => {
    updateEditorData({
      questions: editorData.questions.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          answers: q.answers.map((a) =>
            a.id === aId ? { ...a, [field]: value } : a
          )
        };
      })
    });
  };

  const getValidationError = () => {
    if (!editorData) return null;

    const timeLimit = Number(editorData.time_limit_minutes);
    if (isNaN(timeLimit) || timeLimit < 3 || timeLimit > 180) {
      return "Ограничение по времени должно находиться в интервале от 3 до 180 минут";
    }

    const totalPoints = editorData.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    const threshold = Number(editorData.threshold_score);
    if (isNaN(threshold) || threshold < 1 || threshold > totalPoints || threshold > 100) {
      return `Порог прохождения не может превышать общее количество баллов (${totalPoints || 1})`;
    }

    if (editorData.questions.length < 10) {
      return `Добавьте еще хотя бы ${10 - editorData.questions.length} вопросов для возможности сохранения теста`;
    }
    if (editorData.questions.length > 50) {
      return `Вы можете создать не более 50 вопросов для одного теста`;
    }

    if (totalPoints > 100) {
      return `Вы можете распределить не более 100 вопросов между всеми вопросами теста`;
    }

    const errorQuestionNumbers: number[] = [];
    editorData.questions.forEach((q, idx) => {
      const qTextLen = q.question_text.trim().length;
      const qPoints = Number(q.points);
      const hasCorrectAnswer = q.answers.some((a) => a.is_correct);
      const hasEmptyAnswer = q.answers.some((a) => a.answer_text.trim().length === 0);
      const hasLongAnswer = q.answers.some((a) => a.answer_text.trim().length > 64);

      if (
        qTextLen < 32 ||
        qTextLen > 1024 ||
        isNaN(qPoints) ||
        qPoints < 1 ||
        qPoints > 99 ||
        q.answers.length < 2 ||
        !hasCorrectAnswer ||
        hasEmptyAnswer ||
        hasLongAnswer
      ) {
        errorQuestionNumbers.push(idx + 1);
      }
    });

    if (errorQuestionNumbers.length > 0) {
      return `Убедитесь, что каждый вопрос имеет валидные описания, минимум два варианта ответа и минимум один вариант, отмеченный как верный.
Номера вопросов, требующих внимания: ${errorQuestionNumbers.join(", ")}.`;
    }

    return null;
  };

  const totalPoints = editorData?.questions?.reduce((sum, q) => sum + (Number(q.points) || 0), 0) || 0;
  const validationError = selectedId ? getValidationError() : null;
  const isValid = selectedId ? validationError === null : false;
  const canSave = hasUnsavedChanges && isValid;
  const canTogglePublish = isValid;

  const columns: Column<TestItem>[] = [
    {
      key: "skill_name",
      header: "Навык",
      align: "left",
      width: "w-2/6",
      render: (item) => <span className="text-gray-900">{item.skill_name} - <span className="text-gray-500">{item.level_name}</span></span>,
    },
    {
      key: "variant_number",
      header: "Вариант",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-900">{item.variant_number}</span>,
    },
    {
      key: "attempts_count",
      header: "Попыток",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-900">{item.attempts_count}</span>,
    },
    {
      key: "passed_count",
      header: "Прошли",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-500">{item.passed_count}</span>,
    },
    {
      key: "status",
      header: "Статус",
      align: "center",
      width: "w-1/6",
      render: (item) => (
        <span className={`inline-block px-2 py-1 rounded text-sm ${item.status === "Опубликовано" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}`}>
          {item.status}
        </span>
      ),
    },
  ];

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchTests(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, newPage);
    }
  };

  return (
    <div className="workspace-container">
      {pendingSelectId !== null && (
        <EditorConfirmModal
          title="Несохранённые изменения"
          message={
            selectedId === "new"
              ? "Есть несохранённые изменения для нового теста."
              : `Есть несохранённые изменения для теста №${editorData.variant_number}.`
          }
          cancelText="Вернуться"
          confirmText="Отменить изменения"
          confirmVariant="danger"
          onCancel={handleCancelNavigation}
          onConfirm={handleDiscardAndContinue}
        />
      )}

      {showDeleteConfirm && selectedId !== null && (
        <EditorConfirmModal
          title="Требуется подтверждение"
          message={`Вы уверены, что хотите удалить тест №${editorData.variant_number}?`}
          confirmText="Да, удалить навсегда"
          confirmVariant="danger"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            handleDelete();
          }}
        />
      )}

      {/* левая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full min-w-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="workspace-panel-header mb-0 flex-1 min-w-0">Список тестов</h2>
          <ContentOwnerFilter
            entityLabel="тесты"
            ownerId={ownerId}
            ownerUsername={ownerUsername}
            onOwnerIdChange={(nextOwnerId) => setTestsState({ ownerId: nextOwnerId })}
            onOwnerUsernameChange={(username) => setTestsState({ ownerUsername: username })}
          />
        </div>

        <div className="flex gap-4 mb-6 items-center">
          <div className="flex-1 flex gap-4">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setTestsState({ keywordInput: e.target.value })}
              maxLength={TEST.SEARCH_KEYWORDS.MAX_LENGTH}
              className="input-field mt-0! flex-3"
              placeholder="Поиск по содержанию"
            />
            <AutocompleteSearch<SkillLevelItem>
              onSearch={fetchSkillLevels}
              onSelect={setSelectedSkillToCreate}
              onInputChange={handleInputChange}
              itemToString={(p) => `${p.skill_name} - ${p.level_name}`}
              renderItem={(p) => (
                <>
                  {p.skill_name} - <span className="text-gray-500">{p.level_name}</span>
                </>
              )}
              placeholder="Поиск по навыку"
              className="flex-2"
              hideButton={true}
              value={skillInput}
              showClearButton={true}
              onSelectedItemChange={setSelectedSkillToCreate}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreateSelectedTest}
              disabled={!selectedSkillToCreate}
              className="primary-button disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Создать
            </button>
          </div>
        </div>

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isSearching || isDebouncing}
          emptyMessage="Тесты не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onRowClick={handleRowClick}
        />
      </div>

      {/* правая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full relative min-w-0">
        <div className="flex items-center justify-between gap-4 mb-2 shrink-0">
          <h2 className="workspace-panel-header mb-0">
            {selectedId === "new"
              ? `Новый тест «${editorData.skill_name} - ${editorData.level_name}»`
              : typeof selectedId === "number"
                ? `Тест «${editorData.skill_name} - ${editorData.level_name}» №${editorData.variant_number}`
                : "Редактор тестов"}
          </h2>
          {selectedId && (
            <div className="flex items-center gap-2 shrink-0">
              <IconButton
                iconSrc="/src/assets/icons/delete.svg"
                altText={selectedId === "new" ? "Отменить создание" : "Удалить"}
                onClick={selectedId === "new" ? handleDelete : () => setShowDeleteConfirm(true)}
                color="danger"
              />
              <IconButton
                iconSrc="/src/assets/icons/save.svg"
                altText="Сохранить"
                onClick={() => handleSave(editorData.is_published)}
                disabled={!canSave}
                color="primary"
              />
              <IconButton
                iconSrc={editorData.is_published ? "/src/assets/icons/unpublish.svg" : "/src/assets/icons/publish.svg"}
                altText={editorData.is_published ? "Снять с публикации" : "Опубликовать"}
                onClick={() => handleSave(!editorData.is_published)}
                disabled={!canTogglePublish}
                color="success"
              />
            </div>
          )}
        </div>

        {selectedId ? (
          <div className="flex flex-col flex-1 overflow-y-auto pr-2 p-1 min-w-0">
              {/* содержание теста */}
              <div className="mb-4">
                <textarea
                  value={editorData.description}
                  onChange={(e) => updateEditorData({ description: e.target.value })}
                  placeholder="Описание содержания теста"
                  className="input-field resize-y mb-1"
                  style={{ minHeight: "120px" }}
                />
                <div className="text-xs flex justify-between">
                  <span className="text-gray-500">
                    {editorData.description.trim().length > 0 && editorData.description.trim().length < TEST.DESCRIPTION.MIN_LENGTH
                      ? "Слишком короткое содержание"
                      : ""}
                  </span>
                  <span className={editorData.description.length > TEST.DESCRIPTION.MAX_LENGTH ? "text-danger" : "text-gray-500"}>
                    {editorData.description.length}/{TEST.DESCRIPTION.MAX_LENGTH}
                  </span>
                </div>
              </div>

              {/* параметры времени и порога */}
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ограничение по времени
                  </label>
                  <NumberInput
                    mode="integer"
                    min={3}
                    max={180}
                    step={1}
                    value={editorData.time_limit_minutes ?? 0}
                    onChange={(value) => updateEditorData({ time_limit_minutes: value })}
                    unitForms={["минут", "минута", "минуты", "минут"]}
                    className="input-field mt-0! w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Порог прохождения
                  </label>
                  <NumberInput
                    mode="integer"
                    min={1}
                    max={100}
                    step={1}
                    value={editorData.threshold_score ?? 0}
                    onChange={(value) => updateEditorData({ threshold_score: value })}
                    unitForms={["баллов", "балл", "балла", "баллов"]}
                    className="input-field mt-0! w-full"
                  />
                </div>
              </div>

              {/* список вопросов */}
              <div className="flex-1 flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-800">Список вопросов</h3>
                  <div className="flex gap-2">
                    <span className="text-sm font-medium text-gray-500 bg-gray-100 py-1 px-2.5 rounded-lg">
                      Всего вопросов: {editorData.questions.length}
                    </span>
                    <span className="text-sm font-medium text-gray-500 bg-gray-100 py-1 px-2.5 rounded-lg">
                      Всего баллов: {totalPoints}
                    </span>
                  </div>
                </div>
                {validationError && (
                  <span className="text-xs whitespace-pre-wrap text-danger font-medium bg-red-50 border border-red-100 rounded-lg p-2.5 block max-w-lg">
                    {validationError}
                  </span>
                )}

                <div className="flex flex-col gap-4 overflow-y-visible">
                  {editorData.questions.map((q, qIdx) => {
                    return (
                      <div key={q.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3">
                        {/* заголовок вопроса */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-semibold text-gray-800 text-md whitespace-nowrap">
                              Вопрос №{qIdx + 1}, баллов при верном ответе:
                            </span>
                            <NumberInput
                              mode="integer"
                              min={1}
                              max={99}
                              step={1}
                              value={q.points ?? 0}
                              onChange={(value) => handleUpdateQuestionPoints(q.id, value)}
                              className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-center font-medium text-md focus:outline-none focus:ring-1 focus:ring-primary"
                              containerClassName="flex"
                            />

                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleExpandQuestion(q.id)}
                              className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
                              title={q.is_expanded ? "Свернуть" : "Развернуть"}
                            >
                              <ChevronDown
                                className={`w-5 h-5 transition-transform duration-200 ${q.is_expanded ? "rotate-180" : ""}`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(q.id)}
                              className="p-1 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors text-gray-500"
                              title="Удалить вопрос"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* тело вопроса */}
                        {q.is_expanded && (
                          <div className="flex flex-col gap-3 mt-1">
                            <div className="w-full">
                              <textarea
                                value={q.question_text}
                                onChange={(e) => handleUpdateQuestion(q.id, "question_text", e.target.value)}
                                placeholder="Описание вопроса"
                                className="input-field resize-y mb-1"
                                style={{ minHeight: "80px" }}
                              />
                              <div className="text-xs flex justify-between">
                                <span className="text-gray-500">
                                  {q.question_text.trim().length > 0 && q.question_text.trim().length < 32
                                    ? "Слишком короткое описание"
                                    : ""}
                                </span>
                                <span className={q.question_text.length > 1024 ? "text-danger" : "text-gray-500"}>
                                  {q.question_text.length}/1024
                                </span>
                              </div>
                            </div>

                            {/* варианты ответа */}
                            <div className="flex flex-col gap-2">
                              <span className="font-semibold text-gray-700 text-sm">Варианты ответа:</span>
                              {q.answers.map((a) => {
                                return (
                                  <div key={a.id} className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      checked={a.is_correct}
                                      onChange={(e) => handleUpdateAnswer(q.id, a.id, "is_correct", e.target.checked)}
                                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0 mt-3"
                                    />
                                    <div className="flex-1">
                                      <textarea
                                        value={a.answer_text}
                                        onChange={(e) => handleUpdateAnswer(q.id, a.id, "answer_text", e.target.value)}
                                        placeholder="Описание варианта ответа"
                                        className="input-field mt-0! resize-y mb-1"
                                        style={{ minHeight: "40px" }}
                                      />
                                      <div className="text-xs flex justify-between">
                                        <span className={`text-[10px] ${a.answer_text.length > 64 ? "text-danger" : "text-gray-500"}`}>
                                          {a.answer_text.length}/64
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAnswer(q.id, a.id)}
                                      className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors text-gray-500 shrink-0 mt-2"
                                      title="Удалить вариант"
                                    >
                                      <X className="w-4.5 h-4.5" />
                                    </button>
                                  </div>
                                );
                              })}

                              <div className="flex justify-start mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleAddAnswer(q.id)}
                                  className="text-sm font-semibold text-primary hover:text-primary-hover flex items-center gap-1 p-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  Добавить вариант ответа
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-center mt-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="py-2.5 px-6 border border-dashed border-primary text-primary hover:bg-blue-50 transition-colors font-semibold rounded-xl flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Добавить вопрос
                  </button>
                </div>
              </div>
            </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Выберите тест для редактирования</p>
          </div>
        )}
      </div>
    </div>
  );
}
