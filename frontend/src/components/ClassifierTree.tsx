import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { LoadingText } from "./LoadingText";
import type {
  ClassifierFunctionTreeItem,
  ClassifierGroupTreeItem,
  ClassifierProfStandardTreeItem,
} from "../hooks/useContentStore";
import { formatPsCode, formatTfCode } from "../utils/classifier";

interface ClassifierTreeProps {
  items: ClassifierProfStandardTreeItem[];
  selectedKey: string | null;
  isLoading?: boolean;
  canEdit?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  onSelectProfStandard: (item: ClassifierProfStandardTreeItem) => void;
  onSelectGroup: (standard: ClassifierProfStandardTreeItem, group: ClassifierGroupTreeItem) => void;
  onSelectFunction: (
    standard: ClassifierProfStandardTreeItem,
    group: ClassifierGroupTreeItem,
    item: ClassifierFunctionTreeItem,
  ) => void;
  onCreateProfStandard: () => void;
  onCreateGroup: (standard: ClassifierProfStandardTreeItem) => void;
  onCreateFunction: (standard: ClassifierProfStandardTreeItem, group: ClassifierGroupTreeItem) => void;
}

export function ClassifierTree({
  items,
  selectedKey,
  isLoading = false,
  canEdit = true,
  expandAllSignal = 0,
  collapseAllSignal = 0,
  onSelectProfStandard,
  onSelectGroup,
  onSelectFunction,
  onCreateProfStandard,
  onCreateGroup,
  onCreateFunction,
}: ClassifierTreeProps) {
  const defaultExpanded = useMemo(() => {
    const keys = new Set<string>();
    items.forEach((standard) => {
      keys.add(`ps:${standard.id}`);
      standard.groups.forEach((group) => keys.add(`group:${group.id}`));
    });
    return keys;
  }, [items]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(defaultExpanded);
  const hasInitializedExpansionRef = useRef(items.length > 0);

  useEffect(() => {
    if (!hasInitializedExpansionRef.current && items.length > 0) {
      setExpandedKeys(defaultExpanded);
      hasInitializedExpansionRef.current = true;
    }
  }, [defaultExpanded, items.length]);

  useEffect(() => {
    if (expandAllSignal > 0) {
      setExpandedKeys(defaultExpanded);
    }
  }, [expandAllSignal, defaultExpanded]);

  useEffect(() => {
    if (collapseAllSignal > 0) {
      setExpandedKeys(new Set());
    }
  }, [collapseAllSignal]);

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

  const rowClass = (key: string) =>
    `group flex items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors min-w-0 ${
      selectedKey === key
        ? "bg-primary text-white"
        : "hover:bg-gray-100 text-gray-800"
    }`;

  return (
    <div className="flex flex-col min-h-0 max-w-150 flex-1">
      <div className="flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="flex h-full min-h-40 items-start justify-center px-1 py-8 text-center text-gray-500">
            {isLoading ? <LoadingText text="Поиск..." /> : "Элементы не найдены"}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((standard) => {
              const standardKey = `ps:${standard.id}`;
              const isStandardExpanded = expandedKeys.has(standardKey);
              return (
                <div key={standardKey} className="min-w-0">
                  <div className={rowClass(standardKey)}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(standardKey)}
                      className="p-0.5 rounded-xl hover:bg-black/10 shrink-0"
                      title={isStandardExpanded ? "Скрыть" : "Раскрыть"}
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${isStandardExpanded ? "rotate-90" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProfStandard(standard)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="font-semibold mr-2">{formatPsCode(standard.code)}</span>
                      <span className="align-bottom whitespace-normal wrap-break-word">{standard.name}</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onCreateGroup(standard)}
                        className="p-1 rounded-full hover:bg-black/10 opacity-80 hover:opacity-100 shrink-0"
                        title="Добавить ОТФ"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isStandardExpanded && (
                    <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-gray-200 pl-3">
                      {standard.groups.map((group) => {
                        const groupKey = `group:${group.id}`;
                        const isGroupExpanded = expandedKeys.has(groupKey);
                        return (
                          <div key={groupKey} className="min-w-0">
                            <div className={rowClass(groupKey)}>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(groupKey)}
                                className="p-0.5 rounded hover:bg-black/10 shrink-0"
                                title={isGroupExpanded ? "Свернуть" : "Развернуть"}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform ${isGroupExpanded ? "rotate-90" : ""}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectGroup(standard, group)}
                                className="flex-1 min-w-0 text-left"
                              >
                                <span className="font-semibold mr-2">{group.code}</span>
                                <span className="align-bottom whitespace-normal wrap-break-word">{group.name}</span>
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => onCreateFunction(standard, group)}
                                  className="p-1 rounded-full hover:bg-black/10 opacity-80 hover:opacity-100 shrink-0"
                                  title="Добавить ТФ"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {isGroupExpanded && (
                              <div className="ml-7 mt-1 flex flex-col gap-1 border-l border-gray-200 pl-3">
                                {group.functions.map((item) => {
                                  const functionKey = `function:${item.id}`;
                                  return (
                                    <button
                                      key={functionKey}
                                      type="button"
                                      onClick={() => onSelectFunction(standard, group, item)}
                                      className={rowClass(functionKey)}
                                    >
                                      <span className="font-semibold shrink-0">
                                        {formatTfCode(item.code, group.qualification_level)}
                                      </span>
                                      <span className="whitespace-normal wrap-break-word">{item.name}</span>
                                    </button>
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

      {canEdit && (
        <button
          type="button"
          onClick={onCreateProfStandard}
          className="mt-4 w-full py-2.5 px-4 border border-dashed border-primary text-primary hover:bg-blue-50 transition-colors font-semibold rounded-lg flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="w-5 h-5" />
          Добавить профессиональный стандарт
        </button>
      )}
    </div>
  );
}
