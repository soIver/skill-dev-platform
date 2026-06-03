import React, { useEffect } from "react";
import { ITEMS_PER_TABLE_PAGE } from "../config";
import { Pagination } from "./Pagination";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
  showProgressBar?: boolean;
}

interface PaginatedTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  emptyMessage: React.ReactNode;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick?: (item: T) => void;
  itemsPerPage?: number;
  onPreload?: (nextPage: number) => void;
  useClientSlice?: boolean;
}

export function PaginatedTable<T extends { id: number | string }>({
  columns,
  data,
  isLoading,
  emptyMessage,
  currentPage,
  totalPages,
  onPageChange,
  onRowClick,
  itemsPerPage = ITEMS_PER_TABLE_PAGE.DEFAULT,
  onPreload,
  useClientSlice,
}: PaginatedTableProps<T>) {
  // автоматическая предзагрузка следующей страницы при доступности
  useEffect(() => {
    if (onPreload && currentPage < totalPages) {
      onPreload(currentPage + 1);
    }
  }, [currentPage, totalPages, onPreload]);

  // локальный срез данных по страницам если включена предзагрузка или запрошено явно
  const shouldSlice = useClientSlice ?? (onPreload !== undefined);
  const currentData = shouldSlice
    ? data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : data;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 font-medium text-gray-700 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                    } ${col.width || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentData.length > 0 ? (
              currentData.map((item) => (
                <tr
                  key={item.id}
                  className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50"}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                        } ${col.width || ""}`}
                    >
                      {col.showProgressBar ? (
                        <div className={`flex items-center gap-2 ${col.align === "center" ? "justify-center" : col.align === "right" ? "justify-end" : "justify-start"}`}>
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{ width: `${Math.min(100, Number((item as Record<string, unknown>)[col.key]) * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600 shrink-0">{(Number((item as Record<string, unknown>)[col.key]) * 100).toFixed(0)}%</span>
                        </div>
                      ) : col.render ? col.render(item) : (item as Record<string, React.ReactNode>)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-gray-500">
                  {isLoading ? "Поиск..." : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPreloadNext={() => {
          if (currentPage < totalPages) {
            onPreload?.(currentPage + 1);
          }
        }}
        className={`mt-4 transition-opacity duration-300 ${totalPages > 1 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
    </div>
  );
}
