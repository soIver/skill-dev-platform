import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { TASK, SEARCH_DEBOUNCE_MS } from "../../config";
import { useContentStore, type TaskItem, type PsFunctionItem, type SkillTaskItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { IconButton } from "../../components/IconButton";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { BentoSearch } from "../../components/BentoSearch";
import { ContentOwnerFilter } from "../../components/ContentOwnerFilter";
import { TextareaField } from "../../components/TextareaField";
import { useToast } from "../../components/ToastProvider";
import { Plus, X } from "lucide-react";
interface SearchResponse {
  items: TaskItem[];
  total_pages: number;
  current_page: number;
}

interface SkillLevelItemLocal {
  id: number;
  skill_name: string;
  level_name: string;
  obtained_count: number;
}

interface SkillLevelSearchResponse {
  items: SkillLevelItemLocal[];
  total_pages: number;
  current_page: number;
}

interface TaskDetailResponse {
  id: number;
  title: string;
  description: string;
  is_published: boolean;
  skills: SkillTaskItem[];
  ps_functions: PsFunctionItem[];
  requirements: Array<{ id: number; description: string }>;
}

export default function ContentTasks() {
  const { tasks, setTasksState } = useContentStore();
  const { keywordInput, skillInput, ownerId, ownerUsername, results, currentPage, totalPages, lastSearch, selectedId, editorData, hasUnsavedChanges, pendingSelectId } = tasks;
  const { showToast } = useToast();

  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTitleTaken, setIsTitleTaken] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTitleRef = useRef<string>("");

  const fetchTasks = async (keyword: string, skill: string, ownerIdValue: number | null, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (keyword) params.append("keyword", keyword);
      if (ownerIdValue !== null) params.append("author_id", ownerIdValue.toString());

      // резолвим строку навыка в конкретные id уровней для AND-фильтрации
      if (skill) {
        let skillPart = skill;
        let levelPart = "";
        if (skill.includes(" - ")) {
          const parts = skill.split(" - ", 2);
          skillPart = parts[0].trim();
          levelPart = parts[1].trim();
        }
        const slParams = new URLSearchParams({ skill: skillPart });
        if (levelPart) slParams.append("level", levelPart);
        const slData = await authJson<{ items: Array<{ id: number }> }>(`/skills/skill_levels?${slParams.toString()}`);
        for (const sl of slData.items) {
          params.append("skill_level_ids", String(sl.id));
        }
      }

      const response = await authJson<SearchResponse>(`/tasks?${params.toString()}`);
      setTasksState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { keyword, skill, ownerId: ownerIdValue, page }
      });
    } catch (error) {
      console.error("Failed to fetch tasks", error);
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
      fetchTasks(keywordInput, skillInput, ownerId, 1);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywordInput, skillInput, ownerId]);

  useEffect(() => {
    setIsTitleTaken(false);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);

    if (editorData.title.trim().length >= TASK.TITLE.MIN_LENGTH) {
      titleTimerRef.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ title: editorData.title.trim() });
          if (typeof selectedId === "number") {
            params.append("exclude_id", selectedId.toString());
          }
          const res = await authJson<{ is_taken: boolean }>(`/tasks/check_title?${params.toString()}`);
          setIsTitleTaken(res.is_taken);
        } catch (error) {
          console.error("Failed to check title", error);
        }
      }, SEARCH_DEBOUNCE_MS);
    }

    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, [editorData.title, selectedId]);

  const isSkillAlreadySelected = (item: SkillLevelItemLocal) =>
    editorData.skills.some(s => s.skill_name === item.skill_name);

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

  const fetchSkillsToAttach = async (query: string) => {
    const items = await fetchSkillLevels(query);
    return items.filter(item => !isSkillAlreadySelected(item));
  };

  const loadTask = async (id: number) => {
    try {
      const response = await authJson<TaskDetailResponse>(`/tasks/${id}`);
      setTasksState({
        selectedId: id,
        editorData: {
          title: response.title || "",
          description: response.description || "",
          is_published: response.is_published,
          skills: response.skills,
          ps_functions: response.ps_functions ?? [],
          requirements: response.requirements ?? []
        },
        hasUnsavedChanges: false,
        pendingSelectId: null
      });
    } catch (error) {
      console.error("Failed to load task", error);
      showToast({ title: "Ошибка", message: "Не удалось загрузить задание", variant: "error" });
    }
  };

  const handleRowClick = (item: TaskItem) => {
    if (item.id === selectedId) return;
    if (hasUnsavedChanges) {
      setTasksState({ pendingSelectId: item.id });
    } else {
      loadTask(item.id);
    }
  };

  const handleCreate = () => {
    if (selectedId === "new") return;

    newTitleRef.current = keywordInput.trim();
    setTasksState({ keywordInput: "" });

    if (hasUnsavedChanges) {
      setTasksState({ pendingSelectId: "new" });
    } else {
      setTasksState({
        selectedId: "new",
        editorData: {
          title: newTitleRef.current,
          description: "",
          is_published: false,
          skills: [],
          ps_functions: [],
          requirements: [
            { id: `temp-req-${Date.now()}-1`, description: "" },
            { id: `temp-req-${Date.now()}-2`, description: "" },
          ],
        },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    }
  };

  const handleSave = async (publishStatus?: boolean) => {
    const isNew = selectedId === "new";
    const method = isNew ? "POST" : "PUT";
    const url = isNew ? "/tasks" : `/tasks/${selectedId}`;
    const newPublishStatus = publishStatus !== undefined ? publishStatus : editorData.is_published;

    try {
      const payload = {
        title: editorData.title.trim(),
        description: editorData.description,
        is_published: newPublishStatus,
        skill_level_ids: editorData.skills.map(s => s.skill_level_id),
        requirements: editorData.requirements.map((item) => ({
          id: typeof item.id === "number" ? item.id : undefined,
          description: item.description.trim()
        })),
        ps_function_ids: editorData.ps_functions.map((item) => item.id)
      };

      const response = await authJson<any>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      setTasksState({
        selectedId: response.id,
        editorData: {
          title: response.title || "",
          description: response.description || "",
          is_published: response.is_published,
          skills: response.skills,
          ps_functions: response.ps_functions ?? [],
          requirements: response.requirements ?? []
        },
        hasUnsavedChanges: false
      });

      showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
      fetchTasks(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, currentPage);
      return response.id;
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось сохранить изменения", variant: "error" });
      throw error;
    }
  };

  const handleDelete = async () => {
    if (selectedId === "new") {
      setTasksState({ selectedId: null, hasUnsavedChanges: false });
      return;
    }

    try {
      await authJson(`/tasks/${selectedId}`, { method: "DELETE" });
      setTasksState({ selectedId: null, hasUnsavedChanges: false });
      showToast({ title: "Успех", message: "Задание удалено", variant: "success" });
      fetchTasks(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, currentPage);
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось удалить задание", variant: "error" });
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingSelectId) return;
    if (pendingSelectId === "new") {
      setTasksState({
        selectedId: "new",
        editorData: {
          title: newTitleRef.current,
          description: "",
          is_published: false,
          skills: [],
          ps_functions: [],
          requirements: [
            { id: `temp-req-${Date.now()}-1`, description: "" },
            { id: `temp-req-${Date.now()}-2`, description: "" },
          ],
        },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    } else {
      loadTask(pendingSelectId);
    }
  };

  const handleCancelNavigation = () => {
    setTasksState({ pendingSelectId: null });
  };

  const updateEditorData = (changes: Partial<typeof editorData>) => {
    setTasksState({
      editorData: { ...editorData, ...changes },
      hasUnsavedChanges: true
    });
  };

  const handleAddSkill = (selectedItem: SkillLevelItemLocal) => {
    updateEditorData({
      skills: [...editorData.skills, {
        skill_level_id: selectedItem.id,
        skill_name: selectedItem.skill_name,
        level_name: selectedItem.level_name
      }]
    });
  };

  const handleRemoveSkill = (slId: number) => {
    updateEditorData({
      skills: editorData.skills.filter(s => s.skill_level_id !== slId)
    });
  };

  const handleAddRequirement = () => {
    if (editorData.requirements.length >= TASK.REQUIREMENTS.MAX_COUNT) return;
    updateEditorData({
      requirements: [
        ...editorData.requirements,
        { id: `temp-req-${Date.now()}-${Math.random()}`, description: "" },
      ]
    });
  };

  const handleRemoveRequirement = (requirementId: string | number) => {
    updateEditorData({
      requirements: editorData.requirements.filter((item) => item.id !== requirementId)
    });
  };

  const handleUpdateRequirement = (requirementId: string | number, description: string) => {
    updateEditorData({
      requirements: editorData.requirements.map((item) =>
        item.id === requirementId ? { ...item, description } : item
      )
    });
  };

  const isDescriptionValid = editorData.description.length >= TASK.DESCRIPTION.MIN_LENGTH && editorData.description.length <= TASK.DESCRIPTION.MAX_LENGTH;
  const isTitleValid = editorData.title.trim().length >= TASK.TITLE.MIN_LENGTH && editorData.title.length <= TASK.TITLE.MAX_LENGTH && !isTitleTaken;
  const isRequirementsCountValid = editorData.requirements.length >= TASK.REQUIREMENTS.MIN_COUNT && editorData.requirements.length <= TASK.REQUIREMENTS.MAX_COUNT;
  const invalidRequirementNumbers = editorData.requirements.reduce<number[]>((acc, item, index) => {
    const length = item.description.trim().length;
    if (length < TASK.REQUIREMENTS.MIN_LENGTH || length > TASK.REQUIREMENTS.MAX_LENGTH) {
      acc.push(index + 1);
    }
    return acc;
  }, []);
  const requirementsError = !isRequirementsCountValid
    ? `Количество требований должно быть от ${TASK.REQUIREMENTS.MIN_COUNT} до ${TASK.REQUIREMENTS.MAX_COUNT}`
    : invalidRequirementNumbers.length > 0
      ? `Проверьте размер требований: ${invalidRequirementNumbers.join(", ")}`
      : "";
  const isRequirementsValid = isRequirementsCountValid && invalidRequirementNumbers.length === 0;
  const canSave = hasUnsavedChanges && isDescriptionValid && isTitleValid && isRequirementsValid;
  const canTogglePublish = isDescriptionValid && isTitleValid && isRequirementsValid;

  const columns: Column<TaskItem>[] = [
    {
      key: "description_preview",
      header: "Задание",
      align: "left",
      width: "w-2/5",
      render: (item) => (
        <div className="w-full max-w-0 min-w-full">
          <span className="text-gray-900 font-medium block truncate" title={item.title}>
            {item.title}
          </span>
          <span className="text-gray-500 text-xs block truncate" title={item.description_preview}>
            {item.description_preview}
          </span>
        </div>
      ),
    },
    {
      key: "issued_count",
      header: "Попыток",
      align: "center",
      width: "w-1/5",
      render: (item) => <span className="text-gray-900">{item.issued_count}</span>,
    },
    {
      key: "completed_count",
      header: "Выполнили",
      align: "center",
      width: "w-1/5",
      render: (item) => <span className="text-gray-500">{item.completed_count}</span>,
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
      fetchTasks(lastSearch.keyword, lastSearch.skill, lastSearch.ownerId, newPage);
    }
  };

  return (
    <div className="workspace-container">
      {pendingSelectId !== null && (
        <EditorConfirmModal
          title="Несохранённые изменения"
          message={`Есть несохранённые изменения для задания #${selectedId}.`}
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
          message={`Вы уверены, что хотите удалить задание #${selectedId}?`}
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
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="workspace-panel-header mb-0 flex-1 min-w-0">Список заданий</h2>
          <ContentOwnerFilter
            entityLabel="задания"
            ownerId={ownerId}
            ownerUsername={ownerUsername}
            onOwnerIdChange={(nextOwnerId) => setTasksState({ ownerId: nextOwnerId })}
            onOwnerUsernameChange={(username) => setTasksState({ ownerUsername: username })}
          />
        </div>

        <div className="flex gap-4 mb-6 items-center">
          <div className="flex-1 flex gap-4">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setTasksState({ keywordInput: e.target.value })}
              maxLength={TASK.SEARCH_KEYWORDS.MAX_LENGTH}
              className="input-field mt-0! flex-3"
              placeholder="Поиск по названию и описанию"
            />
            <AutocompleteSearch<SkillLevelItemLocal>
              onSearch={fetchSkillLevels}
              onSelect={(item) => setTasksState({ skillInput: `${item.skill_name} - ${item.level_name}` })}
              onInputChange={(value) => setTasksState({ skillInput: value })}
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
          emptyMessage="Задания не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onRowClick={handleRowClick}
        />
      </div>

      {/* правая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full relative">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h2 className="workspace-panel-header mb-0">
            {selectedId === "new"
              ? "Новое задание"
              : typeof selectedId === "number"
                ? `Задание #${selectedId}`
                : "Редактор заданий"}
          </h2>
          {selectedId && (
            <div className="flex items-center gap-2">
              {selectedId === "new" ? (
                <button
                  title="Отменить создание"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-danger text-white hover:bg-danger-hover rounded-lg transition-colors font-medium text-sm"
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
                disabled={!canTogglePublish}
                color="success"
              />
            </div>
          )}
        </div>

        {selectedId ? (
          <div className="flex flex-col flex-1 overflow-y-auto pr-2 p-1">

            <div className="w-full mb-3">
              <input
                type="text"
                className="input-field mb-1 font-semibold"
                placeholder="Название задания"
                value={editorData.title}
                onChange={(e) => updateEditorData({ title: e.target.value })}
                maxLength={TASK.TITLE.MAX_LENGTH}
              />
              <div className="text-xs flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-danger">{isTitleTaken ? "Название уже занято" : editorData.title.trim().length > 0 && editorData.title.trim().length < TASK.TITLE.MIN_LENGTH ? "Слишком короткое название" : ""}</span>
                  <span className={editorData.title.length > TASK.TITLE.MAX_LENGTH ? "text-danger" : "text-gray-500"}>
                    {editorData.title.length}/{TASK.TITLE.MAX_LENGTH}
                  </span>
                </div>
              </div>
            </div>

            <TextareaField
              containerClassName="w-full mb-2"
              placeholder="Описание задания"
              value={editorData.description}
              minCharacters={TASK.DESCRIPTION.MIN_LENGTH}
              maxCharacters={TASK.DESCRIPTION.MAX_LENGTH}
              validationName="описание"
              onChange={(e) => updateEditorData({ description: e.target.value })}
            />

            <div className="mb-4 max-w-150">
              <div className="flex justify-between items-center ml-1 mb-3">
                <h3 className="text-lg font-semibold text-gray-800">Список требований</h3>
                <span className="text-sm font-medium text-gray-500 bg-gray-100 py-1 px-2.5 rounded-lg">
                  Всего требований: {editorData.requirements.length}
                </span>
              </div>

              {requirementsError && (
                <span className="text-xs whitespace-pre-wrap text-danger font-medium bg-red-50 border border-red-100 rounded-lg p-2.5 block mb-3">
                  {requirementsError}
                </span>
              )}

              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3">
                {editorData.requirements.map((requirement, index) => (
                  <div key={requirement.id} className="flex items-start gap-3">
                    <TextareaField
                      containerClassName="flex-1"
                      value={requirement.description}
                      onChange={(e) => handleUpdateRequirement(requirement.id, e.target.value)}
                      placeholder={`Требование №${index + 1}`}
                      className="mt-0!"
                      minCharacters={TASK.REQUIREMENTS.MIN_LENGTH}
                      maxCharacters={TASK.REQUIREMENTS.MAX_LENGTH}
                      validationName="требование"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRequirement(requirement.id)}
                      className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors text-gray-500 shrink-0 mt-2"
                      title="Удалить требование"
                    >
                      <X className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ))}

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleAddRequirement}
                    disabled={editorData.requirements.length >= TASK.REQUIREMENTS.MAX_COUNT}
                    className="text-sm font-semibold text-primary hover:text-primary-hover disabled:text-gray-400 flex items-center gap-1 p-2 rounded-lg hover:bg-blue-50 disabled:hover:bg-transparent transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Добавить требование
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-4 max-w-150">
              <h3 className="text-xl ml-1 mb-3 font-medium text-gray-900">Связанные навыки</h3>

              <BentoSearch
                items={editorData.skills}
                itemToString={(skill) => `${skill.skill_name} - ${skill.level_name}`}
                itemToId={(skill) => skill.skill_level_id}
                renderItem={(skill) => (
                  <>
                    {skill.skill_name} - <span className="text-gray-500">{skill.level_name}</span>
                  </>
                )}
                closeable={true}
                onRemove={(skill) => handleRemoveSkill(skill.skill_level_id)}
                onSearch={fetchSkillsToAttach}
                onAdd={handleAddSkill}
                searchItemToString={(skill) => `${skill.skill_name} - ${skill.level_name}`}
                renderSearchItem={(skill) => (
                  <>
                    {skill.skill_name} - <span className="text-gray-500">{skill.level_name}</span>
                  </>
                )}
                placeholder="Название навыка"
                debounceMs={SEARCH_DEBOUNCE_MS}
                isSearchItemDisabled={isSkillAlreadySelected}
              />

              {editorData.skills.length === 0 && (
                <p className="mt-3 text-gray-500 text-sm ml-1">Связанные навыки отсутствуют.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Выберите задание для редактирования</p>
          </div>
        )}
      </div>
    </div>
  );
}
