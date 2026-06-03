import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { TASK, SEARCH_DEBOUNCE_MS } from "../../config";
import { useContentStore, type TaskItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { IconButton } from "../../components/IconButton";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { useToast } from "../../components/ToastProvider";
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

export default function ContentTasks() {
  const { tasks, setTasksState } = useContentStore();
  const { keywordInput, skillInput, results, currentPage, totalPages, lastSearch, selectedId, editorData, hasUnsavedChanges, pendingSelectId } = tasks;
  const { showToast } = useToast();

  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTitleTaken, setIsTitleTaken] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTitleRef = useRef<string>("");

  const fetchTasks = async (keyword: string, skill: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (keyword) params.append("keyword", keyword);

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
        lastSearch: { keyword, skill, page }
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
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchTasks(keywordInput, skillInput, 1);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywordInput, skillInput]);

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
      const response = await authJson<any>(`/tasks/${id}`);
      setTasksState({
        selectedId: id,
        editorData: {
          title: response.title || "",
          description: response.description || "",
          is_published: response.is_published,
          skills: response.skills
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
        editorData: { title: newTitleRef.current, description: "", is_published: false, skills: [] },
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
        skill_level_ids: editorData.skills.map(s => s.skill_level_id)
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
          skills: response.skills
        },
        hasUnsavedChanges: false
      });

      showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
      fetchTasks(lastSearch.keyword, lastSearch.skill, currentPage); // обновление таблицы после сохранения
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
      fetchTasks(lastSearch.keyword, lastSearch.skill, currentPage);
    } catch (error) {
      showToast({ title: "Ошибка", message: "Не удалось удалить задание", variant: "error" });
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingSelectId) return;
    if (pendingSelectId === "new") {
      setTasksState({
        selectedId: "new",
        editorData: { title: newTitleRef.current, description: "", is_published: false, skills: [] },
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

  const isDescriptionValid = editorData.description.length >= TASK.DESCRIPTION.MIN_LENGTH && editorData.description.length <= TASK.DESCRIPTION.MAX_LENGTH;
  const isTitleValid = editorData.title.trim().length >= TASK.TITLE.MIN_LENGTH && editorData.title.length <= TASK.TITLE.MAX_LENGTH && !isTitleTaken;
  const canSave = hasUnsavedChanges && isDescriptionValid && isTitleValid;
  const canTogglePublish = isDescriptionValid && isTitleValid;

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
      header: "Выполнено",
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
      fetchTasks(lastSearch.keyword, lastSearch.skill, newPage);
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
        <h2 className="workspace-panel-header mb-4">Список заданий</h2>

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

            <div className="w-full">
              <textarea
                className="input-field min-h-[150px] resize-y mb-1 relative"
                style={{ font: 'inherit' }}
                placeholder="Описание задания"
                value={editorData.description}
                onChange={(e) => updateEditorData({ description: e.target.value })}
                onScroll={(e) => {
                  const overlay = e.currentTarget.previousSibling as HTMLDivElement;
                  if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
                }}
              />
            </div>

            <div className="text-xs flex flex-col mb-2 gap-1">
              <div className="text-gray-500 flex justify-between">
                <span>{editorData.description.length < TASK.DESCRIPTION.MIN_LENGTH && editorData.description.length > 0 ? "Слишком короткое описание" : ""}</span>
                <span className={editorData.description.length > TASK.DESCRIPTION.MAX_LENGTH ? "text-danger" : ""}>
                  {editorData.description.length}/{TASK.DESCRIPTION.MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-xl ml-1 font-medium text-gray-900 mb-3">Связанные навыки</h3>

              <AutocompleteSearch<SkillLevelItemLocal>
                onSearch={fetchSkillsToAttach}
                onSelect={handleAddSkill}
                itemToString={(p) => `${p.skill_name} - ${p.level_name}`}
                renderItem={(p) => (
                  <>
                    {p.skill_name} - <span className="text-gray-500">{p.level_name}</span>
                  </>
                )}
                placeholder="Поиск по названию"
                buttonText="Добавить"
                isItemDisabled={isSkillAlreadySelected}
                debounceMs={SEARCH_DEBOUNCE_MS}
              />

              <div className="mt-4 flex flex-col gap-2">
                {editorData.skills.length === 0 ? (
                  <p className="text-gray-500 text-sm ml-1">Связанные навыки отсутствуют.</p>
                ) : (
                  editorData.skills.map(s => (
                    <div key={s.skill_level_id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="text-md text-gray-800 font-medium">
                        {s.skill_name} - <span className="text-gray-500 font-normal">{s.level_name}</span>
                      </span>
                      <button
                        onClick={() => handleRemoveSkill(s.skill_level_id)}
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
            <p className="text-gray-500">Выберите задание для редактирования</p>
          </div>
        )}
      </div>
    </div>
  );
}
