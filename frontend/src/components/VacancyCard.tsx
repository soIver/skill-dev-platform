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

      <p className="mt-3 text-sm text-gray-600 flex items-center gap-1">
        <span>Работодатель: {vacancy.employer_name}</span>
        {vacancy.accredited_it_employer && (
          <span
            className="inline-flex items-center text-blue-500 cursor-help"
            title="Аккредитованная ИТ-компания"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
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
