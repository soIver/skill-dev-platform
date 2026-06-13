import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type {
  ClassifierGroupTreeItem,
  ClassifierProfStandardTreeItem,
} from "../hooks/useContentStore";
import {
  filterClassifierTree,
  formatPsCode,
  formatTfCode,
  getClassifierFunctionIds,
} from "../utils/classifier";

interface PsFunctionSelectorModalProps {
  items: ClassifierProfStandardTreeItem[];
  selectedIds: number[];
  isLoading?: boolean;
  maxSelected?: number | null;
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}

interface CheckBoxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}

function CheckBox({ checked, indeterminate = false, onChange }: CheckBoxProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="checkbox-field mt-1 shrink-0"
    />
  );
}

function getDefaultExpanded(items: ClassifierProfStandardTreeItem[]): Set<string> {
  const keys = new Set<string>();
  items.forEach((standard) => {
    keys.add(`ps:${standard.id}`);
    standard.groups.forEach((group) => keys.add(`group:${group.id}`));
  });
  return keys;
}

function groupFunctionIds(group: ClassifierGroupTreeItem): number[] {
  return group.functions.map((item) => item.id);
}

export function PsFunctionSelectorModal({
  items,
  selectedIds,
  isLoading = false,
  maxSelected = 10,
  onConfirm,
  onCancel,
}: PsFunctionSelectorModalProps) {
  const [query, setQuery] = useState("");
  const [draftIds, setDraftIds] = useState<Set<number>>(() => new Set(selectedIds));
  const filteredItems = useMemo(() => filterClassifierTree(items, query), [items, query]);
  const defaultExpanded = useMemo(() => getDefaultExpanded(filteredItems), [filteredItems]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => getDefaultExpanded(filteredItems));
  const selectedCount = draftIds.size;
  const error = maxSelected !== null && selectedCount > maxSelected ? `Можно выбрать не более ${maxSelected} трудовых функций` : "";

  useEffect(() => {
    setExpandedKeys(defaultExpanded);
  }, [defaultExpanded]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const replaceIds = (ids: number[], shouldSelect: boolean) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (shouldSelect) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const toggleIds = (ids: number[]) => {
    const allSelected = ids.length > 0 && ids.every((id) => draftIds.has(id));
    replaceIds(ids, !allSelected);
  };

  const rowClass = "flex items-start gap-2 rounded-lg px-2 py-1.5 text-left text-gray-800 transition-colors hover:bg-gray-100 min-w-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay-animate"
      onClick={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-xl shadow-xl p-5 w-[min(58rem,calc(100vw-2rem))] h-[min(44rem,calc(100vh-2rem))] border border-gray-200 modal-content-animate flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg ml-1 font-semibold text-gray-900">Выбор трудовых функций</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            title="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 mb-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              maxLength={256}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по коду или названию"
              className="input-field mt-0! pr-10"
            />
            {query && (
              <button
                type="button"
                aria-label="Очистить поле"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandedKeys(defaultExpanded)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors"
          >
            Раскрыть все
          </button>
          <button
            type="button"
            onClick={() => setExpandedKeys(new Set())}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors"
          >
            Скрыть все
          </button>
          <button
            type="button"
            onClick={() => setDraftIds(new Set())}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-danger hover:text-danger transition-colors"
          >
            Очистить
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {filteredItems.length === 0 ? (
            <div className="flex h-full min-h-40 items-start justify-center px-1 py-8 text-center text-gray-500">
              {isLoading ? "Загрузка..." : "Элементы не найдены"}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredItems.map((standard) => {
                const standardKey = `ps:${standard.id}`;
                const standardIds = getClassifierFunctionIds([standard]);
                const selectedStandardCount = standardIds.filter((id) => draftIds.has(id)).length;
                const standardChecked = standardIds.length > 0 && selectedStandardCount === standardIds.length;
                const standardIndeterminate = selectedStandardCount > 0 && !standardChecked;
                const isStandardExpanded = expandedKeys.has(standardKey);

                return (
                  <div key={standardKey} className="min-w-0">
                    <div className={rowClass}>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(standardKey)}
                        className="p-0.5 rounded-xl hover:bg-black/10 shrink-0"
                        title={isStandardExpanded ? "Скрыть" : "Раскрыть"}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform ${isStandardExpanded ? "rotate-90" : ""}`} />
                      </button>
                      <CheckBox
                        checked={standardChecked}
                        indeterminate={standardIndeterminate}
                        onChange={() => toggleIds(standardIds)}
                      />
                      <button
                        type="button"
                        onClick={() => toggleIds(standardIds)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="font-semibold mr-2">{formatPsCode(standard.code)}</span>
                        <span className="align-bottom whitespace-normal wrap-break-word">{standard.name}</span>
                      </button>
                    </div>

                    {isStandardExpanded && (
                      <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-gray-200 pl-3">
                        {standard.groups.map((group) => {
                          const groupKey = `group:${group.id}`;
                          const ids = groupFunctionIds(group);
                          const selectedGroupCount = ids.filter((id) => draftIds.has(id)).length;
                          const groupChecked = ids.length > 0 && selectedGroupCount === ids.length;
                          const groupIndeterminate = selectedGroupCount > 0 && !groupChecked;
                          const isGroupExpanded = expandedKeys.has(groupKey);

                          return (
                            <div key={groupKey} className="min-w-0">
                              <div className={rowClass}>
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(groupKey)}
                                  className="p-0.5 rounded hover:bg-black/10 shrink-0"
                                  title={isGroupExpanded ? "Свернуть" : "Развернуть"}
                                >
                                  <ChevronRight className={`w-4 h-4 transition-transform ${isGroupExpanded ? "rotate-90" : ""}`} />
                                </button>
                                <CheckBox
                                  checked={groupChecked}
                                  indeterminate={groupIndeterminate}
                                  onChange={() => toggleIds(ids)}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleIds(ids)}
                                  className="flex-1 min-w-0 text-left"
                                >
                                  <span className="font-semibold mr-2">{group.code}</span>
                                  <span className="align-bottom whitespace-normal wrap-break-word">{group.name}</span>
                                </button>
                              </div>

                              {isGroupExpanded && (
                                <div className="ml-7 mt-1 flex flex-col gap-1 border-l border-gray-200 pl-3">
                                  {group.functions.map((item) => {
                                    const checked = draftIds.has(item.id);
                                    return (
                                      <div key={`function:${item.id}`} className={rowClass}>
                                        <CheckBox
                                          checked={checked}
                                          onChange={() => toggleIds([item.id])}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => toggleIds([item.id])}
                                          className="flex flex-1 items-start gap-2 min-w-0 text-left"
                                        >
                                          <span className="font-semibold shrink-0">
                                            {formatTfCode(item.code, group.qualification_level)}
                                          </span>
                                          <span className="whitespace-normal wrap-break-word">{item.name}</span>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 shrink-0">
          <span className={`text-sm ${error ? "text-danger" : "text-gray-500"}`}>
            {maxSelected === null ? `Выбрано ${selectedCount}` : `Выбрано ${selectedCount}/${maxSelected}`}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => onConfirm(Array.from(draftIds))}
              disabled={Boolean(error)}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
