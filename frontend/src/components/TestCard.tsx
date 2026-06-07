import { useMemo, useState } from "react";
import { Clock, ListChecks } from "lucide-react";

import { BentoSearch } from "./BentoSearch";
import type { TestPublicItem, TestPublicLevelItem } from "../hooks/useTestsStore";

interface TestCardProps {
  test: TestPublicItem;
  onClick: (test: TestPublicItem, level: TestPublicLevelItem) => void;
}

const DESCRIPTION_PREVIEW_MAX = 150;

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_PREVIEW_MAX) return text;
  return text.slice(0, DESCRIPTION_PREVIEW_MAX) + "...";
}

function getQuestionsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "вопросов";
  if (mod10 === 1) return "вопрос";
  if (mod10 >= 2 && mod10 <= 4) return "вопроса";
  return "вопросов";
}

function getMinutesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "минут";
  if (mod10 === 1) return "минута";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

export function TestCard({ test, onClick }: TestCardProps) {
  const [activeLevelId, setActiveLevelId] = useState<number | null>(test.levels[0]?.id ?? null);

  const activeLevel = useMemo(
    () => test.levels.find((level) => level.id === activeLevelId) ?? test.levels[0],
    [activeLevelId, test.levels],
  );

  if (!activeLevel) return null;

  const description = activeLevel.description_preview || "Описание теста пока не заполнено.";

  return (
    <div
      onClick={() => onClick(test, activeLevel)}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 truncate mb-2" title={test.skill_name}>
          {test.skill_name}
        </p>
        <div onClick={(event) => event.stopPropagation()}>
          <BentoSearch<TestPublicLevelItem, TestPublicLevelItem>
            items={test.levels}
            itemToString={(level) => level.level_name}
            itemToId={(level) => level.id}
            renderItem={(level) => level.level_name}
            activeItemId={activeLevel.id}
            reorderEnabled={false}
            closeable={false}
            customSelectLogic={false}
            onItemClick={(level) => setActiveLevelId(level.id)}
            onSearch={async () => []}
            onAdd={() => undefined}
            searchItemToString={(level) => level.level_name}
            hideSearch={true}
          />
        </div>
      </div>

      <p className="text-sm text-gray-500 leading-relaxed">
        {truncateDescription(description)}
      </p>

      <div className="flex flex-wrap gap-4 mt-1 text-xs font-semibold text-gray-500">
        <span className="flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-primary" />
          {activeLevel.question_count} {getQuestionsWord(activeLevel.question_count)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-primary" />
          {activeLevel.time_limit_minutes} {getMinutesWord(activeLevel.time_limit_minutes)}
        </span>
      </div>
    </div>
  );
}
