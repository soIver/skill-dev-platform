import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { authJson } from "../../auth";
import { SEARCH_DEBOUNCE_MS } from "../../config";
import { ClassifierEditorTable } from "../../components/ClassifierEditorTable";
import { ClassifierTree } from "../../components/ClassifierTree";
import {
  type ClassifierEditorData,
  type ClassifierFunctionSummary as PsFunctionSummary,
  type ClassifierGroupTreeItem,
  type ClassifierGroupSummary as PsGroupSummary,
  type ClassifierPendingAction as PendingAction,
  type ClassifierProfStandardTreeItem,
  useContentStore,
} from "../../hooks/useContentStore";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { IconButton } from "../../components/IconButton";
import { NumberInput } from "../../components/NumberInput";
import { useToast } from "../../components/ToastProvider";
import { useUserStore } from "../../hooks/useUserStore";

interface ClassifierTreeResponse {
  items: ClassifierProfStandardTreeItem[];
}

interface ProfStandardDetail {
  id: number;
  code: number;
  name: string;
  description: string | null;
  groups: PsGroupSummary[];
}

interface GroupDetail {
  id: number;
  code: string;
  name: string;
  qualification_level: number;
  prof_standard: {
    id: number;
    code: number;
    name: string;
  };
  functions: PsFunctionSummary[];
}

interface FunctionDetail {
  id: number;
  code: number;
  name: string;
  functions_group: {
    id: number;
    code: string;
    name: string;
    qualification_level: number;
  };
  prof_standard: {
    id: number;
    code: number;
    name: string;
  };
}

const cyrillicCodeMap: Record<string, string> = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  Н: "H",
  К: "K",
  М: "M",
  О: "O",
  Р: "P",
  Т: "T",
  Х: "X",
};

function formatPsCode(code: number): string {
  return `06.${code.toString().padStart(3, "0")}`;
}

function formatTfCode(code: number, qualificationLevel: number): string {
  return `${code.toString().padStart(2, "0")}.${qualificationLevel}`;
}

function normalizeGroupCode(value: string): string {
  const upper = value.trim().toUpperCase();
  return (cyrillicCodeMap[upper] ?? upper).slice(0, 1);
}

function nextGroupCode(groups: { code: string }[]): string | null {
  if (groups.length >= 26) return null;
  return String.fromCharCode("A".charCodeAt(0) + groups.length);
}

function nextFunctionCode(functions: { code: number }[]): number {
  return functions.length + 1;
}

