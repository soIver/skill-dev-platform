import { useState, useEffect, useRef } from "react";
import { authJson } from "../../auth";
import { useContentStore, type ProficiencyItem } from "../../hooks/useContentStore";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";

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

      const response = await authJson<SearchResponse>(`/skills/proficiencies?${params.toString()}`);
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
      await authJson("/skills/proficiencies", {
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

  const columns: Column<ProficiencyItem>[] = [
    {
      key: "skill_name",
      header: "Название",
      align: "center",
      width: "w-1/3",
      render: (item) => <span className="text-gray-900">{item.skill_name}</span>,
    },
    {
      key: "level_name",
      header: "Уровень",
      align: "center",
      width: "w-1/3",
      render: (item) => (
        <span className="inline-block px-2 py-1 bg-gray-100 rounded-lg text-gray-800">
          {item.level_name}
        </span>
      ),
    },
    {
      key: "obtained_count",
      header: "Получен",
      align: "center",
      width: "w-1/3",
      render: (item) => <span className="text-gray-500">{item.obtained_count}</span>,
    },
  ];

  return (
    <div className="flex gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
      <div className="workspace-panel flex-1 flex flex-col h-full">
        <h2 className="workspace-panel-header mb-4">Список навыков</h2>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillsState({ skillInput: e.target.value })}
              className="input-field"
              placeholder="Поиск по названию"
            />
          </div>
          <div className="flex-1">
            < input
              type="text"
              value={levelInput}
              onChange={(e) => setSkillsState({ levelInput: e.target.value })}
              className="input-field"
              placeholder="Поиск по уровню"
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

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isSearching || isDebouncing}
          emptyMessage="Навыки не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
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
