import { ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";

export interface RecommendationSkillLevelItem {
  id: number;
  skill_name: string;
  level_name: string;
}

export interface RecommendationPsFunctionItem {
  id: number;
  code: number;
  name: string;
}

export interface RecommendationItem {
  id: string;
  content_type: "task" | "test";
  target_id: number;
  score: number;
  created_at: string;
  expires_at: string;
  title: string;
  description: string | null;
  skill_levels: RecommendationSkillLevelItem[];
  ps_functions: RecommendationPsFunctionItem[];
}

interface RecommendationCardProps {
  item: RecommendationItem;
  onSkip?: (item: RecommendationItem) => void;
  onOpen: (item: RecommendationItem) => void;
  isSkipping?: boolean;
  goal?: ReactNode;
}

function buildGoal(item: RecommendationItem): string {
  const firstSkill = item.skill_levels[0];

  if (firstSkill) {
    return `Для развития навыка ${firstSkill.skill_name}`;
  }
  return item.content_type === "test" ? "Чтобы закрепить теорию" : "Чтобы закрепить практику";
}

function buildMessage(item: RecommendationItem): string {
  const firstSkill = item.skill_levels[0];
  if (item.content_type === "test") {
    return firstSkill
      ? `пройдите тест уровня «${firstSkill.level_name}»`
      : "пройдите рекомендованный тест";
  }
  return `выполните задание «${item.title}»`;
}

export function RecommendationCard({ item, onSkip, onOpen, isSkipping = false, goal }: RecommendationCardProps) {
  const skillLevels = item.content_type === "test" ? [] : item.skill_levels.slice(0, 3);
  const hasMeta = skillLevels.length > 0;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm max-w-150">
      <div className="mb-4">
        <p className="font-semibold text-primary">{goal ?? buildGoal(item)}</p>
        <h3 className="mt-1 text-lg font-bold text-gray-900">{buildMessage(item)}</h3>
      </div>

      {item.description && (
        <p className="mb-4 line-clamp-3 text-sm leading-6 text-gray-600">{item.description}</p>
      )}

      {hasMeta && (
        <div className="mb-5 flex flex-wrap gap-2">
          {skillLevels.map((skill) => (
            <span key={skill.id} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              {skill.skill_name} - {skill.level_name}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        {onSkip && (
          <button
            type="button"
            onClick={() => onSkip(item)}
            disabled={isSkipping}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Пропустить
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="primary-button flex h-9 flex-1 items-center justify-center gap-2 px-3 text-sm"
        >
          {`Перейти к ${item.content_type === "test" ? "тесту" : "заданию"}`}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
