import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { useContentStore, type RecommendationItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { IconButton } from "../../components/IconButton";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { useToast } from "../../components/ToastProvider";
import { Profanease } from 'profanease';
import ru from 'profanease/langs/ru';
import en from 'profanease/langs/en';

const profanityFilter = new Profanease({
  languages: [ru, en],
  normalize: 'none'
});

interface SearchResponse {
  items: RecommendationItem[];
  total_pages: number;
  current_page: number;
}

interface ProficiencyItem {
  id: number;
  skill_name: string;
  level_name: string;
  obtained_count: number;
}

interface ProfSearchResponse {
  items: ProficiencyItem[];
  total_pages: number;
  current_page: number;
}

export default function ContentRecommendations() {
  const { recommendations, setRecommendationsState } = useContentStore();
  const { keywordInput, results, currentPage, totalPages, lastSearch, selectedId, editorData, hasUnsavedChanges, pendingSelectId } = recommendations;
  const { showToast } = useToast();

  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecommendations = async (keyword: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (keyword) params.append("keyword", keyword);

      const response = await authJson<SearchResponse>(`/recommendations?${params.toString()}`);
      setRecommendationsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { keyword, page }
      });
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
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
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchRecommendations(keywordInput, 1);
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywordInput]);

  const fetchProficiencies = async (query: string) => {
    const params = new URLSearchParams({ skill: query, page: "1" });
    const response = await authJson<ProfSearchResponse>(`/proficiencies?${params.toString()}`);
    return response.items;
  };

  const loadRecommendation = async (id: number) => {
    try {
      const response = await authJson<any>(`/recommendations/${id}`);
      setRecommendationsState({
        selectedId: id,
        editorData: {
          description: response.description || "",
          check_repo: response.check_repo,
          is_published: response.is_published,
          skills: response.skills
        },
        hasUnsavedChanges: false,
        pendingSelectId: null
      });
    } catch (error) {
      console.error("Failed to load recommendation", error);
      showToast({ title: "Ошибка", message: "Не удалось загрузить рекомендацию", variant: "error" });
    }
  };

  const handleRowClick = (item: RecommendationItem) => {
    if (item.id === selectedId) return;
    if (hasUnsavedChanges) {
      setRecommendationsState({ pendingSelectId: item.id });
    } else {
      loadRecommendation(item.id);
    }
  };

  const handleCreate = () => {
    if (selectedId === "new") return;
    if (hasUnsavedChanges) {
      setRecommendationsState({ pendingSelectId: "new" });
    } else {
      setRecommendationsState({
        selectedId: "new",
        editorData: { description: "", check_repo: false, is_published: false, skills: [] },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    }
  };

  const handleSave = async (publishStatus?: boolean) => {
    const isNew = selectedId === "new";
    const method = isNew ? "POST" : "PUT";
    const url = isNew ? "/recommendations" : `/recommendations/${selectedId}`;
    const newPublishStatus = publishStatus !== undefined ? publishStatus : editorData.is_published;

    try {
      const payload = {
        description: editorData.description,
        check_repo: editorData.check_repo,
        is_published: newPublishStatus,
        proficiency_ids: editorData.skills.map(s => s.proficiency_id)
      };

      const response = await authJson<any>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      setRecommendationsState({
        selectedId: response.id,
        editorData: {
          description: response.description || "",
          check_repo: response.check_repo,
          is_published: response.is_published,
          skills: response.skills
        },
        hasUnsavedChanges: false
      });

      showToast({ title: "Успех", message: "Рекомендация сохранена", variant: "success" });
      fetchRecommendations(lastSearch.keyword, currentPage); // refresh table
      return response.id;
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось сохранить", variant: "error" });
      throw error;
    }
  };

  const handleDelete = async () => {
    if (selectedId === "new") {
      setRecommendationsState({ selectedId: null, hasUnsavedChanges: false });
      return;
    }

    try {
      await authJson(`/recommendations/${selectedId}`, { method: "DELETE" });
      setRecommendationsState({ selectedId: null, hasUnsavedChanges: false });
      showToast({ title: "Успех", message: "Рекомендация удалена", variant: "success" });
      fetchRecommendations(lastSearch.keyword, currentPage);
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось удалить", variant: "error" });
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingSelectId) return;
    if (pendingSelectId === "new") {
      setRecommendationsState({
        selectedId: "new",
        editorData: { description: "", check_repo: false, is_published: false, skills: [] },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    } else {
      loadRecommendation(pendingSelectId);
    }
  };

  const handleCancelNavigation = () => {
    setRecommendationsState({ pendingSelectId: null });
  };

  const updateEditorData = (changes: Partial<typeof editorData>) => {
    setRecommendationsState({
      editorData: { ...editorData, ...changes },
      hasUnsavedChanges: true
    });
  };

  const handleAddSkill = (selectedItem: ProficiencyItem) => {
    updateEditorData({
      skills: [...editorData.skills, {
        proficiency_id: selectedItem.id,
        skill_name: selectedItem.skill_name,
        level_name: selectedItem.level_name
      }]
    });
  };

  const handleRemoveSkill = (profId: number) => {
    updateEditorData({
      skills: editorData.skills.filter(s => s.proficiency_id !== profId)
    });
  };

  const isSkillAlreadySelected = (item: ProficiencyItem) => 
    editorData.skills.some(s => s.proficiency_id === item.id);

  const isDescriptionValid = editorData.description.length >= 32 && editorData.description.length <= 1024;
  const profanityAnalysis = profanityFilter.analyze(editorData.description);
  const hasProfanity = profanityAnalysis.isProfane;
  const canSave = hasUnsavedChanges && isDescriptionValid && !hasProfanity;

  const columns: Column<RecommendationItem>[] = [
    {
      key: "description_preview",
      header: "Рекомендация",
      align: "left",
      width: "w-2/5",
      render: (item) => (
        <span className="text-gray-900">{item.description_preview}</span>
      ),
    },
    {
      key: "issued_count",
      header: "Выдана",
      align: "center",
      width: "w-1/5",
      render: (item) => <span className="text-gray-900">{item.issued_count}</span>,
    },
    {
      key: "average_rating",
      header: "Оценка",
      align: "center",
      width: "w-1/5",
      render: (item) => <span className="text-gray-500">{item.average_rating}</span>,
    },
    {
      key: "status",
      header: "Статус",
      align: "center",
      width: "w-1/5",
      render: (item) => (
        <span className={`inline-block px-2 py-1 rounded text-sm ${item.status === "Опубликовано" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"
          }`}>
          {item.status}
        </span>
      ),
    },
  ];

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchRecommendations(lastSearch.keyword, newPage);
    }
  };

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px] relative">
      {pendingSelectId !== null && (
        <EditorConfirmModal
          title="Несохранённые изменения"
          message={`Есть несохранённые изменения для рекомендации #${selectedId}.`}
          cancelText="Вернуться"
          confirmText="Отменить изменения"
          confirmVariant="danger"
          onCancel={handleCancelNavigation}
          onConfirm={handleDiscardAndContinue}
        />
      )}

      {showDeleteConfirm && selectedId !== null && (
        <EditorConfirmModal
          title="Подтверждение удаления"
          message={`Вы уверены, что хотите удалить рекомендацию #${selectedId}?`}
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
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список рекомендаций</h2>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setRecommendationsState({ keywordInput: e.target.value })}
              className="input-field"
              placeholder="Ключевые слова..."
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              className="primary-button"
            >
              Создать
            </button>
          </div>
        </div>

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isSearching || isDebouncing}
          emptyMessage="Рекомендации не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onRowClick={handleRowClick}
        />
      </div>

      {/* правая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full relative">
        <h2 className="workspace-panel-header">Редактор рекомендаций</h2>

        {selectedId ? (
          <div className="flex flex-col flex-1 overflow-y-auto pr-2 p-1">
            <div className="flex ml-1 items-center justify-between gap-4 mb-4">
              <span className="font-medium text-xl">
                {selectedId === "new" ? "Новая рекомендация" : `Рекомендация #${selectedId}`}
              </span>

              <div className="flex items-center gap-2">
                {selectedId === "new" ? (
                  <button
                    title="Отменить создание"
                    onClick={handleDelete}
                    className="px-4 py-2 bg-danger text-white hover:bg-danger-hover rounded-lg transition-colors font-medium"
                  >
                    Отменить создание
                  </button>
                ) : (
                  <IconButton
                    iconSrc="/src/assets/icons/delete.svg"
                    altText="Удалить"
                    onClick={() => setShowDeleteConfirm(true)}
                    color="danger"
                  />
                )}
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
                  disabled={!canSave}
                  color="success"
                />
              </div>
            </div>

            <div className="relative w-full">
              {/* Highlighting Overlay */}
              <div
                className="input-field min-h-[150px] absolute inset-0 pointer-events-none whitespace-pre-wrap break-word overflow-hidden text-transparent"
                style={{
                  zIndex: 0,
                  font: 'inherit',
                  borderColor: 'transparent'
                }}
              >
                {editorData.description.split(/(\s+)/).map((part, i) => {
                  const isProfane = profanityFilter.check(part.trim());
                  return (
                    <span
                      key={i}
                      className={isProfane && part.trim() ? "bg-red-200 text-transparent rounded" : ""}
                    >
                      {part}
                    </span>
                  );
                })}
              </div>

              <textarea
                className="input-field min-h-[150px] resize-y mb-1 relative bg-transparent z-10"
                style={{ font: 'inherit' }}
                placeholder="Описание рекомендации..."
                value={editorData.description}
                onChange={(e) => updateEditorData({ description: e.target.value })}
                onScroll={(e) => {
                  const overlay = e.currentTarget.previousSibling as HTMLDivElement;
                  if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
                }}
              />
            </div>

            <div className="text-xs flex flex-col mb-2 gap-1">
              {hasProfanity && (
                <div className="text-danger font-medium">
                  Обнаружена нецензурная лексика
                </div>
              )}
              <div className="text-gray-500 flex justify-between">
                <span>{editorData.description.length < 32 && editorData.description.length > 0 ? "Слишком короткое описание" : ""}</span>
                <span className={editorData.description.length > 1024 ? "text-danger" : ""}>
                  {editorData.description.length}/1024
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={editorData.check_repo}
                onChange={(e) => updateEditorData({ check_repo: e.target.checked })}
                className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
              />
              <span className="text-sm font-medium text-gray-700">Требует проверку репозитория</span>
            </label>

            <div className="mb-4">
              <h3 className="text-xl ml-1 font-medium text-gray-900 mb-3">Связанные навыки</h3>

              <AutocompleteSearch<ProficiencyItem>
                onSearch={fetchProficiencies}
                onSelect={handleAddSkill}
                itemToString={(p) => `${p.skill_name} - ${p.level_name}`}
                renderItem={(p) => (
                  <>
                    {p.skill_name} - <span className="text-gray-500">{p.level_name}</span>
                  </>
                )}
                placeholder="Название навыка..."
                buttonText="Добавить"
                isItemDisabled={isSkillAlreadySelected}
                debounceMs={2000}
              />

              <div className="mt-4 flex flex-col gap-2">
                {editorData.skills.length === 0 ? (
                  <p className="text-gray-500 text-sm">Связанные навыки отсутствуют.</p>
                ) : (
                  editorData.skills.map(s => (
                    <div key={s.proficiency_id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="text-md text-gray-800 font-medium">
                        {s.skill_name} - <span className="text-gray-500 font-normal">{s.level_name}</span>
                      </span>
                      <button
                        onClick={() => handleRemoveSkill(s.proficiency_id)}
                        className="text-sm font-medium text-danger hover:text-danger-hover px-2 py-1"
                      >
                        Отвязать
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Выберите рекомендацию для редактирования...</p>
          </div>
        )}
      </div>
    </div>
  );
}
