import { ArrowRight, X } from "lucide-react";

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
  onSkip: (item: RecommendationItem) => void;
  onOpen: (item: RecommendationItem) => void;
  isSkipping?: boolean;
}

function buildGoal(item: RecommendationItem): string {
  const firstFunction = item.ps_functions[0];
  const firstSkill = item.skill_levels[0];

  if (firstFunction) {
    return `С целью закрыть трудовую функцию ${firstFunction.code}`;
  }
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

export function RecommendationCard({ item, onSkip, onOpen, isSkipping = false }: RecommendationCardProps) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-semibold text-primary">{buildGoal(item)}</p>
        <h3 className="mt-1 text-lg font-bold text-gray-900">{buildMessage(item)}</h3>
      </div>

      {item.description && (
        <p className="mb-4 line-clamp-3 text-sm leading-6 text-gray-600">{item.description}</p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {item.skill_levels.slice(0, 3).map((skill) => (
          <span key={skill.id} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
            {skill.skill_name} - {skill.level_name}
          </span>
        ))}
        {item.ps_functions.slice(0, 3).map((func) => (
          <span key={func.id} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            ТФ {func.code}
          </span>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSkip(item)}
          disabled={isSkipping}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Пропустить
        </button>
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="primary-button flex flex-1 items-center justify-center gap-2"
        >
          {item.content_type === "test" ? "Перейти к тесту" : "Перейти к заданию"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
