import React, { useState, useEffect, useRef } from "react";
import { SEARCH_DEBOUNCE_MS } from "../config";

interface AutocompleteSearchProps<T> {
  onSearch: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  onInputChange?: (value: string) => void;
  itemToString: (item: T) => string;
  renderItem?: (item: T) => React.ReactNode;
  placeholder?: string;
  buttonText?: string;
  isItemDisabled?: (item: T) => boolean;
  debounceMs?: number;
  className?: string;
  onSelectCustom?: (value: string) => void;
}

export function AutocompleteSearch<T extends { id: number | string }>({
  onSearch,
  onSelect,
  itemToString,
  renderItem,
  placeholder = "Поиск...",
  buttonText = "Добавить",
  isItemDisabled,
  debounceMs = SEARCH_DEBOUNCE_MS,
  className = "",
  onInputChange,
  onSelectCustom,
}: AutocompleteSearchProps<T>) {
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (inputValue && (!selectedItem || itemToString(selectedItem) !== inputValue)) {
      setSelectedItem(null);
      timerRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const data = await onSearch(inputValue);
          setResults(data);
          setShowDropdown(data.length > 0);
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    } else if (!inputValue) {
      setResults([]);
      setShowDropdown(false);
      setSelectedItem(null);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue, onSearch, debounceMs]);

  const handleItemClick = (item: T) => {
    const str = itemToString(item);
    setInputValue(str);
    setSelectedItem(item);
    setShowDropdown(false);
  };

  const handleButtonClick = () => {
    if (selectedItem) {
      onSelect(selectedItem);
      setInputValue("");
      if (onInputChange) onInputChange("");
      setSelectedItem(null);
    } else if (onSelectCustom && inputValue.trim().length > 0) {
      onSelectCustom(inputValue.trim());
      setInputValue("");
      if (onInputChange) onInputChange("");
      setSelectedItem(null);
    }
  };

  const isBtnDisabled =
    (!selectedItem && !(onSelectCustom && inputValue.trim().length > 0)) ||
    (selectedItem !== null && isItemDisabled !== undefined && isItemDisabled(selectedItem));

  return (
    <div className={`flex gap-4 items-start relative ${className}`} ref={dropdownRef}>
      <div className="flex-1 relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
            if (onInputChange) onInputChange(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          className="input-field mt-0!"
          placeholder={placeholder}
        />
        {showDropdown && results.length > 0 && (
          <ul className="absolute z-20 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((item) => {
              const disabled = isItemDisabled && isItemDisabled(item);
              return (
                <li
                  key={item.id}
                  className={`px-4 py-2 text-sm transition-colors ${disabled
                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                    : "hover:bg-gray-50 cursor-pointer text-gray-900"
                    }`}
                  onClick={() => !disabled && handleItemClick(item)}
                >
                  {renderItem ? renderItem(item) : itemToString(item)}
                </li>
              );
            })}
          </ul>
        )}
        {isLoading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 bg-white pl-1">
            Поиск...
          </span>
        )}
      </div>
      <button
        disabled={isBtnDisabled}
        onClick={handleButtonClick}
        className={`px-4 py-2 rounded-xl font-medium text-white transition-colors h-[42px] ${isBtnDisabled ? "bg-gray-300 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"
          }`}
      >
        {buttonText}
      </button>
    </div>
  );
}
