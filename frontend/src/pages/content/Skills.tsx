import { useState, useCallback } from "react";
import { authJson } from "../../auth";
import { ITEMS_PER_TABLE_PAGE, SKILL_LEVEL, SEARCH_DEBOUNCE_MS } from "../../config";
import {
  useContentStore,
  type SkillLevelItem,
  type LevelEditorItem,
  type SkillRelationEditorItem,
} from "../../hooks/useContentStore";
import { PaginatedTable, type Column, type PaginatedPage } from "../../components/PaginatedTable";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { BentoSearch } from "../../components/BentoSearch";
import { ContentOwnerFilter } from "../../components/ContentOwnerFilter";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { InfoModal } from "../../components/InfoModal";
import { IconButton } from "../../components/IconButton";
import { NumberInput } from "../../components/NumberInput";
import { useToast } from "../../components/ToastProvider";
import deleteIcon from "../../assets/icons/delete.svg";
import saveIcon from "../../assets/icons/save.svg";

interface SearchResponse {
  items: SkillLevelItem[];
  total_pages: number;
  current_page: number;
}

interface SkillSearchItem {
  id: number;
  name: string;
}

interface LevelSearchItem {
  id: number;
  name: string;
}

interface SkillLevelDetailResponse {
  id: number;
  skill_id: number;
  skill_name: string;
  levels: LevelEditorItem[];
  relations: {
    skill_id: number;
    skill_name: string;
    incoming_id: number | null;
    incoming_weight: number | null;
    outgoing_id: number | null;
    outgoing_weight: number | null;
  }[];
}

const RELATIONS_PER_PAGE = 5;
type RelationWeightField = "incoming_weight" | "outgoing_weight";

