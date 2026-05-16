import { useEffect, useState, type KeyboardEvent } from "react";
import { authJson } from "../../auth";
import { BentoSearch } from "../../components/BentoSearch";

interface VacancyAreaItem {
  id: string;
  name: string;
  full_name: string;
}

interface VacancyAreasResponse {
  items: VacancyAreaItem[];
}

interface VacancySearchItem {
  id: string;
  title: string;
  salary_text: string;
  tags: string[];
  employer_name: string;
  original_url: string;
}

interface VacancySearchResponse {
  items: VacancySearchItem[];
  found: number;
}

const EXPERIENCE_OPTIONS = [
  { value: "", label: "Не имеет значения" },
  { value: "noExperience", label: "Нет опыта" },
  { value: "between1And3", label: "От 1 года до 3 лет" },
  { value: "between3And6", label: "От 3 до 6 лет" },
  { value: "moreThan6", label: "Более 6 лет" },
];

export default function VacancyMatching() {
  const [description, setDescription] = useState("");
  const [excludedWords, setExcludedWords] = useState("");
  const [salaryFrom, setSalaryFrom] = useState("");
  const [experience, setExperience] = useState("");
  const [areas, setAreas] = useState<VacancyAreaItem[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<VacancyAreaItem[]>([]);
  const [results, setResults] = useState<VacancySearchItem[]>([]);
  const [found, setFound] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAreasLoading, setIsAreasLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const loadAreas = async () => {
      setIsAreasLoading(true);
      try {
        const response = await authJson<VacancyAreasResponse>("/vacancies/areas");
        setAreas(response.items);
      } catch (error) {
        console.error("Failed to load vacancy areas", error);
      } finally {
        setIsAreasLoading(false);
      }
    };

    void loadAreas();
  }, []);

  const handleSearch = async () => {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await authJson<VacancySearchResponse>("/vacancies/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          excluded_words: excludedWords,
          salary_from: salaryFrom ? Number(salaryFrom) : null,
          area_ids: selectedAreas.map((area) => area.id),
          experience: experience || null,
        }),
      });

      setResults(response.items);
      setFound(response.found);
    } catch (error) {
      console.error("Failed to search vacancies", error);
      setResults([]);
      setFound(0);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAreaSearch = async (query: string): Promise<VacancyAreaItem[]> => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return areas.slice(0, 20);
    }

    return areas
      .filter((area) => area.full_name.toLowerCase().includes(normalizedQuery))
      .slice(0, 20);
  };

  const handleAddArea = (area: VacancyAreaItem) => {
    if (selectedAreas.some((selectedArea) => selectedArea.id === area.id)) {
      return;
    }
    setSelectedAreas((currentAreas) => [...currentAreas, area]);
  };

  const handleRemoveArea = (area: VacancyAreaItem) => {
    setSelectedAreas((currentAreas) => currentAreas.filter((item) => item.id !== area.id));
  };

  const isAreaDisabled = (area: VacancyAreaItem) => selectedAreas.some((selectedArea) => selectedArea.id === area.id);

  const handleIntegerInputChange = (value: string) => {
    setSalaryFrom(value.replace(/[^\d]/g, ""));
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Enter" && !isSearching) {
      void handleSearch();
    }
  };

  return (
    <div className="grid flex-1 min-h-0 gap-6 lg:grid-cols-2">
      <div className="workspace-panel min-h-0">
        <h2 className="workspace-panel-header">Фильтры поиска</h2>

        <div className="overflow-y-auto pr-2">
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Описание вакансии
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="input-field mt-0! flex-1"
                />
                <button
                  onClick={() => void handleSearch()}
                  disabled={isSearching}
                  className="primary-button w-auto px-5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? "Поиск..." : "Поиск"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Слова-исключения
              </label>
              <input
                type="text"
                value={excludedWords}
                onChange={(event) => setExcludedWords(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="input-field mt-0!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Минимальная заработная плата
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={salaryFrom}
                onChange={(event) => handleIntegerInputChange(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="input-field mt-0!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Регионы
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                <BentoSearch<VacancyAreaItem, VacancyAreaItem>
                  items={selectedAreas}
                  itemToString={(area) => area.full_name}
                  itemToId={(area) => area.id}
                  renderItem={(area) => (
                    <span className="block max-w-[16rem] truncate" title={area.full_name}>
                      {area.full_name}
                    </span>
                  )}
                  closeable={true}
                  onRemove={handleRemoveArea}
                  onSearch={handleAreaSearch}
                  onAdd={handleAddArea}
                  searchItemToString={(area) => area.full_name}
                  renderSearchItem={(area) => <span>{area.full_name}</span>}
                  placeholder={isAreasLoading ? "Загрузка регионов..." : "Регион"}
                  buttonText="Добавить"
                  debounceMs={0}
                  isSearchItemDisabled={isAreaDisabled}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимальный опыт работы в годах
              </label>
              <select
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="input-field mt-0!"
              >
                {EXPERIENCE_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="workspace-panel min-h-0">
        <h2 className="workspace-panel-header">Результаты поиска</h2>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {!hasSearched ? (
            <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
              Результаты поиска появятся здесь
            </div>
          ) : isSearching ? (
            <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
              Идёт поиск вакансий...
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
              Вакансии не найдены
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                Найдено вакансий: {found}
              </p>

              {results.map((vacancy) => (
                <div
                  key={vacancy.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-semibold text-gray-900">
                    {vacancy.title}
                  </h3>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{vacancy.salary_text}</span>
                    {vacancy.tags.map((tag) => (
                      <span
                        key={`${vacancy.id}-${tag}`}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <p className="mt-3 text-sm text-gray-600">
                    Работодатель: {vacancy.employer_name}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => window.open(vacancy.original_url, "_blank", "noopener,noreferrer")}
                      disabled={!vacancy.original_url}
                      className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Открыть оригинал
                    </button>
                    <button
                      disabled={true}
                      className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-500 cursor-not-allowed"
                    >
                      Анализировать
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
