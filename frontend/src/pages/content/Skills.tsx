import { useState, useEffect, useRef, useCallback } from "react";
import { authJson } from "../../auth";
import { SKILL_LEVEL, SEARCH_DEBOUNCE_MS } from "../../config";
import {
  useContentStore,
  type SkillLevelItem,
  type LevelEditorItem,
  type SkillRelationEditorItem,
} from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { InfoModal } from "../../components/InfoModal";
import { IconButton } from "../../components/IconButton";
import { useToast } from "../../components/ToastProvider";

interface SearchResponse {
  items: SkillLevelItem[];
  total_pages: number;
  current_page: number;
}

interface SkillSearchItem {
  id: number;
  name: string;
}

interface SkillLevelDetailResponse {
  id: number;
  skill_id: number;
  skill_name: string;
  levels: LevelEditorItem[];
  relations: { id: number; source_id: number; source_name: string; influence_weight: number }[];
}

const RELATIONS_PER_PAGE = 5;

export default function SkillsAdmin() {
  const { skills, setSkillsState } = useContentStore();
  const {
    skillInput, levelInput, results, currentPage, totalPages, lastSearch,
    selectedId, editorData, hasUnsavedChanges, pendingSelectId,
  } = skills;
  const { showToast } = useToast();

  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);

  // клиентская пагинация связей
  const [relationsPage, setRelationsPage] = useState(1);

  // индекс перетаскиваемого уровня
  const dragIndexRef = useRef<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSkillLevels = async (skill: string, level: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (skill) params.append("skill", skill);
      if (level) params.append("level", level);

      const response = await authJson<SearchResponse>(`/skills/skill_levels?${params.toString()}`);
      setSkillsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { skill, level, page },
      });
    } catch (error) {
      console.error("Failed to fetch skill levels", error);
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
        skillInput === lastSearch.skill &&
        levelInput === lastSearch.level &&
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchSkillLevels(skillInput, levelInput, 1);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [skillInput, levelInput]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchSkillLevels(lastSearch.skill, lastSearch.level, newPage);
    }
  };

  const handleCreate = async () => {
    if (!skillInput || !levelInput) return;

    setIsCreating(true);
    try {
      const response = await authJson<SkillLevelItem>("/skills/skill_levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_name: skillInput,
          level_name: levelInput,
        }),
      });
      fetchSkillLevels("", "", 1);
      setSkillsState({ skillInput: "", levelInput: "" });
      showToast({ title: "Успех", message: "Навык успешно создан", variant: "success" });

      // сразу открываем в редакторе
      loadSkillLevel(response.id);
    } catch (error) {
      console.error("Failed to create skill level", error);
      showToast({ title: "Ошибка", message: "Не удалось создать навык", variant: "error" });
    } finally {
      setIsCreating(false);
    }
  };

  const loadSkillLevel = async (id: number) => {
    try {
      const response = await authJson<SkillLevelDetailResponse>(`/skills/skill_levels/${id}`);
      setSkillsState({
        selectedId: id,
        editorData: {
          skill_id: response.skill_id,
          skill_name: response.skill_name,
          levels: response.levels,
          relations: response.relations.map((r) => ({
            source_id: r.source_id,
            source_name: r.source_name,
            influence_weight: r.influence_weight,
          })),
        },
        hasUnsavedChanges: false,
        pendingSelectId: null,
      });
      setRelationsPage(1);
    } catch (error) {
      console.error("Failed to load skill level", error);
      showToast({ title: "Ошибка", message: "Не удалось загрузить навык", variant: "error" });
    }
  };

  const handleRowClick = (item: SkillLevelItem) => {
    if (item.id === selectedId) return;
    if (hasUnsavedChanges) {
      setSkillsState({ pendingSelectId: item.id });
    } else {
      loadSkillLevel(item.id);
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingSelectId) return;
    loadSkillLevel(pendingSelectId);
  };

  const handleCancelNavigation = () => {
    setSkillsState({ pendingSelectId: null });
  };

  // сохранение
  const handleSave = async () => {
    if (!selectedId) return;

    try {
      const payload = {
        level_order: editorData.levels.map((l) => l.id),
        relations: editorData.relations.map((r) => ({
          source_id: r.source_id,
          influence_weight: r.influence_weight,
        })),
      };

      await authJson(`/skills/skill_levels/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
      // перезагружаем актуальное состояние
      await loadSkillLevel(selectedId);
      fetchSkillLevels(lastSearch.skill, lastSearch.level, currentPage);
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось сохранить изменения", variant: "error" });
    }
  };

  // удаление
  const handleDelete = async () => {
    if (!selectedId) return;

    try {
      await authJson(`/skills/skill_levels/${selectedId}`, { method: "DELETE" });
      setSkillsState({ selectedId: null, hasUnsavedChanges: false });
      showToast({ title: "Успех", message: "Навык удалён", variant: "success" });
      fetchSkillLevels(lastSearch.skill, lastSearch.level, currentPage);
    } catch (error: any) {
      // 409 — привязаны тесты
      if (error?.status === 409 || error?.response?.status === 409) {
        const detail = error?.detail || error?.response?.detail
          || "Невозможно удалить: к навыку привязаны тесты. Перейдите во вкладку Тесты и перепривяжите все варианты теста к другому навыку.";
        setInfoModal({ title: "Удаление невозможно", message: detail });
      } else {
        showToast({ title: "Ошибка", message: "Не удалось удалить навык", variant: "error" });
      }
    }
  };

  const updateEditorData = (changes: Partial<typeof editorData>) => {
    setSkillsState({
      editorData: { ...editorData, ...changes },
      hasUnsavedChanges: true,
    });
  };

  // drag-n-drop для уровней
  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;

    const newLevels = [...editorData.levels];
    const [dragged] = newLevels.splice(dragIndex, 1);
    newLevels.splice(dropIndex, 0, dragged);

    // пересчёт order_index
    const reindexed = newLevels.map((level, i) => ({
      ...level,
      order_index: i + 1,
    }));

    updateEditorData({ levels: reindexed });
    dragIndexRef.current = null;
  };

  // поиск навыков для связей
  const searchSkills = useCallback(async (query: string) => {
    const response = await authJson<{ items: SkillSearchItem[] }>(`/skills/search?name=${encodeURIComponent(query)}`);
    return response.items;
  }, []);

  const handleAddRelation = (item: SkillSearchItem) => {
    // не добавляем дублирующий или самого себя
    if (item.id === editorData.skill_id) return;
    updateEditorData({
      relations: [
        ...editorData.relations,
        { source_id: item.id, source_name: item.name, influence_weight: 0.5 },
      ],
    });
    setRelationsPage(Math.ceil((editorData.relations.length + 1) / RELATIONS_PER_PAGE));
  };

  const handleRemoveRelation = (sourceId: number) => {
    updateEditorData({
      relations: editorData.relations.filter((r) => r.source_id !== sourceId),
    });
  };

  const handleWeightChange = (sourceId: number, value: number) => {
    const clamped = Math.max(0.1, Math.min(1, Math.round(value * 10) / 10));
    updateEditorData({
      relations: editorData.relations.map((r) =>
        r.source_id === sourceId ? { ...r, influence_weight: clamped } : r
      ),
    });
  };

  const isRelationAlreadyAdded = (item: SkillSearchItem) =>
    item.id === editorData.skill_id || editorData.relations.some((r) => r.source_id === item.id);

  const hasExactMatch = results.some(
    (item) =>
      item.skill_name.toLowerCase() === skillInput.trim().toLowerCase() &&
      item.level_name.toLowerCase() === levelInput.trim().toLowerCase()
  );

  const canCreate = !isSearching && !isDebouncing && !isCreating && !hasExactMatch && skillInput.trim() !== "" && levelInput.trim() !== "";
  const canSave = hasUnsavedChanges;

  // пагинация связей (клиентская)
  const relationsTotalPages = Math.max(1, Math.ceil(editorData.relations.length / RELATIONS_PER_PAGE));
  const relationsSlice = editorData.relations.slice(
    (relationsPage - 1) * RELATIONS_PER_PAGE,
    relationsPage * RELATIONS_PER_PAGE,
  );

  // столбцы связей для PaginatedTable
  const relationsColumns: Column<SkillRelationEditorItem>[] = [
    {
      key: "source_name",
      header: "Название",
      align: "left",
      width: "w-2/5",
      render: (item) => <span className="text-gray-900">{item.source_name}</span>,
    },
    {
      key: "influence_weight",
      header: "Вес",
      align: "center",
      width: "w-1/5",
      render: (item) => (
        <input
          type="number"
          min="0.1"
          max="1"
          step="0.1"
          value={item.influence_weight}
          onChange={(e) => handleWeightChange(item.source_id, parseFloat(e.target.value) || 0.5)}
          className="w-20 text-center border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ),
    },
    {
      key: "action",
      header: "Действие",
      align: "center",
      width: "w-2/5",
      render: (item) => (
        <button
          onClick={() => handleRemoveRelation(item.source_id)}
          className="text-sm font-medium text-danger hover:text-danger-hover px-2 py-1"
        >
          Отвязать
        </button>
      ),
    },
  ];

  // столбцы левой таблицы
  const columns: Column<SkillLevelItem>[] = [
    {
      key: "skill_name",
      header: "Название",
      align: "center",
      width: "w-1/3",
      render: (item) => <span className="text-gray-900">{item.skill_name}</span>,
    },
    {
      key: "level_name",
      header: "Уровень",
      align: "center",
      width: "w-1/3",
      render: (item) => (
        <span className="inline-block px-2 py-1 bg-gray-100 rounded-lg text-gray-800">
          {item.level_name}
        </span>
      ),
    },
    {
      key: "obtained_count",
      header: "Получен",
      align: "center",
      width: "w-1/3",
      render: (item) => <span className="text-gray-500">{item.obtained_count}</span>,
    },
  ];

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px] relative">
      {/* модал несохранённых изменений */}
      {pendingSelectId !== null && (
        <EditorConfirmModal
          title="Несохранённые изменения"
          message={`Есть несохранённые изменения для навыка "${editorData.skill_name}".`}
          cancelText="Вернуться"
          confirmText="Отменить изменения"
          confirmVariant="danger"
          onCancel={handleCancelNavigation}
          onConfirm={handleDiscardAndContinue}
        />
      )}

      {/* модал подтверждения удаления */}
      {showDeleteConfirm && selectedId !== null && (
        <EditorConfirmModal
          title="Требуется подтверждение"
          message={`Вы уверены, что хотите удалить навык "${editorData.skill_name}" (уровень #${selectedId})?`}
          confirmText="Да, удалить навсегда"
          confirmVariant="danger"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            handleDelete();
          }}
        />
      )}

      {/* информационный модал (блокировка удаления) */}
      {infoModal && (
        <InfoModal
          title={infoModal.title}
          message={infoModal.message}
          onClose={() => setInfoModal(null)}
        />
      )}

      {/* левая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список навыков</h2>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillsState({ skillInput: e.target.value })}
              maxLength={SKILL_LEVEL.SEARCH_SKILL.MAX_LENGTH}
              className="input-field"
              placeholder="Поиск по названию"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={levelInput}
              onChange={(e) => setSkillsState({ levelInput: e.target.value })}
              maxLength={SKILL_LEVEL.SEARCH_LEVEL.MAX_LENGTH}
              className="input-field"
              placeholder="Поиск по уровню"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className={`primary-button ${!canCreate ? "bg-gray-300 cursor-not-allowed" : ""}`}
            >
              Создать
            </button>
          </div>
        </div>

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isSearching || isDebouncing}
          emptyMessage="Навыки не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onRowClick={handleRowClick}
        />
      </div>

      {/* правая панель — редактор */}
      <div className="workspace-panel flex-1 flex flex-col h-full relative">
        <h2 className="workspace-panel-header">Редактор навыков</h2>

        {selectedId ? (
          <div className="flex flex-col flex-1 overflow-y-auto pr-2 p-1">
            {/* заголовок + действия */}
            <div className="flex ml-1 items-center justify-between gap-4 mb-4">
              <span className="font-medium text-xl">{editorData.skill_name}</span>

              <div className="flex items-center gap-2">
                <IconButton
                  iconSrc="/src/assets/icons/delete.svg"
                  altText="Удалить"
                  onClick={() => setShowDeleteConfirm(true)}
                  color="danger"
                />
                <IconButton
                  iconSrc="/src/assets/icons/save.svg"
                  altText="Сохранить"
                  onClick={handleSave}
                  disabled={!canSave}
                  color="primary"
                />
              </div>
            </div>

            {/* секция уровней — бенто-сетка */}
            <div className="mb-6">
              <h3 className="text-xl ml-1 font-medium text-gray-900 mb-3">Уровни</h3>
              <div className="flex flex-wrap gap-2">
                {editorData.levels.map((level, index) => {
                  const isSelected = level.id === selectedId;
                  return (
                    <div
                      key={level.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(index)}
                      className={`px-4 py-2 rounded-xl cursor-grab active:cursor-grabbing select-none transition-all border text-sm font-medium ${
                        isSelected
                          ? "bg-primary text-white border-primary shadow-md"
                          : "bg-gray-100 text-gray-800 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <span className="opacity-60 mr-1.5">{level.order_index}.</span>
                      {level.level_name}
                    </div>
                  );
                })}
                {editorData.levels.length === 0 && (
                  <p className="text-gray-500 text-sm ml-1">Уровни отсутствуют.</p>
                )}
              </div>
            </div>

            {/* секция связанных навыков */}
            <div className="mb-4">
              <h3 className="text-xl ml-1 font-medium text-gray-900 mb-3">Связанные навыки</h3>

              <AutocompleteSearch<SkillSearchItem>
                onSearch={searchSkills}
                onSelect={handleAddRelation}
                itemToString={(s) => s.name}
                renderItem={(s) => <span>{s.name}</span>}
                placeholder="Поиск навыка по названию"
                buttonText="Добавить"
                isItemDisabled={isRelationAlreadyAdded}
                debounceMs={SEARCH_DEBOUNCE_MS}
              />

              <div className="mt-4">
                {editorData.relations.length === 0 ? (
                  <p className="text-gray-500 text-sm ml-1">Связанные навыки отсутствуют.</p>
                ) : (
                  <PaginatedTable
                    columns={relationsColumns}
                    data={relationsSlice.map((r) => ({ ...r, id: r.source_id }))}
                    isLoading={false}
                    emptyMessage="Нет связей"
                    currentPage={relationsPage}
                    totalPages={relationsTotalPages}
                    onPageChange={setRelationsPage}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Выберите навык для редактирования...</p>
          </div>
        )}
      </div>
    </div>
  );
}
