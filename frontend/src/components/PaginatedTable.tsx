import React, { useCallback, useEffect, useRef, useState } from "react";
import { ITEMS_PER_TABLE_PAGE } from "../config";
import { LoadingText } from "./LoadingText";
import { Pagination } from "./Pagination";
import {
  deletePaginatedTableCache,
  getPaginatedTableCache,
  getPaginatedTableCacheEpoch,
  setPaginatedTableCache,
  type PaginatedTableCache,
} from "./paginatedTableCache";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
  showProgressBar?: boolean;
}

export interface PaginatedPage<T> {
  items: T[];
  totalPages: number;
}

interface PaginatedTableProps<T> {
  columns: Column<T>[];
  data?: T[];
  isLoading?: boolean;
  emptyMessage: React.ReactNode;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (item: T) => void;
  itemsPerPage?: number;
  useClientSlice?: boolean;
  getRowClassName?: (item: T) => string;
  loadPage?: (page: number, limit: number) => Promise<PaginatedPage<T>>;
  cacheKey?: string;
  queryKey?: string;
  refreshKey?: string | number;
  debounceMs?: number;
  resolveItem?: (item: T) => T;
}

export function PaginatedTable<T extends { id: number | string }>({
  columns,
  data = [],
  isLoading = false,
  emptyMessage,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onRowClick,
  itemsPerPage = ITEMS_PER_TABLE_PAGE.DEFAULT,
  useClientSlice,
  getRowClassName,
  loadPage,
  cacheKey,
  queryKey = "",
  refreshKey = "",
  debounceMs = 0,
  resolveItem,
}: PaginatedTableProps<T>) {
  const isServerPaginated = loadPage !== undefined;
  const initialCacheRef = useRef<PaginatedTableCache | null | undefined>(undefined);
  if (initialCacheRef.current === undefined) {
    const cached = cacheKey ? getPaginatedTableCache(cacheKey) : undefined;
    initialCacheRef.current = cached
      && cached.queryKey === queryKey
      && cached.itemsPerPage === itemsPerPage
      ? cached
      : null;
  }
  const initialCache = initialCacheRef.current;
  const loadPageRef = useRef(loadPage);
  const cacheRef = useRef<Map<number, T[]>>(
    new Map(initialCache?.pages as Map<number, T[]> | undefined),
  );
  const pendingPagesRef = useRef<Set<number>>(new Set());
  const generationRef = useRef(0);
  const managedCurrentPageRef = useRef(initialCache?.currentPage ?? 1);
  const managedTotalPagesRef = useRef(initialCache?.totalPages ?? 1);
  const activeCacheKeyRef = useRef(cacheKey);
  const activeQueryRef = useRef(queryKey);
  const previousRefreshKeyRef = useRef(refreshKey);
  const hasInitializedRef = useRef(false);
  const [managedPages, setManagedPages] = useState<Map<number, T[]>>(
    new Map(cacheRef.current),
  );
  const [managedCurrentPage, setManagedCurrentPage] = useState(initialCache?.currentPage ?? 1);
  const [managedTotalPages, setManagedTotalPages] = useState(initialCache?.totalPages ?? 1);
  const [managedIsLoading, setManagedIsLoading] = useState(
    isServerPaginated && !cacheRef.current.has(initialCache?.currentPage ?? 1),
  );

  useEffect(() => {
    loadPageRef.current = loadPage;
  }, [loadPage]);

  const persistManagedCache = useCallback(() => {
    if (!cacheKey) return;

    setPaginatedTableCache(cacheKey, {
      queryKey,
      itemsPerPage,
      pages: new Map(cacheRef.current) as Map<number, unknown[]>,
      currentPage: managedCurrentPageRef.current,
      totalPages: managedTotalPagesRef.current,
    });
  }, [cacheKey, itemsPerPage, queryKey]);

  const loadManagedPage = useCallback(async (
    page: number,
    generation: number,
    updateTotalPages: boolean,
  ): Promise<PaginatedPage<T> | null> => {
    const loader = loadPageRef.current;
    if (!loader || cacheRef.current.has(page) || pendingPagesRef.current.has(page)) {
      return null;
    }

    const pendingPages = pendingPagesRef.current;
    const cacheEpoch = getPaginatedTableCacheEpoch();
    pendingPages.add(page);
    if (page === managedCurrentPageRef.current) {
      setManagedIsLoading(true);
    }

    try {
      const result = await loader(page, itemsPerPage);
      if (
        generationRef.current !== generation
        || getPaginatedTableCacheEpoch() !== cacheEpoch
      ) {
        return null;
      }

      cacheRef.current.set(page, result.items);
      setManagedPages(new Map(cacheRef.current));
      if (updateTotalPages) {
        const nextTotalPages = Math.max(1, result.totalPages);
        managedTotalPagesRef.current = nextTotalPages;
        setManagedTotalPages(nextTotalPages);
      }
      persistManagedCache();
      return result;
    } catch (error) {
      console.error("Failed to load paginated table page", error);
      return null;
    } finally {
      pendingPages.delete(page);
      if (generationRef.current === generation && page === managedCurrentPageRef.current) {
        setManagedIsLoading(false);
      }
    }
  }, [itemsPerPage, persistManagedCache]);

  useEffect(() => {
    if (!isServerPaginated) return;

    const cacheKeyChanged = activeCacheKeyRef.current !== cacheKey;
    const queryChanged = activeQueryRef.current !== queryKey;
    const refreshRequested = hasInitializedRef.current
      && previousRefreshKeyRef.current !== refreshKey;
    activeCacheKeyRef.current = cacheKey;
    activeQueryRef.current = queryKey;
    previousRefreshKeyRef.current = refreshKey;
    hasInitializedRef.current = true;

    if (cacheKeyChanged || queryChanged || refreshRequested) {
      generationRef.current += 1;
      cacheRef.current = new Map();
      pendingPagesRef.current = new Set();
      managedCurrentPageRef.current = 1;
      managedTotalPagesRef.current = 1;
      setManagedPages(new Map());
      setManagedCurrentPage(1);
      setManagedTotalPages(1);
      if (cacheKey) deletePaginatedTableCache(cacheKey);
    }

    if (cacheRef.current.has(1)) {
      setManagedIsLoading(false);
      return;
    }

    const generation = generationRef.current;
    setManagedIsLoading(true);

    const timer = window.setTimeout(() => {
      void loadManagedPage(1, generation, true).then((firstPage) => {
        if (firstPage && firstPage.totalPages > 1) {
          void loadManagedPage(2, generation, false);
        }
      });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [cacheKey, debounceMs, isServerPaginated, loadManagedPage, queryKey, refreshKey]);

  useEffect(() => {
    if (!isServerPaginated || managedCurrentPage >= managedTotalPages) return;
    void loadManagedPage(managedCurrentPage + 1, generationRef.current, false);
  }, [isServerPaginated, loadManagedPage, managedCurrentPage, managedTotalPages]);

  // локальный срез используется только для полностью загруженных клиентских массивов
  const shouldSlice = useClientSlice ?? false;
  const effectiveCurrentPage = isServerPaginated ? managedCurrentPage : currentPage;
  const effectiveTotalPages = isServerPaginated ? managedTotalPages : totalPages;
  const effectiveIsLoading = isLoading || (isServerPaginated && managedIsLoading);
  const rawCurrentData = isServerPaginated
    ? managedPages.get(managedCurrentPage) ?? []
    : shouldSlice
      ? data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
      : data;
  const currentData = resolveItem ? rawCurrentData.map(resolveItem) : rawCurrentData;

  const handlePageChange = (page: number) => {
    if (!isServerPaginated) {
      onPageChange?.(page);
      return;
    }

    if (page < 1 || page > managedTotalPages) return;
    managedCurrentPageRef.current = page;
    setManagedCurrentPage(page);
    setManagedIsLoading(!cacheRef.current.has(page));
    persistManagedCache();
    if (!cacheRef.current.has(page)) {
      void loadManagedPage(page, generationRef.current, false);
    }
    onPageChange?.(page);
  };

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
                  className={`transition-colors ${getRowClassName?.(item) ?? ""} ${onRowClick ? "cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50"}`}
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
                  {effectiveIsLoading ? <LoadingText text="Поиск..." /> : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={effectiveCurrentPage}
        totalPages={effectiveTotalPages}
        onPageChange={handlePageChange}
        onPreloadNext={isServerPaginated ? () => {
          if (effectiveCurrentPage < effectiveTotalPages) {
            void loadManagedPage(effectiveCurrentPage + 1, generationRef.current, false);
          }
        } : undefined}
        className={`mt-4 transition-opacity duration-300 ${effectiveTotalPages > 1 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
    </div>
  );
}
