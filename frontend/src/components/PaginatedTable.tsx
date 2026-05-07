import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}

interface PaginatedTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  emptyMessage: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick?: (item: T) => void;
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
}: PaginatedTableProps<T>) {
  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 font-medium text-gray-700 ${
                    col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                  } ${col.width || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length > 0 ? (
              data.map((item) => (
                <tr 
                  key={item.id} 
                  className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50"}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 ${
                        col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {col.render ? col.render(item) : (item as any)[col.key]}
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

      <div
        className={`flex justify-center items-center gap-4 mt-4 transition-opacity duration-300 ${
          totalPages > 1 ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
        >
          ←
        </button>
        <span className="text-sm text-gray-600">
          Страница {currentPage} из {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
        >
          →
        </button>
      </div>
    </>
  );
}
