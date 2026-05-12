import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { SEARCH_DEBOUNCE_MS } from "../../config";
import { useContentStore, type TestItem, type ProficiencyItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";

interface SearchResponse {
  items: TestItem[];
  total_pages: number;
  current_page: number;
}

interface ProfSearchResponse {
  items: ProficiencyItem[];
  total_pages: number;
  current_page: number;
}

export default function ContentTests() {
  const { tests, setTestsState } = useContentStore();
  const { searchInput, results, currentPage, totalPages, lastSearch, selectedId, hasUnsavedChanges } = tests;

  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTests = async (search: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.append("search", search);

      const response = await authJson<SearchResponse>(`/tests?${params.toString()}`);
      setTestsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { search, page }
      });
    } catch (error) {
      console.error("Failed to fetch tests", error);
    } finally {
      setIsSearching(false);
      setIsDebouncing(false);
    }
  };

  useEffect(() => {
    setIsDebouncing(true);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (searchInput === lastSearch.search && results.length > 0) {
        setIsDebouncing(false);
        return;
      }
      fetchTests(searchInput, 1);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchInput]);

  const fetchProficiencies = async (query: string) => {
    let skill = query;
    let level = "";
    if (query.includes("-")) {
      const parts = query.split("-");
      skill = parts[0].trim();
      level = parts.slice(1).join("-").trim();
    } else {
      skill = query.trim();
    }

    const params = new URLSearchParams({ skill, page: "1" });
    if (level) params.append("level", level);

    const response = await authJson<ProfSearchResponse>(`/skills/proficiencies?${params.toString()}`);
    return response.items;
  };

  const handleSelectCreate = (item: ProficiencyItem) => {
    if (selectedId === "new") return;

    if (hasUnsavedChanges) {
      setTestsState({ pendingSelectId: "new" });
    } else {
      setTestsState({
        selectedId: "new",
        editorData: { time_limit_minutes: null, threshold_score: null, variant: 1, is_published: false, proficiency_id: item.id },
        hasUnsavedChanges: true,
        pendingSelectId: null
      });
    }
  };

  const handleInputChange = (value: string) => {
    setTestsState({ searchInput: value });
  };

  const columns: Column<TestItem>[] = [
    {
      key: "skill_name",
      header: "Навык",
      align: "left",
      width: "w-2/6",
      render: (item) => <span className="text-gray-900">{item.skill_name} - <span className="text-gray-500">{item.level_name}</span></span>,
    },
    {
      key: "variant",
      header: "Вариант",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-900">{item.variant}</span>,
    },
    {
      key: "attempts_count",
      header: "Попыток",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-900">{item.attempts_count}</span>,
    },
    {
      key: "passed_count",
      header: "Прошли",
      align: "center",
      width: "w-1/6",
      render: (item) => <span className="text-gray-500">{item.passed_count}</span>,
    },
    {
      key: "status",
      header: "Статус",
      align: "center",
      width: "w-1/6",
      render: (item) => (
        <span className={`inline-block px-2 py-1 rounded text-sm ${item.status === "Опубликовано" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}`}>
          {item.status}
        </span>
      ),
    },
  ];

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchTests(lastSearch.search, newPage);
    }
  };

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
      {/* левая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список тестов</h2>

        <div className="mb-6">
          <AutocompleteSearch<ProficiencyItem>
            onSearch={fetchProficiencies}
            onSelect={handleSelectCreate}
            onInputChange={handleInputChange}
            itemToString={(p) => `${p.skill_name} - ${p.level_name}`}
            renderItem={(p) => (
              <>
                {p.skill_name} - <span className="text-gray-500">{p.level_name}</span>
              </>
            )}
            placeholder="Поиск по навыку"
            buttonText="Создать"
          />
        </div>

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isSearching || isDebouncing}
          emptyMessage="Тесты не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* правая панель */}
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header">Редактор тестов</h2>
        <div className="flex-1 flex items-center justify-center">
          {selectedId === "new" ? (
            <p className="text-gray-500">Создание нового теста...</p>
          ) : selectedId ? (
            <p className="text-gray-500">Редактирование теста #{selectedId}...</p>
          ) : (
            <p className="text-gray-500">Выберите тест для редактирования...</p>
          )}
        </div>
      </div>
    </div>
  );
}
