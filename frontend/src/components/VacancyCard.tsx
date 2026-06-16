import type { ReactNode } from "react";

import type { VacancySearchItem } from "../hooks/useVacanciesStore";

interface VacancyCardProps {
  vacancy: VacancySearchItem;
  onAnalyze?: (vacancy: VacancySearchItem) => void;
}

interface VacancyInfoProps {
  vacancy: VacancySearchItem;
  titleAction?: ReactNode;
}

export function VacancyInfo({ vacancy, titleAction }: VacancyInfoProps) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 wrap-break-word text-lg font-semibold text-gray-900">
          {vacancy.title}
        </h3>
        {titleAction}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span className="font-medium text-gray-900 shrink-0">{vacancy.salary_text}</span>
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
    </>
  );
}

export function VacancyCard({ vacancy, onAnalyze }: VacancyCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm max-w-150">
      <VacancyInfo vacancy={vacancy} />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => window.open(vacancy.original_url, "_blank", "noopener,noreferrer")}
          disabled={!vacancy.original_url}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          Открыть оригинал
        </button>
        <button
          onClick={() => onAnalyze?.(vacancy)}
          disabled={!onAnalyze}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${
            onAnalyze
              ? "bg-primary hover:bg-primary-hover text-white transition-colors"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Анализировать
        </button>
      </div>
    </div>
  );
}