export default function Classifier() {
  const { showToast } = useToast();
  const { classifier, setClassifierState } = useContentStore();
  const {
    queryInput,
    results: tree,
    lastSearch,
    hasLoaded,
    editorData,
    hasUnsavedChanges,
    pendingAction,
  } = classifier;
  const user = useUserStore((state) => state.user);
  const canEdit = user?.role === "admin";
  const [isSearching, setIsSearching] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nameInputRef = useRef<HTMLTextAreaElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const selectedKey = editorData && editorData.id !== "new" ? `${editorData.kind}:${editorData.id}` : null;

  const fetchTree = async (query: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append("query", query.trim());
      const response = await authJson<ClassifierTreeResponse>(`/classifier/tree?${params.toString()}`);
      setClassifierState({
        results: response.items,
        lastSearch: { query },
        hasLoaded: true,
      });
    } catch (error) {
      console.error("Failed to fetch classifier tree", error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timerId = setTimeout(() => {
      if (queryInput === lastSearch.query && hasLoaded) return;
      fetchTree(queryInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timerId);
  }, [queryInput, lastSearch.query, hasLoaded]);

  useEffect(() => {
    if (editorData?.id === "new") {
      nameInputRef.current?.focus();
    }
  }, [editorData?.id, editorData?.kind]);

  const updateEditorData = (next: ClassifierEditorData) => {
    if (!canEdit) return;
    setClassifierState({ editorData: next, hasUnsavedChanges: true });
  };

  const requestAction = (action: PendingAction) => {
    if (hasUnsavedChanges) {
      setClassifierState({ pendingAction: action });
      return;
    }
    executeAction(action);
  };

  const executeAction = async (action: PendingAction) => {
    if (action.type === "load-ps") {
      await loadProfStandard(action.id);
    } else if (action.type === "load-group") {
      await loadGroup(action.id);
    } else if (action.type === "load-function") {
      await loadFunction(action.id);
    } else if (action.type === "new-ps") {
      if (!canEdit) return;
      setClassifierState({
        editorData: { kind: "ps", id: "new", codeInput: "06.", name: "", description: "", groups: [] },
        hasUnsavedChanges: true,
      });
    } else if (action.type === "new-group") {
      if (!canEdit) return;
      setClassifierState({
        editorData: {
          kind: "group",
          id: "new",
          code: action.code,
          name: "",
          qualification_level: 1,
          prof_standard: action.standard,
          functions: [],
        },
        hasUnsavedChanges: true,
      });
    } else {
      if (!canEdit) return;
      setClassifierState({
        editorData: {
          kind: "function",
          id: "new",
          code: action.code,
          name: "",
          functions_group: action.group,
          prof_standard: action.standard,
        },
        hasUnsavedChanges: true,
      });
    }
  };

  const loadProfStandard = async (id: number) => {
    try {
      const response = await authJson<ProfStandardDetail>(`/classifier/prof-standards/${id}`);
      setClassifierState({
        editorData: {
          kind: "ps",
          id: response.id,
          codeInput: formatPsCode(response.code),
          name: response.name,
          description: response.description ?? "",
          groups: response.groups,
        },
        hasUnsavedChanges: false,
        pendingAction: null,
      });
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось загрузить профессиональный стандарт", variant: "error" });
    }
  };

  const loadGroup = async (id: number) => {
    try {
      const response = await authJson<GroupDetail>(`/classifier/groups/${id}`);
      setClassifierState({
        editorData: {
          kind: "group",
          id: response.id,
          code: response.code,
          name: response.name,
          qualification_level: response.qualification_level,
          prof_standard: response.prof_standard,
          functions: response.functions,
        },
        hasUnsavedChanges: false,
        pendingAction: null,
      });
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось загрузить ОТФ", variant: "error" });
    }
  };

  const loadFunction = async (id: number) => {
    try {
      const response = await authJson<FunctionDetail>(`/classifier/functions/${id}`);
      setClassifierState({
        editorData: {
          kind: "function",
          id: response.id,
          code: response.code,
          name: response.name,
          functions_group: response.functions_group,
          prof_standard: response.prof_standard,
        },
        hasUnsavedChanges: false,
        pendingAction: null,
      });
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось загрузить ТФ", variant: "error" });
    }
  };

  const handleDiscardAndContinue = () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setClassifierState({ pendingAction: null, hasUnsavedChanges: false });
    executeAction(action);
  };

  const handleCreateGroup = (standard: ClassifierProfStandardTreeItem | { id: number; code: number; name: string; groups?: PsGroupSummary[] }) => {
    const groups = "groups" in standard && standard.groups ? standard.groups : [];
    const code = nextGroupCode(groups);
    if (!code) {
      showToast({ title: "Ошибка", message: "Для профессионального стандарта уже создана ОТФ с кодом Z", variant: "error" });
      return;
    }
    requestAction({
      type: "new-group",
      standard: { id: standard.id, code: standard.code, name: standard.name },
      code,
    });
  };

  const handleCreateFunction = (
    standard: ClassifierProfStandardTreeItem | { id: number; code: number; name: string },
    group: ClassifierGroupTreeItem | { id: number; code: string; name: string; qualification_level: number; functions?: PsFunctionSummary[] },
  ) => {
    requestAction({
      type: "new-function",
      standard: { id: standard.id, code: standard.code, name: standard.name },
      group: {
        id: group.id,
        code: group.code,
        name: group.name,
        qualification_level: group.qualification_level,
      },
      code: nextFunctionCode("functions" in group && group.functions ? group.functions : []),
    });
  };

  const parsePsCode = (): number | null => {
    if (!editorData || editorData.kind !== "ps") return null;
    const digits = editorData.codeInput.replace(/\D/g, "").slice(2);
    if (digits.length !== 3) return null;
    return Number(digits);
  };

  const validationError = useMemo(() => {
    if (!editorData) return null;
    if (!editorData.name.trim()) return "Название не может быть пустым";
    if (editorData.name.length > 256) return "Название не может быть длиннее 256 символов";

    if (editorData.kind === "ps" && parsePsCode() === null) {
      return "Код профессионального стандарта должен иметь формат 06.DDD";
    }

    if (editorData.kind === "group" && !/^[A-Z]$/.test(editorData.code)) {
      return "Код ОТФ должен быть буквой от A до Z";
    }

    if (editorData.kind === "function" && (editorData.code < 1 || editorData.code > 99)) {
      return "Код ТФ должен находиться в интервале от 1 до 99";
    }

    return null;
  }, [editorData]);

  const canSave = hasUnsavedChanges && validationError === null;

  const handleSave = async () => {
    if (!canEdit) return;
    if (!editorData || validationError) return;

    try {
      if (editorData.kind === "ps") {
        const code = parsePsCode();
        if (code === null) return;
        const payload = {
          code,
          name: editorData.name.trim(),
          description: editorData.description.trim() || null,
          groups: editorData.id === "new" ? [] : editorData.groups,
        };
        const response = await authJson<ProfStandardDetail>(
          editorData.id === "new" ? "/classifier/prof-standards" : `/classifier/prof-standards/${editorData.id}`,
          {
            method: editorData.id === "new" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
        await fetchTree(queryInput);
        await loadProfStandard(response.id);
      } else if (editorData.kind === "group") {
        const payload = {
          code: editorData.code,
          name: editorData.name.trim(),
          qualification_level: editorData.qualification_level,
          functions: editorData.id === "new" ? [] : editorData.functions,
        };
        const response = await authJson<GroupDetail>(
          editorData.id === "new"
            ? `/classifier/prof-standards/${editorData.prof_standard.id}/groups`
            : `/classifier/groups/${editorData.id}`,
          {
            method: editorData.id === "new" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
        await fetchTree(queryInput);
        await loadGroup(response.id);
      } else {
        const payload = {
          code: editorData.code,
          name: editorData.name.trim(),
        };
        const response = await authJson<FunctionDetail>(
          editorData.id === "new"
            ? `/classifier/groups/${editorData.functions_group.id}/functions`
            : `/classifier/functions/${editorData.id}`,
          {
            method: editorData.id === "new" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        showToast({ title: "Успех", message: "Изменения сохранены", variant: "success" });
        await fetchTree(queryInput);
        await loadFunction(response.id);
      }
    } catch (error) {
      console.error("Failed to save classifier item", error);
      showToast({ title: "Ошибка", message: "Не удалось сохранить изменения", variant: "error" });
    }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    if (!editorData) return;
    if (editorData.id === "new") {
      setClassifierState({ editorData: null, hasUnsavedChanges: false });
      return;
    }

    const url = editorData.kind === "ps"
      ? `/classifier/prof-standards/${editorData.id}`
      : editorData.kind === "group"
        ? `/classifier/groups/${editorData.id}`
        : `/classifier/functions/${editorData.id}`;

    try {
      await authJson(url, { method: "DELETE" });
      setClassifierState({ editorData: null, hasUnsavedChanges: false });
      setShowDeleteConfirm(false);
      await fetchTree(queryInput);
      showToast({ title: "Успех", message: "Элемент удалён", variant: "success" });
    } catch {
      showToast({ title: "Ошибка", message: "Не удалось удалить элемент", variant: "error" });
    }
  };

  const handlePsCodeChange = (value: string) => {
    if (!editorData || editorData.kind !== "ps") return;
    const digits = value.replace(/\D/g, "").slice(0, 5);
    const tail = digits.startsWith("06") ? digits.slice(2, 5) : digits.slice(0, 3);
    updateEditorData({ ...editorData, codeInput: `06.${tail}` });
  };

  const startDrag = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleGroupDrop = (targetIndex: number) => {
    if (!editorData || editorData.kind !== "ps" || dragIndexRef.current === null) return;
    const groups = [...editorData.groups];
    const [dragged] = groups.splice(dragIndexRef.current, 1);
    groups.splice(targetIndex, 0, dragged);
    updateEditorData({
      ...editorData,
      groups: groups.map((group, index) => ({
        ...group,
        code: String.fromCharCode("A".charCodeAt(0) + index),
      })),
    });
    dragIndexRef.current = null;
  };

  const handleFunctionDrop = (targetIndex: number) => {
    if (!editorData || editorData.kind !== "group" || dragIndexRef.current === null) return;
    const functions = [...editorData.functions];
    const [dragged] = functions.splice(dragIndexRef.current, 1);
    functions.splice(targetIndex, 0, dragged);
    updateEditorData({
      ...editorData,
      functions: functions.map((item, index) => ({ ...item, code: index + 1 })),
    });
    dragIndexRef.current = null;
  };

  const renderTitle = () => {
    if (!editorData) return "Редактор классификатора";
    if (editorData.id === "new") {
      return editorData.kind === "ps" ? "Новый ПС" : editorData.kind === "group" ? "Новая ОТФ" : "Новая ТФ";
    }

    if (editorData.kind === "ps") {
      const code = parsePsCode();
      return code === null ? "06.DDD" : formatPsCode(code);
    }

    if (editorData.kind === "group") {
      return (
        <span className="flex items-center gap-1 min-w-0">
          <button type="button" className="hyperlink" onClick={() => requestAction({ type: "load-ps", id: editorData.prof_standard.id })}>
            {formatPsCode(editorData.prof_standard.code)}
          </button>
          <span>/</span>
          <span>{editorData.code}</span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1 min-w-0">
        <button type="button" className="hyperlink" onClick={() => requestAction({ type: "load-ps", id: editorData.prof_standard.id })}>
          {formatPsCode(editorData.prof_standard.code)}
        </button>
        <span>/</span>
        <button type="button" className="hyperlink" onClick={() => requestAction({ type: "load-group", id: editorData.functions_group.id })}>
          {editorData.functions_group.code}
        </button>
        <span>/</span>
        <span>{formatTfCode(editorData.code, editorData.functions_group.qualification_level)}</span>
      </span>
    );
  };

  return (
    <div className="workspace-container">
      {pendingAction !== null && (
        <EditorConfirmModal
          title="Несохранённые изменения"
          message="Есть несохранённые изменения в редакторе классификатора."
          cancelText="Вернуться"
          confirmText="Отменить изменения"
          confirmVariant="danger"
          onCancel={() => setClassifierState({ pendingAction: null })}
          onConfirm={handleDiscardAndContinue}
        />
      )}

      {showDeleteConfirm && editorData !== null && (
        <EditorConfirmModal
          title="Требуется подтверждение"
          message={`Вы уверены, что хотите удалить «${editorData.name || "новый элемент"}»?`}
          confirmText="Да, удалить навсегда"
          confirmVariant="danger"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}

      <div className="workspace-panel flex-1 flex flex-col h-full min-w-0">
        <h2 className="workspace-panel-header">Классификатор компетенций</h2>
        <div className="mb-4">
          <input
            type="text"
            value={queryInput}
            onChange={(event) => setClassifierState({ queryInput: event.target.value })}
            maxLength={128}
            className="input-field mt-0!"
            placeholder="Поиск по коду или названию"
          />
        </div>
        <ClassifierTree
          items={tree}
          selectedKey={selectedKey}
          isLoading={isSearching}
          canEdit={canEdit}
          onSelectProfStandard={(item) => requestAction({ type: "load-ps", id: item.id })}
          onSelectGroup={(_, group) => requestAction({ type: "load-group", id: group.id })}
          onSelectFunction={(_, __, item) => requestAction({ type: "load-function", id: item.id })}
          onCreateProfStandard={() => requestAction({ type: "new-ps" })}
          onCreateGroup={handleCreateGroup}
          onCreateFunction={handleCreateFunction}
        />
      </div>

      <div className="workspace-panel flex-1 flex flex-col h-full relative min-w-0">
        <div className="flex items-center justify-between gap-4 mb-2 shrink-0">
          <h2 className="workspace-panel-header mb-0 flex-1 min-w-0">{renderTitle()}</h2>
          {editorData && canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <IconButton
                iconSrc="/src/assets/icons/delete.svg"
                altText={editorData.id === "new" ? "Отменить создание" : "Удалить"}
                onClick={editorData.id === "new" ? handleDelete : () => setShowDeleteConfirm(true)}
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
          )}
        </div>

        {editorData ? (
          <div className="flex flex-col flex-1 overflow-hidden pr-2 p-1 min-w-0">
            {editorData.kind === "ps" && (
              <div className="flex flex-col gap-4 h-full min-h-0">
                <div className="max-w-xs">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Код ПС</label>
                  <input
                    type="text"
                    value={editorData.codeInput}
                    onChange={(event) => handlePsCodeChange(event.target.value)}
                    disabled={!canEdit}
                    className="input-field mt-0!"
                    placeholder="06.001"
                  />
                </div>
                <NameField editorData={editorData} nameInputRef={nameInputRef} updateEditorData={updateEditorData} disabled={!canEdit} />
                {validationError && <p className="text-sm text-danger">{validationError}</p>}

                <ClassifierEditorTable<PsGroupSummary>
                  title="Обобщённые трудовые функции"
                  items={editorData.groups}
                  addText="Добавить обобщённую трудовую функцию"
                  renderCode={(group) => group.code}
                  onOpen={(group) => requestAction({ type: "load-group", id: group.id })}
                  onDragStart={startDrag}
                  onDrop={handleGroupDrop}
                  onAdd={() => {
                    if (editorData.id === "new") {
                      showToast({ title: "Сначала сохраните ПС", message: "ОТФ можно добавить после сохранения профессионального стандарта", variant: "error" });
                      return;
                    }
                    handleCreateGroup({
                      id: editorData.id,
                      code: parsePsCode() ?? 0,
                      name: editorData.name,
                      groups: editorData.groups,
                    });
                  }}
                  canEdit={canEdit}
                />
              </div>
            )}

            {editorData.kind === "group" && (
              <div className="flex flex-col gap-4 h-full min-h-0">
                <div className="flex gap-4">
                  <div className="w-32">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Код ОТФ</label>
                    <input
                      type="text"
                      value={editorData.code}
                      onChange={(event) => updateEditorData({ ...editorData, code: normalizeGroupCode(event.target.value) })}
                      disabled={!canEdit}
                      className="input-field mt-0!"
                      maxLength={1}
                    />
                  </div>
                  <div className="w-48">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Уровень квалификации</label>
                    <NumberInput
                      mode="integer"
                      min={1}
                      max={9}
                      value={editorData.qualification_level}
                      onChange={(value) => updateEditorData({ ...editorData, qualification_level: value })}
                      disabled={!canEdit}
                      className="input-field mt-0! w-full"
                    />
                  </div>
                </div>
                <NameField editorData={editorData} nameInputRef={nameInputRef} updateEditorData={updateEditorData} disabled={!canEdit} />
                {validationError && <p className="text-sm text-danger">{validationError}</p>}

                <ClassifierEditorTable<PsFunctionSummary>
                  title="Трудовые функции"
                  items={editorData.functions}
                  addText="Добавить трудовую функцию"
                  renderCode={(item) => formatTfCode(item.code, editorData.qualification_level)}
                  onOpen={(item) => requestAction({ type: "load-function", id: item.id })}
                  onDragStart={startDrag}
                  onDrop={handleFunctionDrop}
                  onAdd={() => {
                    if (editorData.id === "new") {
                      showToast({ title: "Сначала сохраните ОТФ", message: "ТФ можно добавить после сохранения обобщённой трудовой функции", variant: "error" });
                      return;
                    }
                    handleCreateFunction(editorData.prof_standard, {
                      id: editorData.id,
                      code: editorData.code,
                      name: editorData.name,
                      qualification_level: editorData.qualification_level,
                      functions: editorData.functions,
                    });
                  }}
                  canEdit={canEdit}
                />
              </div>
            )}

            {editorData.kind === "function" && (
              <div className="flex flex-col gap-4">
                <div className="max-w-xs">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Код ТФ</label>
                  <NumberInput
                    mode="integer"
                    min={1}
                    max={99}
                    value={editorData.code}
                    onChange={(value) => updateEditorData({ ...editorData, code: value })}
                    disabled={!canEdit}
                    className="input-field mt-0! w-full"
                  />
                </div>
                <NameField editorData={editorData} nameInputRef={nameInputRef} updateEditorData={updateEditorData} disabled={!canEdit} />
                {validationError && <p className="text-sm text-danger">{validationError}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Выберите элемент классификатора для редактирования</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NameField({
  editorData,
  nameInputRef,
  updateEditorData,
  disabled = false,
}: {
  editorData: ClassifierEditorData;
  nameInputRef: RefObject<HTMLTextAreaElement | null>;
  updateEditorData: (next: ClassifierEditorData) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
      <textarea
        ref={nameInputRef}
        value={editorData.name}
        onChange={(event) => updateEditorData({ ...editorData, name: event.target.value })}
        disabled={disabled}
        maxLength={256}
        className="input-field mt-0! resize-y max-h-40"
        style={{ minHeight: "80px" }}
        placeholder="Название"
      />
      <div className="text-xs flex justify-end">
        <span className={editorData.name.length > 256 ? "text-danger" : "text-gray-500"}>
          {editorData.name.length}/256
        </span>
      </div>
    </div>
  );
}
