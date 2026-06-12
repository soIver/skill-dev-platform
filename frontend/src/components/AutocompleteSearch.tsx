import React, { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { X } from "lucide-react";
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
  hideButton?: boolean;
  value?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  showClearButton?: boolean;
  clearOnSelect?: boolean;
  nextFocusRef?: RefObject<HTMLButtonElement | null>;
  onSelectedItemChange?: (item: T | null) => void;
}

export function AutocompleteSearch<T extends { id: number | string }>({
  onSearch,
  onSelect,
  itemToString,
  renderItem,
  placeholder = "",
  buttonText = "Добавить",
  isItemDisabled,
  debounceMs = SEARCH_DEBOUNCE_MS,
  className = "",
  onInputChange,
  onSelectCustom,
  hideButton = false,
  value,
  onKeyDown,
  showClearButton = false,
  clearOnSelect = false,
  nextFocusRef,
  onSelectedItemChange,
}: AutocompleteSearchProps<T>) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onSearchRef = useRef(onSearch);
  const itemToStringRef = useRef(itemToString);
  const onInputChangeRef = useRef(onInputChange);
  const onSelectedItemChangeRef = useRef(onSelectedItemChange);
  const shouldRevealResultsRef = useRef(false);
  const latestSearchRef = useRef(0);

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
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    itemToStringRef.current = itemToString;
  }, [itemToString]);

  useEffect(() => {
    onInputChangeRef.current = onInputChange;
  }, [onInputChange]);

  useEffect(() => {
    onSelectedItemChangeRef.current = onSelectedItemChange;
  }, [onSelectedItemChange]);

  useEffect(() => {
    if (value === undefined) {
      return;
    }

    setInputValue(value);
    if (!value) {
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);
    }
  }, [value]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, results.length);
  }, [results]);

  const performSearch = async (query: string, revealResults: boolean) => {
    const searchId = latestSearchRef.current + 1;
    latestSearchRef.current = searchId;
    setIsLoading(true);

    try {
      const data = await onSearchRef.current(query);
      if (latestSearchRef.current !== searchId) {
        return;
      }
      setResults(data);
      setShowDropdown(revealResults && data.length > 0);
    } catch (error) {
      if (latestSearchRef.current === searchId) {
        setResults([]);
        setShowDropdown(false);
      }
      console.error("Search failed", error);
    } finally {
      if (latestSearchRef.current === searchId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const hasSelectedMatch = selectedItem && itemToStringRef.current(selectedItem) === inputValue;
    const shouldSearch = !hasSelectedMatch && (inputValue.length > 0 || shouldRevealResultsRef.current);

    if (shouldSearch) {
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);

      if (debounceMs <= 0) {
        void performSearch(inputValue, shouldRevealResultsRef.current);
      } else {
        timerRef.current = setTimeout(() => {
          void performSearch(inputValue, shouldRevealResultsRef.current);
        }, debounceMs);
      }
    } else if (!inputValue && !shouldRevealResultsRef.current) {
      setResults([]);
      setShowDropdown(false);
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue, debounceMs, selectedItem]);

  const handleFocus = () => {
    shouldRevealResultsRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (selectedItem && itemToStringRef.current(selectedItem) === inputValue) {
      setShowDropdown(results.length > 0);
      return;
    }

    void performSearch(inputValue, true);
  };

  const handleItemClick = (item: T) => {
    const str = itemToString(item);
    if (clearOnSelect) {
      onSelect(item);
      setInputValue("");
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);
      setResults([]);
      setShowDropdown(false);
      shouldRevealResultsRef.current = false;
      onInputChangeRef.current?.("");
      return;
    }

    setInputValue(str);
    setSelectedItem(item);
    onSelectedItemChangeRef.current?.(item);
    setShowDropdown(false);
    shouldRevealResultsRef.current = false;
    onInputChangeRef.current?.(str);
    requestAnimationFrame(() => {
      if (nextFocusRef?.current) {
        nextFocusRef.current.focus();
        return;
      }
      if (!hideButton) {
        actionButtonRef.current?.focus();
      }
    });
  };

  const handleButtonClick = () => {
    if (selectedItem) {
      onSelect(selectedItem);
      setInputValue("");
      onInputChangeRef.current?.("");
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);
      shouldRevealResultsRef.current = false;
    } else if (onSelectCustom && inputValue.trim().length > 0) {
      onSelectCustom(inputValue.trim());
      setInputValue("");
      onInputChangeRef.current?.("");
      setSelectedItem(null);
      onSelectedItemChangeRef.current?.(null);
      shouldRevealResultsRef.current = false;
    }
  };

  const clearInput = () => {
    setInputValue("");
    setResults([]);
    setSelectedItem(null);
    onSelectedItemChangeRef.current?.(null);
    setShowDropdown(false);
    shouldRevealResultsRef.current = false;
    onInputChangeRef.current?.("");
    inputRef.current?.focus();
  };

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  const getEnabledOptionIndex = (startIndex: number, direction: 1 | -1) => {
    let index = startIndex;
    while (index >= 0 && index < results.length) {
      const item = results[index];
      if (!isItemDisabled || !isItemDisabled(item)) {
        return index;
      }
      index += direction;
    }
    return -1;
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      const firstEnabledIndex = getEnabledOptionIndex(0, 1);
      if (firstEnabledIndex !== -1) {
        event.preventDefault();
        if (!showDropdown) {
          setShowDropdown(true);
        }
        focusOption(firstEnabledIndex);
      }
    } else if (event.key === "Escape") {
      setShowDropdown(false);
    }

    onKeyDown?.(event);
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, item: T) => {
    if (event.key === "ArrowDown") {
      const nextIndex = getEnabledOptionIndex(index + 1, 1);
      if (nextIndex !== -1) {
        event.preventDefault();
        focusOption(nextIndex);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      const previousIndex = getEnabledOptionIndex(index - 1, -1);
      event.preventDefault();
      if (previousIndex !== -1) {
        focusOption(previousIndex);
      } else {
        inputRef.current?.focus();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleItemClick(item);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setShowDropdown(false);
      inputRef.current?.focus();
    }
  };

  const isBtnDisabled =
    (!selectedItem && !(onSelectCustom && inputValue.trim().length > 0)) ||
    (selectedItem !== null && isItemDisabled !== undefined && isItemDisabled(selectedItem));

  return (
    <div className={`flex gap-4 items-center relative ml-1 ${className}`} ref={dropdownRef}>
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          type="text"
          maxLength={32}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            shouldRevealResultsRef.current = true;
            setShowDropdown(true);
            onInputChangeRef.current?.(e.target.value);
          }}
          onFocus={handleFocus}
          onKeyDown={handleInputKeyDown}
          className={`input-field mt-0! ${showClearButton ? "pr-10" : ""}`}
          placeholder={placeholder}
        />
        {showClearButton && inputValue && (
          <button
            type="button"
            aria-label="Очистить поле"
            onClick={clearInput}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {showDropdown && results.length > 0 && (
          <ul className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((item, index) => {
              const disabled = isItemDisabled && isItemDisabled(item);
              return (
                <li
                  key={item.id}
                  className={disabled ? "bg-gray-50 opacity-50" : ""}
                >
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index, item)}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${disabled
                      ? "cursor-not-allowed"
                      : "text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                      }`}
                  >
                    {renderItem ? renderItem(item) : itemToString(item)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {isLoading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 bg-white pl-1">
          </span>
        )}
      </div>
      {!hideButton && (
        <button
          ref={actionButtonRef}
          disabled={isBtnDisabled}
          onClick={handleButtonClick}
          className={`px-4 py-2 rounded-xl font-medium text-white transition-colors h-[42px] shrink-0 ${isBtnDisabled ? "bg-gray-300 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"
            }`}
        >
          {buttonText}
        </button>
      )}
    </div>
  );
}
