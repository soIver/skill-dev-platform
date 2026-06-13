import { useState } from "react";
import type {
  ClassifierProfStandardTreeItem,
  PsFunctionItem,
} from "../hooks/useContentStore";
import { findClassifierFunctionById } from "../utils/classifier";
import { PsFunctionSelectorModal } from "./PsFunctionSelectorModal";

interface PsFunctionSelectorFieldProps {
  items: ClassifierProfStandardTreeItem[];
  selectedFunctions: PsFunctionItem[];
  onChange: (items: PsFunctionItem[]) => void;
  isLoading?: boolean;
  error?: string;
  maxSelected?: number | null;
}

export function PsFunctionSelectorField({
  items,
  selectedFunctions,
  onChange,
  isLoading = false,
  error = "",
  maxSelected = 10,
}: PsFunctionSelectorFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = (ids: number[]) => {
    const selectedItems = ids.reduce<PsFunctionItem[]>((acc, id) => {
      const item = findClassifierFunctionById(items, id) ?? selectedFunctions.find((func) => func.id === id);
      if (item) acc.push(item);
      return acc;
    }, []);
    onChange(selectedItems);
    setIsOpen(false);
  };

  return (
    <>
      <div className="mb-4">
        <p className="text-lg font-semibold text-gray-900">
          Трудовые функции:{" "}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hyperlink font-semibold"
          >
            {selectedFunctions.length} выбрано
          </button>
        </p>
        {error && (
          <p className="mt-1 text-xs text-danger font-medium">{error}</p>
        )}
      </div>

      {isOpen && (
        <PsFunctionSelectorModal
          items={items}
          selectedIds={selectedFunctions.map((item) => item.id)}
          isLoading={isLoading}
          maxSelected={maxSelected}
          onConfirm={handleConfirm}
          onCancel={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
