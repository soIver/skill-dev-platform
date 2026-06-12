import { useRef, useState, type KeyboardEvent } from "react";
import { authJson } from "../../auth";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { BentoSearch } from "../../components/BentoSearch";
import { VacancyCard } from "../../components/VacancyCard";
import { LoadingText } from "../../components/LoadingText";
import { Pagination } from "../../components/Pagination";
import { RangeSlider } from "../../components/RangeSlider";
import { useVacanciesStore, type VacancyAreaItem, type VacancySearchItem } from "../../hooks/useVacanciesStore";

interface VacancyAreasResponse {
  items: VacancyAreaItem[];
}

interface VacancyKeywordItem {
  id: string;
  text: string;
}

interface VacancyKeywordResponse {
  items: VacancyKeywordItem[];
}

interface VacancySearchResponse {
  items: VacancySearchItem[];
  found: number;
}

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
    salaryTo,
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
  const searchButtonRef = useRef<HTMLButtonElement>(null);

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
          salary_range: (salaryFrom > 0 || salaryTo < 1000000) ? {
            currency: "RUR",
            frequency: { id: "MONTHLY" },
            from: salaryFrom > 0 ? salaryFrom : null,
            gross: false,
            mode: { id: "MONTH" },
            to: salaryTo < 1000000 ? salaryTo : null
          } : null,
          area_ids: selectedAreas.map((area) => area.id),
          experience,
          schedule,
          education,
          accredited_it_employer: accreditedItEmployer,
          less_than_10_negotiations: lessThan10Negotiations,
          only_with_salary: onlyWithSalary,
          page: page - 1, // hh.ru ожидает 0-индексацию страницы
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

  const handleKeywordSearch = async (query: string): Promise<VacancyKeywordItem[]> => {
    try {
      const response = await authJson<VacancyKeywordResponse>(
        `/vacancies/keywords?q=${encodeURIComponent(query)}`
      );
      return response.items;
    } catch (error) {
      console.error("Failed to search vacancy keywords", error);
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
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Должность, ключевые слова
              </label>
              <div className="flex gap-3">
                <AutocompleteSearch<VacancyKeywordItem>
                  onSearch={handleKeywordSearch}
                  onSelect={(item) => setFilters({ description: item.text })}
                  onSelectCustom={(value) => setFilters({ description: value })}
                  onInputChange={(value) => setFilters({ description: value })}
                  itemToString={(item) => item.text}
                  debounceMs={300}
                  hideButton={true}
                  className="flex-1 ml-0!"
                  value={description}
                  onKeyDown={handleInputKeyDown}
                  showClearButton={true}
                  nextFocusRef={searchButtonRef}
                />
                <button
                  ref={searchButtonRef}
                  onClick={() => void handleSearch(1)}
                  disabled={isSearching}
                  className="primary-button w-auto px-5 flex items-center justify-center"
                >
                  {isSearching ? <LoadingText text="Поиск..." /> : "Поиск"}
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
              <RangeSlider
                min={0}
                max={1000000}
                step={500}
                value={[salaryFrom, salaryTo]}
                onChange={([from, to]) => setFilters({ salaryFrom: from, salaryTo: to })}
                label="Уровень дохода в месяц"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Регионы
              </label>
              <div className="rounded-xl max-w-150 border border-gray-200 bg-gray-50/70 p-3">
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
                  placeholder="Название региона"
                  buttonText="Добавить"
                  debounceMs={300}
                  isSearchItemDisabled={isAreaDisabled}
                />
              </div>
            </div>

            {/* сетка чекбоксов для фильтров */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-3">
                {/* ряд 1 - Опыт работы */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <span className="block text-sm font-semibold text-gray-800 mb-2">Опыт работы</span>
                  <div>
                    <RangeSlider
                      min={0}
                      max={4}
                      step={1}
                      value={(() => {
                        if (experience.length === 0) return [0, 4];
                        const experienceValues = ["noExperience", "between1And3", "between3And6", "moreThan6"];
                        const indices = experience.map((val) => experienceValues.indexOf(val)).filter((i) => i !== -1);
                        if (indices.length === 0) return [0, 4];
                        return [Math.min(...indices), Math.max(...indices) + 1] as [number, number];
                      })()}
                      onChange={([left, right]) => {
                        if (left === 0 && right === 4) {
                          setFilters({ experience: [] });
                          return;
                        }
                        const experienceValues = ["noExperience", "between1And3", "between3And6", "moreThan6"];
                        const newExp = [];
                        for (let i = left; i < right; i++) {
                          newExp.push(experienceValues[i]);
                        }
                        setFilters({ experience: newExp });
                      }}
                      formatLabel={(val, type) => {
                        if (type === "min") {
                          switch (val) {
                            case 1: return "от 1 года";
                            case 2: return "от 3 лет";
                            case 3: return "от 6 лет";
                            default: return null;
                          }
                        } else {
                          switch (val) {
                            case 1: return "без опыта";
                            case 2: return "до 3 лет";
                            case 3: return "до 6 лет";
                            default: return null;
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <span className="block text-sm font-semibold text-gray-800 mb-3">Дополнительно</span>
                  <div className="flex flex-col gap-2.5">
                    <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyWithSalary}
                        onChange={() => setFilters({ onlyWithSalary: !onlyWithSalary })}
                        className="checkbox-field mt-0.5"
                      />
                      <span>Указан доход</span>
                    </label>
                    <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={accreditedItEmployer}
                        onChange={() => setFilters({ accreditedItEmployer: !accreditedItEmployer })}
                        className="checkbox-field mt-0.5"
                      />
                      <span>От аккредитованных ИТ-компаний</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* ряд 1 - Образование */}
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
                          className="checkbox-field mt-0.5"
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
              <LoadingText text="Идёт поиск вакансий..." />
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
