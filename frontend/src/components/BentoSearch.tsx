import React, { useState, useRef } from "react";
import { Plus, X } from "lucide-react";
import { AutocompleteSearch } from "./AutocompleteSearch";

export interface BentoSearchProps<T, S> {
  // Отображение элементов
  items: T[];
  itemToString: (item: T) => string;
  itemToId: (item: T) => string | number;
  renderItem?: (item: T, index: number) => React.ReactNode;

  // Дополнительные опции
  prefixTitle?: string;
  activeItemId?: string | number | null;

  // Поведение
  reorderEnabled?: boolean;
  closeable?: boolean;
  customSelectLogic?: boolean;

  // Обработчики
  onReorder?: (oldIndex: number, newIndex: number) => void;
  onRemove?: (item: T) => void;
  onItemClick?: (item: T) => void;

  // Пропсы для поиска
  onSearch: (query: string) => Promise<S[]>;
  onAdd: (item: S) => void | Promise<void>;
  searchItemToString: (item: S) => string;
  renderSearchItem?: (item: S) => React.ReactNode;
  placeholder?: string;
  buttonText?: string;
  debounceMs?: number;
  isSearchItemDisabled?: (item: S) => boolean;
}

export function BentoSearch<
  T,
  S extends { id: number | string }
>({
  items,
  itemToString,
  itemToId,
  renderItem,
  prefixTitle,
  activeItemId,
  reorderEnabled = false,
  closeable = false,
  customSelectLogic = false,
  onReorder,
  onRemove,
  onItemClick,
  onSearch,
  onAdd,
  searchItemToString,
  renderSearchItem,
  placeholder = "Поиск...",
  buttonText = "Добавить",
  debounceMs,
  isSearchItemDisabled,
}: BentoSearchProps<T, S>) {
  const [isOpen, setIsOpen] = useState(false);

  // драг-н-дроп состояние
  const dragIndexRef = useRef<number | null>(null);

  // позиция нажатия мыши
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleDragStart = (index: number) => {
    if (!reorderEnabled) return;
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!reorderEnabled) return;
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (!reorderEnabled) return;
    if (dragIndexRef.current !== null && dragIndexRef.current !== targetIndex) {
      onReorder?.(dragIndexRef.current, targetIndex);
    }
    dragIndexRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent, item: T) => {
    if (!customSelectLogic) {
      if (!reorderEnabled) {
        onItemClick?.(item);
      }
      return;
    }

    if (mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 5) { // 5px в рамках допустимых перемещний курсора
        onItemClick?.(item);
      }
    }
    mouseDownPos.current = null;
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {prefixTitle && (
        <div className="px-1 py-2 pb-3 text-xl font-semibold flex items-center select-none border border-transparent">
          {prefixTitle}:
        </div>
      )}

      {items.map((item, index) => {
        const id = itemToId(item);
        const isActive = id === activeItemId;

        return (
          <div
            key={id}
            draggable={reorderEnabled}
            onDragStart={() => handleDragStart(index)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            onMouseDown={handleMouseDown}
            onMouseUp={(e) => handleMouseUp(e, item)}
            onClick={() => {
              if (!customSelectLogic && !reorderEnabled) {
                onItemClick?.(item);
              }
            }}
            className={`px-4 py-2 rounded-xl select-none transition-all border text-sm font-medium max-w-full truncate flex items-center gap-2 ${reorderEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              } ${isActive
                ? "bg-primary text-white border-primary shadow-md"
                : "bg-gray-100 text-gray-800 border-gray-200 hover:border-gray-400"
              }`}
          >
            {renderItem ? renderItem(item, index) : itemToString(item)}

            {closeable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(item);
                }}
                className={`ml-1 flex items-center justify-center rounded-full p-0.5 transition-colors ${isActive ? "hover:bg-white/20 text-white" : "hover:bg-gray-200 text-gray-500"
                  }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* поле скрыто под шторкой */}
      <div
        className="relative h-11 flex items-center shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: isOpen ? "calc(100% - 1rem)" : "2.75rem", maxWidth: isOpen ? "22rem" : "2.75rem" }}
      >
        {/* поле поиска — раскрывается слева */}
        <div className={`flex items-center gap-2 w-full transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <AutocompleteSearch<S>
            onSearch={onSearch}
            onSelect={async (item) => {
              await onAdd(item);
              setIsOpen(false);
            }}
            itemToString={searchItemToString}
            renderItem={renderSearchItem}
            placeholder={placeholder}
            buttonText={buttonText}
            debounceMs={debounceMs}
            isItemDisabled={isSearchItemDisabled}
            className="flex-1"
          />
          {/* отступ для кнопки переключения */}
          <div className="w-11 shrink-0" />
        </div>

        <div
          className="absolute inset-y-0 right-0 bg-white border border-gray-400 border-dashed rounded-full z-10 transition-all duration-300 ease-in-out flex items-center overflow-hidden"
          style={{ width: isOpen ? "2.75rem" : "100%" }}
        >
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="h-11 w-11 flex items-center justify-center text-gray-500 hover:text-gray-900 shrink-0 outline-none transition-colors"
            title={isOpen ? "Отменить" : "Добавить"}
          >
            <Plus
              className={`w-5 h-5 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
            />
          </button>
          {!isOpen && (
            <span className="text-sm text-gray-400 select-none pr-4 truncate">
              {placeholder}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