export default function SkillsAdmin() {
  const { skills, setSkillsState } = useContentStore();
  const {
    skillInput, levelInput, ownerId, ownerUsername,
    selectedId, editorData, hasUnsavedChanges, pendingSelectId,
  } = skills;
  const { showToast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);

  // клиентская пагинация связей
  const [relationsPage, setRelationsPage] = useState(1);

  const loadSkillLevelsPage = useCallback(async (page: number, limit: number): Promise<PaginatedPage<SkillLevelItem>> => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (skillInput) params.append("skill", skillInput);
    if (levelInput) params.append("level", levelInput);
    if (ownerId !== null) params.append("author_id", ownerId.toString());

    const response = await authJson<SearchResponse>(`/skills/skill_levels?${params.toString()}`);
    return {
      items: response.items,
      totalPages: response.total_pages,
    };
  }, [levelInput, ownerId, skillInput]);

  const tableQueryKey = JSON.stringify({
    skill: skillInput,
    level: levelInput,
    ownerId,
  });

  const refreshTable = () => {
    setTableRefreshKey((value) => value + 1);
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
      setSkillsState({ skillInput: "", levelInput: "" });
      refreshTable();
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
            skill_id: r.skill_id,
            skill_name: r.skill_name,
            incoming_id: r.incoming_id,
            incoming_weight: r.incoming_weight,
            outgoing_id: r.outgoing_id,
            outgoing_weight: r.outgoing_weight,
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
          skill_id: r.skill_id,
          incoming_id: r.incoming_id,
          incoming_weight: r.incoming_weight,
          outgoing_id: r.outgoing_id,
          outgoing_weight: r.outgoing_weight,
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
      refreshTable();
    } catch {
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
      refreshTable();
    } catch (err: unknown) {
      const error = err as { status?: number; response?: { status?: number; detail?: string }; detail?: string };
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
  const handleReorderLevels = (oldIndex: number, newIndex: number) => {
    const newLevels = [...editorData.levels];
    const [dragged] = newLevels.splice(oldIndex, 1);
    newLevels.splice(newIndex, 0, dragged);

    // пересчёт order_index
    const reindexed = newLevels.map((level, i) => ({
      ...level,
      order_index: i + 1,
    }));

    updateEditorData({ levels: reindexed });
  };

  // поиск навыков для связей
  const searchSkills = useCallback(async (query: string) => {
    const response = await authJson<{ items: SkillSearchItem[] }>(`/skills/search?name=${encodeURIComponent(query)}`);
    return response.items;
  }, []);

  // поиск уровней для редактора
  const searchLevels = useCallback(async (query: string) => {
    const response = await authJson<{ items: LevelSearchItem[] }>(`/skills/levels/search?name=${encodeURIComponent(query)}`);
    return response.items;
  }, []);

  const handleAddRelation = (item: SkillSearchItem) => {
    // не добавляем дублирующий или самого себя
    if (item.id === editorData.skill_id) return;
    updateEditorData({
      relations: [
        ...editorData.relations,
        {
          skill_id: item.id,
          skill_name: item.name,
          incoming_id: null,
          incoming_weight: 0.5,
          outgoing_id: null,
          outgoing_weight: null,
        },
      ],
    });
    setRelationsPage(Math.ceil((editorData.relations.length + 1) / RELATIONS_PER_PAGE));
  };

  const handleRemoveRelation = (skillId: number) => {
    updateEditorData({
      relations: editorData.relations.filter((r) => r.skill_id !== skillId),
    });
  };

  const handleWeightChange = (skillId: number, field: RelationWeightField, value: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(value * 10) / 10));
    updateEditorData({
      relations: editorData.relations.map((r) =>
        r.skill_id === skillId ? { ...r, [field]: clamped } : r
      ),
    });
  };

  const isRelationAlreadyAdded = (item: SkillSearchItem) =>
    item.id === editorData.skill_id || editorData.relations.some((r) => r.skill_id === item.id);

  const isLevelAlreadyAdded = (item: LevelSearchItem) => {
    const normalizedName = item.name.trim().toLowerCase();
    return editorData.levels.some(
      (level) => level.level_name.trim().toLowerCase() === normalizedName,
    );
  };

  const canCreate = !isCreating && skillInput.trim() !== "" && levelInput.trim() !== "";
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
      key: "skill_name",
      header: "Название",
      align: "left",
      width: "w-2/6",
      render: (item) => <span className="text-gray-900">{item.skill_name}</span>,
    },
    {
      key: "incoming_weight",
      header: "Входящий вес",
      align: "center",
      width: "w-1/6",
      render: (item) => (
        <NumberInput
          mode="decimal"
          min={0}
          max={1}
          step={0.1}
          value={item.incoming_weight}
          onChange={(value) => handleWeightChange(item.skill_id, "incoming_weight", value)}
          className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          containerClassName="flex justify-center"
        />
      ),
    },
    {
      key: "outgoing_weight",
      header: "Исходящий вес",
      align: "center",
      width: "w-1/6",
      render: (item) => (
        <NumberInput
          mode="decimal"
          min={0}
          max={1}
          step={0.1}
          value={item.outgoing_weight}
          onChange={(value) => handleWeightChange(item.skill_id, "outgoing_weight", value)}
          className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          containerClassName="flex justify-center"
        />
      ),
    },
    {
      key: "action",
      header: "Действие",
      align: "center",
      width: "w-2/6",
      render: (item) => (
        <button
          onClick={() => handleRemoveRelation(item.skill_id)}
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
      width: "w-2/5",
      render: (item) => <span className="text-gray-900 font-medium">{item.skill_name}</span>,
    },
    {
      key: "level_name",
      header: "Уровень",
      align: "center",
      width: "w-2/5",
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
      width: "w-1/5",
      render: (item) => <span className="text-gray-500">{item.obtained_count}</span>,
    },
  ];

  return (
    <div className="workspace-container">
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
          message={`Вы уверены, что хотите удалить уровень "${editorData.levels.find(l => l.id === selectedId)?.level_name || ""}" для навыка "${editorData.skill_name}"?`}
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
      <div className="workspace-panel flex-1 flex flex-col h-full min-w-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="workspace-panel-header mb-0 flex-1 min-w-0">Список навыков</h2>
          <ContentOwnerFilter
            entityLabel="навыки"
            ownerId={ownerId}
            ownerUsername={ownerUsername}
            onOwnerIdChange={(nextOwnerId) => setSkillsState({ ownerId: nextOwnerId })}
            onOwnerUsernameChange={(username) => setSkillsState({ ownerUsername: username })}
          />
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <AutocompleteSearch<SkillSearchItem>
              onSearch={searchSkills}
              onSelect={(item) => setSkillsState({ skillInput: item.name })}
              onInputChange={(value) => setSkillsState({ skillInput: value })}
              itemToString={(item) => item.name}
              renderItem={(item) => <span>{item.name}</span>}
              value={skillInput}
              maxLength={SKILL_LEVEL.SEARCH_SKILL.MAX_LENGTH}
              placeholder="Поиск по названию"
              hideButton={true}
              showClearButton={true}
              className="ml-0!"
            />
          </div>
          <div className="flex-1">
            <AutocompleteSearch<LevelSearchItem>
              onSearch={searchLevels}
              onSelect={(item) => setSkillsState({ levelInput: item.name })}
              onInputChange={(value) => setSkillsState({ levelInput: value })}
              itemToString={(item) => item.name}
              renderItem={(item) => <span>{item.name}</span>}
              value={levelInput}
              maxLength={SKILL_LEVEL.SEARCH_LEVEL.MAX_LENGTH}
              placeholder="Поиск по уровню"
              hideButton={true}
              showClearButton={true}
              className="ml-0!"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className={"primary-button"}
            >
              Создать
            </button>
          </div>
        </div>

        <PaginatedTable
          columns={columns}
          emptyMessage="Навыки не найдены"
          onRowClick={handleRowClick}
          itemsPerPage={ITEMS_PER_TABLE_PAGE.DEFAULT}
          loadPage={loadSkillLevelsPage}
          cacheKey="content-skills"
          queryKey={tableQueryKey}
          refreshKey={tableRefreshKey}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />
      </div>

      {/* правая панель — редактор */}
      <div className="workspace-panel flex-1 flex flex-col h-full relative min-w-0">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h2 className="workspace-panel-header mb-0">
            {selectedId ? `Навык «${editorData.skill_name}»` : "Редактор навыков"}
          </h2>
          {selectedId && (
            <div className="flex items-center gap-2">
              <IconButton
                iconSrc={deleteIcon}
                altText="Удалить"
                onClick={() => setShowDeleteConfirm(true)}
                color="danger"
              />
              <IconButton
                iconSrc={saveIcon}
                altText="Сохранить"
                onClick={handleSave}
                disabled={!canSave}
                color="primary"
              />
            </div>
          )}
        </div>

        {selectedId ? (
          <div className="flex flex-col flex-1 overflow-y-auto pr-2 p-1 min-w-0">

            {/* секция уровней — бенто-сетка */}
            <div className="mb-6 max-w-lg">
              <BentoSearch<LevelEditorItem, LevelSearchItem>
                items={editorData.levels}
                itemToString={(l) => l.level_name}
                itemToId={(l) => l.id}
                renderItem={(level) => (
                  <>
                    <span className="opacity-60 mr-1.5">{level.order_index}.</span>
                    {level.level_name}
                  </>
                )}
                prefixTitle="Уровни"
                activeItemId={selectedId}
                reorderEnabled={true}
                closeable={false}
                customSelectLogic={true}
                onReorder={handleReorderLevels}
                onItemClick={(item) => loadSkillLevel(item.id)}
                onSearch={searchLevels}
                onAdd={async (item) => {
                  if (isLevelAlreadyAdded(item)) return;

                  setIsCreating(true);
                  try {
                    await authJson<SkillLevelItem>("/skills/skill_levels", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        skill_name: editorData.skill_name,
                        level_name: item.name,
                      }),
                    });
                    showToast({ title: "Успех", message: "Уровень успешно добавлен", variant: "success" });
                    await loadSkillLevel(selectedId);
                  } catch (error) {
                    console.error("Failed to create skill level inside editor", error);
                    showToast({ title: "Ошибка", message: "Не удалось добавить уровень", variant: "error" });
                  } finally {
                    setIsCreating(false);
                  }
                }}
                searchItemToString={(l) => l.name}
                renderSearchItem={(l) => <span>{l.name}</span>}
                placeholder="Название уровня"
                buttonText="Добавить"
                debounceMs={SEARCH_DEBOUNCE_MS}
                isSearchItemDisabled={isLevelAlreadyAdded}
                searchFieldClassName="min-w-3xs"
              />
              {editorData.levels.length === 0 && (
                <p className="text-gray-500 text-sm ml-1 self-center mt-2">Уровни отсутствуют.</p>
              )}
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
                    data={relationsSlice.map((r) => ({ ...r, id: r.skill_id }))}
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
            <p className="text-gray-500">Выберите навык для редактирования</p>
          </div>
        )}
      </div>
    </div>
  );
}
