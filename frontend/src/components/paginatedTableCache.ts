export interface PaginatedTableCache {
  queryKey: string;
  itemsPerPage: number;
  pages: Map<number, unknown[]>;
  currentPage: number;
  totalPages: number;
}

const tableCaches = new Map<string, PaginatedTableCache>();
let cacheEpoch = 0;

export function getPaginatedTableCacheEpoch(): number {
  return cacheEpoch;
}

export function getPaginatedTableCache(cacheKey: string): PaginatedTableCache | undefined {
  return tableCaches.get(cacheKey);
}

export function setPaginatedTableCache(cacheKey: string, cache: PaginatedTableCache): void {
  tableCaches.set(cacheKey, cache);
}

export function deletePaginatedTableCache(cacheKey: string): void {
  tableCaches.delete(cacheKey);
}

export function clearPaginatedTableCaches(): void {
  tableCaches.clear();
  cacheEpoch += 1;
}
