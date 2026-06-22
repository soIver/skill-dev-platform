import { useContentStore } from "./hooks/useContentStore";
import { useManagementStore } from "./hooks/useManagementStore";
import { useRepositoriesStore } from "./hooks/useRepositoriesStore";
import { useTasksStore } from "./hooks/useTasksStore";
import { useTestsStore } from "./hooks/useTestsStore";
import { useVacanciesStore } from "./hooks/useVacanciesStore";
import { clearPaginatedTableCaches } from "./components/paginatedTableCache";

export function resetCachedStores(): void {
  clearPaginatedTableCaches();
  const contentStore = useContentStore.getState();

  contentStore.resetSkillsState();
  contentStore.resetTasksState();
  contentStore.resetTestsState();
  contentStore.resetClassifierState();
  useManagementStore.getState().resetManagementState();
  useRepositoriesStore.getState().resetState();
  useTasksStore.getState().resetSearchState();
  useTestsStore.getState().resetSearchState();
  useVacanciesStore.getState().resetState();
}
