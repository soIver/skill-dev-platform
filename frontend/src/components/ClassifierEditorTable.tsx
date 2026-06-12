import { GripVertical, Plus } from "lucide-react";

interface ClassifierEditorTableProps<T extends { id: number | string; name: string }> {
  title: string;
  items: T[];
  addText: string;
  canEdit?: boolean;
  canAdd?: boolean;
  renderCode: (item: T) => string;
  onAdd: () => void;
  onOpen: (item: T) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}

export function ClassifierEditorTable<T extends { id: number | string; name: string }>({
  title,
  items,
  addText,
  canEdit = true,
  canAdd = true,
  renderCode,
  onAdd,
  onOpen,
  onDragStart,
  onDrop,
}: ClassifierEditorTableProps<T>) {
  return (
    <div className="mt-2 flex flex-col flex-1 min-h-0 max-w-150">
      <h3 className="text-lg font-semibold text-gray-800 mb-3 shrink-0">{title}</h3>

      <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="grid grid-cols-[1rem_4rem_1fr] gap-3 px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-600 shrink-0">
          <span />
          <span>Код</span>
          <span>Название</span>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable={canEdit}
              onDragStart={() => onDragStart(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(index)}
              className="grid grid-cols-[1rem_4rem_1fr] gap-3 px-3 py-2 border-t border-gray-100 items-start"
            >
              {canEdit ? (
                <GripVertical className="w-4 h-4 text-gray-400 cursor-grab mt-0.5" />
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="text-left hyperlink font-semibold min-w-0"
              >
                {renderCode(item)}
              </button>
              <span className="text-gray-800 whitespace-normal wrap-break-word min-w-0">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="mt-4 w-full py-2.5 px-4 border border-dashed border-primary text-primary hover:bg-blue-50 transition-colors font-semibold rounded-lg flex items-center justify-center gap-2 shrink-0 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
        >
          <Plus className="w-5 h-5" />
          {addText}
        </button>
      )}
    </div>
  );
}
