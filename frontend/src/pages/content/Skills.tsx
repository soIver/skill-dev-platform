import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { useContentStore, type ProficiencyItem } from "../../hooks/useContentStore";

interface SearchResponse {
  items: ProficiencyItem[];
  total_pages: number;
  current_page: number;
}

export default function SkillsAdmin() {
  const { skills, setSkillsState } = useContentStore();
  const { skillInput, levelInput, results, currentPage, totalPages, lastSearch } = skills;

  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProficiencies = async (skill: string, level: string, page: number) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (skill) params.append("skill", skill);
      if (level) params.append("level", level);

      const response = await authJson<SearchResponse>(`/proficiencies?${params.toString()}`);
      setSkillsState({
        results: response.items,
        totalPages: response.total_pages,
        currentPage: response.current_page,
        lastSearch: { skill, level, page }
      });
    } catch (error) {
      console.error("Failed to fetch proficiencies", error);
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
      // Avoid fetching if the current input exactly matches the last search
      if (
        skillInput === lastSearch.skill &&
        levelInput === lastSearch.level &&
        results.length > 0
      ) {
        setIsDebouncing(false);
        return;
      }
      fetchProficiencies(skillInput, levelInput, 1);
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [skillInput, levelInput]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchProficiencies(lastSearch.skill, lastSearch.level, newPage);
    }
  };

  const handleCreate = async () => {
    if (!skillInput || !levelInput) return;

    setIsCreating(true);
    try {
      await authJson("/proficiencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_name: skillInput,
          level_name: levelInput
        })
      });
      fetchProficiencies(skillInput, levelInput, 1);
    } catch (error) {
      console.error("Failed to create proficiency", error);
    } finally {
      setIsCreating(false);
    }
  };

  const hasExactMatch = results.some(
    (item) =>
      item.skill_name.toLowerCase() === skillInput.trim().toLowerCase() &&
      item.level_name.toLowerCase() === levelInput.trim().toLowerCase()
  );

  const canCreate = !isSearching && !isDebouncing && !isCreating && !hasExactMatch && skillInput.trim() !== "" && levelInput.trim() !== "";

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список навыков</h2>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Навык</label>
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillsState({ skillInput: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Уровень</label>
            <input
              type="text"
              value={levelInput}
              onChange={(e) => setSkillsState({ levelInput: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className={`primary-button ${!canCreate ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
              Создать
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 shadow-sm">
              <tr>
                <th className="py-3 px-4 font-medium text-gray-700 text-center w-1/3">Навык</th>
                <th className="py-3 px-4 font-medium text-gray-700 text-center w-1/3">Уровень</th>
                <th className="py-3 px-4 font-medium text-gray-700 text-center w-1/3">Получен</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {results.length > 0 ? (
                results.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-gray-900 text-center">{item.skill_name}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-1 bg-gray-100 rounded text-sm text-gray-800">
                        {item.level_name}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500">{item.obtained_count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-500">
                    {isSearching || isDebouncing ? "Поиск..." : "Навыки не найдены"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className={`flex justify-center items-center gap-4 mt-4 transition-opacity duration-300 ${totalPages > 1 ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
        >
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
          >
            ←
          </button>
          <span className="text-sm text-gray-600">
            Страница {currentPage} из {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-700"
          >
            →
          </button>
        </div>
      </div>

      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header">Редактор навыков</h2>
        <div className="flex-1 overflow-auto mt-4">
          <p className="text-gray-500">Выберите навык для редактирования...</p>
        </div>
      </div>
    </div>
  );
}
