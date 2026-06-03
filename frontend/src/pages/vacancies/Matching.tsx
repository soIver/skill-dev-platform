import { useState, type KeyboardEvent } from "react";
import { authJson } from "../../auth";
import { BentoSearch } from "../../components/BentoSearch";
import { VacancyCard } from "../../components/VacancyCard";
import { Pagination } from "../../components/Pagination";
import { useVacanciesStore, type VacancyAreaItem, type VacancySearchItem } from "../../hooks/useVacanciesStore";

interface VacancyAreasResponse {
  items: VacancyAreaItem[];
}

interface VacancySearchResponse {
  items: VacancySearchItem[];
  found: number;
}

const EXPERIENCE_OPTIONS = [
  { value: "noExperience", label: "Нет опыта" },
  { value: "between1And3", label: "От 1 года до 3 лет" },
  { value: "between3And6", label: "От 3 до 6 лет" },
  { value: "moreThan6", label: "Более 6 лет" },
];
const EDUCATION_OPTIONS = [
  { value: "higher", label: "Высшее" },
  { value: "special_secondary", label: "Среднее профессиональное" },
  { value: "not_required_or_not_specified", label: "Не требуется или не указано" },
];

export default function VacancyMatching() {
  const {
    description,
    excludedWords,
    salaryFrom,
    experience,
    schedule,
    education,
    accreditedItEmployer,
    lessThan10Negotiations,
    onlyWithSalary,
    selectedAreas,
    results,
    found,
    currentPage,
    totalPages,
    hasSearched,
    setFilters,
    setResultsData,
    setCurrentPage,
    setHasSearched,
  } = useVacanciesStore();

  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (page: number = 1) => {
    setIsSearching(true);
    setHasSearched(true);
    setCurrentPage(page);
    try {
      const response = await authJson<VacancySearchResponse>("/vacancies/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          excluded_words: excludedWords,
          salary_from: salaryFrom ? Number(salaryFrom) : null,
          area_ids: selectedAreas.map((area) => area.id),
          experience,
          schedule,
          education,
          accredited_it_employer: accreditedItEmployer,
          less_than_10_negotiations: lessThan10Negotiations,
          only_with_salary: onlyWithSalary,
          page: page - 1, // hh.ru expects 0-indexed page
        }),
      });

      const computedTotalPages = Math.max(1, Math.ceil(response.found / 20));
      setResultsData(response.items, response.found, computedTotalPages);
    } catch (error) {
      console.error("Failed to search vacancies", error);
      setResultsData([], 0, 1);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      await handleSearch(newPage);
    }
  };

  const handleAreaSearch = async (query: string): Promise<VacancyAreaItem[]> => {
    try {
      const response = await authJson<VacancyAreasResponse>(
        `/vacancies/areas?q=${encodeURIComponent(query)}`
      );
      return response.items;
    } catch (error) {
      console.error("Failed to search areas", error);
      return [];
    }
  };

  const handleAddArea = (area: VacancyAreaItem) => {
    if (selectedAreas.some((selectedArea) => selectedArea.id === area.id)) {
      return;
    }
    setFilters({ selectedAreas: [...selectedAreas, area] });
  };

  const handleRemoveArea = (area: VacancyAreaItem) => {
    setFilters({ selectedAreas: selectedAreas.filter((item) => item.id !== area.id) });
  };

  const isAreaDisabled = (area: VacancyAreaItem) => selectedAreas.some((selectedArea) => selectedArea.id === area.id);

  const handleIntegerInputChange = (value: string) => {
    setFilters({ salaryFrom: value.replace(/[^\d]/g, "") });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Enter" && !isSearching) {
      void handleSearch(1);
    }
  };

  return (
    <div className="workspace-container">
      <div className="workspace-panel min-h-0 min-w-0 flex flex-col">
        <h2 className="workspace-panel-header">Фильтры поиска</h2>

        <div className="overflow-y-auto pr-2 flex-1 pl-1">
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Должность, ключевые слова
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={description}
                  onChange={(event) => setFilters({ description: event.target.value })}
                  onKeyDown={handleInputKeyDown}
                  className="input-field mt-0! flex-1"
                />
                <button
                  onClick={() => void handleSearch(1)}
                  disabled={isSearching}
                  className="primary-button w-auto px-5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? "Поиск..." : "Поиск"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Слова-исключения через запятую
              </label>
              <input
                type="text"
                value={excludedWords}
                onChange={(event) => setFilters({ excludedWords: event.target.value })}
                onKeyDown={handleInputKeyDown}
                className="input-field mt-0!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Минимальный уровень дохода
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  value={salaryFrom}
                  onChange={(event) => handleIntegerInputChange(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="input-field mt-0! w-full pr-12"
                />
                {salaryFrom && (
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 flex items-center pl-2 text-base select-none whitespace-pre">
                    <span className="text-transparent">{salaryFrom}</span>
                    <span className="text-gray-400">&nbsp;₽</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Регионы
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                <BentoSearch<VacancyAreaItem, VacancyAreaItem>
                  items={selectedAreas}
                  itemToString={(area) => area.name}
                  itemToId={(area) => area.id}
                  renderItem={(area) => (
                    <span className="block max-w-[16rem] truncate" title={area.full_name}>
                      {area.name}
                    </span>
                  )}
                  closeable={true}
                  onRemove={handleRemoveArea}
                  onSearch={handleAreaSearch}
                  onAdd={handleAddArea}
                  searchItemToString={(area) => area.name}
                  renderSearchItem={(area) => <span title={area.full_name}>{area.name}</span>}
                  placeholder="Регион"
                  buttonText="Добавить"
                  debounceMs={300}
                  isSearchItemDisabled={isAreaDisabled}
                />
              </div>
            </div>

            {/* Сетка чекбоксов для фильтров */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ряд 1 - Опыт работы */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <span className="block text-sm font-semibold text-gray-800 mb-3">Опыт работы</span>
                <div className="flex flex-col gap-2.5">
                  {EXPERIENCE_OPTIONS.map((opt) => {
                    const checked = experience.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newExp = checked
                              ? experience.filter((v) => v !== opt.value)
                              : [...experience, opt.value];
                            setFilters({ experience: newExp });
                          }}
                          className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary mt-0.5"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Ряд 1 - Образование */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <span className="block text-sm font-semibold text-gray-800 mb-3">Образование</span>
                <div className="flex flex-col gap-2.5">
                  {EDUCATION_OPTIONS.map((opt) => {
                    const checked = education.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newEdu = checked
                              ? education.filter((v) => v !== opt.value)
                              : [...education, opt.value];
                            setFilters({ education: newEdu });
                          }}
                          className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary mt-0.5"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="workspace-panel min-h-0 min-w-0 flex flex-col">
        <h2 className="workspace-panel-header">Результаты поиска</h2>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {!hasSearched ? (
            <div className="flex h-full min-h-40 items-center justify-center text-gray-400">
              Результаты поиска появятся здесь
            </div>
          ) : isSearching ? (
            <div className="flex h-full min-h-40 items-center justify-center text-gray-400">
              Идёт поиск вакансий...
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-full min-h-40 items-center justify-center text-gray-400">
              Вакансии не найдены
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                Найдено вакансий: {found}
              </p>

              {results.map((vacancy) => (
                <VacancyCard key={vacancy.id} vacancy={vacancy} />
              ))}
            </div>
          )}
        </div>

        {hasSearched && !isSearching && results.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            className="mt-4 pt-3 border-t border-gray-100 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
