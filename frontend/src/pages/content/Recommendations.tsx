import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { useContentStore, type RecommendationItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";

interface SearchResponse {
  items: RecommendationItem[];
  total_pages: number;
  current_page: number;
}

export default function ContentRecommendations() {
  const { recommendations, setRecommendationsState } = useContentStore();
  const { keywordInput, results, currentPage, totalPages, lastSearch } = recommendations;

  const [isSearching, setIsSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecommendations = async (keyword: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (keyword) params.append("keyword", keyword);

      const response = await authJson<SearchResponse>(`/recommendations?${params.toString()}`);
      setRecommendationsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { keyword, page }
      });
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
    } finally {
      setIsSearching(false);
      setIsDebouncing(false);
    }
  };

  useEffect(() => {
    setIsDebouncing(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (
        keywordInput === lastSearch.keyword &&
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchRecommendations(keywordInput, 1);
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywordInput]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchRecommendations(lastSearch.keyword, newPage);
    }
  };

  const handleCreate = () => {
    // To be implemented as requested by user, for now it does nothing
  };

  const columns: Column<RecommendationItem>[] = [
    {
      key: "description_preview",
      header: "Рекомендация",
      align: "left",
      width: "w-2/5",
      render: (item) => <span className="text-gray-900">{item.description_preview}</span>,
    },
    {
      key: "issued_count",
      header: "Выдана",
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
        <span className={`inline-block px-2 py-1 rounded text-sm ${item.status === "Опубликовано" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }`}>
          {item.status}
        </span>
      ),
    },
  ];

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список рекомендаций</h2>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ключевые слова</label>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setRecommendationsState({ keywordInput: e.target.value })}
              className="input-field"
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
          emptyMessage="Рекомендации не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header">Редактор рекомендаций</h2>
        <div className="flex-1 overflow-auto mt-4">
          <p className="text-gray-500">Выберите рекомендацию для редактирования...</p>
        </div>
      </div>
    </div>
  );
}
