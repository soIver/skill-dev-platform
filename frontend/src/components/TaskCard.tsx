import { CheckCircle2, XCircle } from "lucide-react";

import type { TaskPublicItem } from "../hooks/useTasksStore";

interface TaskCardProps {
  task: TaskPublicItem;
  onClick: (taskId: number) => void;
}

const DESCRIPTION_PREVIEW_MAX = 150;

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_PREVIEW_MAX) return text;
  return text.slice(0, DESCRIPTION_PREVIEW_MAX) + "...";
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <div
      onClick={() => onClick(task.id)}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-2 hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-center gap-2 min-w-0">
        <p className="font-semibold text-gray-900 truncate" title={task.title}>
          {task.title}
        </p>
        {task.attached_repo_name && (
          <CheckCircle2 className="w-4.5 h-4.5 text-success shrink-0" />
        )}
        {task.latest_attempt && !task.latest_attempt.successful && (
          <XCircle className="w-4.5 h-4.5 text-danger shrink-0" />
        )}
      </div>

      <p className="text-sm text-gray-500 leading-relaxed">
        {truncateDescription(task.description_preview)}
      </p>

      <div className="flex flex-wrap gap-1.5 mt-1">
        {task.skills.slice(0, 5).map((skill, index) => (
          <span key={index} className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded-md text-[10px] font-bold uppercase tracking-wider">
            {skill.skill_name} — {skill.level_name}
          </span>
        ))}
        {task.skills.length > 5 && (
          <span className="px-2 py-0.5 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
            +{task.skills.length - 5}
          </span>
        )}
      </div>
    </div>
  );
}
