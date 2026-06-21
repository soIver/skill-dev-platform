import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUserStore } from "../hooks/useUserStore";

import ProfileIcon from "../assets/icons/profile.svg?react";
import RecommendationsIcon from "../assets/icons/recomendations.svg?react";
import TasksIcon from "../assets/icons/tasks.svg?react";
import TestsIcon from "../assets/icons/tests.svg?react";
import VacanciesIcon from "../assets/icons/vacancies.svg?react";
import ContentIcon from "../assets/icons/content.svg?react";
import ManagementIcon from "../assets/icons/management.svg?react";
import ArrowToggle from "../assets/icons/arrow-toggle.svg?react";
import IsdLogo from "../assets/icons/isd-logo.svg?react";
import IsdLogoWide from "../assets/icons/isd-logo-wide.svg?react";

const NAV_WIDTH = {
  expanded: "w-68",
  collapsed: "w-26",
};

export default function VerNavBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useLocation();
  const user = useUserStore((state) => state.user);

  if (!user) return null;

  return (
    <aside
      className={`ver-nav-bar ${isExpanded ? NAV_WIDTH.expanded : NAV_WIDTH.collapsed}`}
    >
      {/* лого */}
      <div className="h-20 flex items-center px-6 overflow-hidden">
        <IsdLogo
          className={`shrink-0 transition-all duration-300 ${isExpanded ? "w-0 opacity-0" : "w-15 h-15 opacity-100"
            }`}
        />
        <IsdLogoWide
          className={`shrink-0 transition-all ${isExpanded
            ? "w-[180px] h-[50px] opacity-100 duration-200"
            : "w-0 h-[50px] opacity-0 duration-200"
            }`}
        />
      </div>

      {/* область навигации */}
      <nav className="flex-1 pe-2 py-4 space-y-3">
        <VerNavItem
          to="/account"
          icon={ProfileIcon}
          label="Аккаунт"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/account")}
        />
        <VerNavItem
          to="/progress"
          icon={RecommendationsIcon}
          label="Прогресс"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/progress")}
        />
        <VerNavItem
          to="/tasks"
          icon={TasksIcon}
          label="Задания"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/tasks")}
        />
        <VerNavItem
          to="/tests"
          icon={TestsIcon}
          label="Тесты"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/tests")}
        />
        <VerNavItem
          to="/vacancies"
          icon={VacanciesIcon}
          label="Вакансии"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/vacancies")}
        />
        {(user.role === "curator" || user.role === "admin") && (
          <VerNavItem
            to="/content"
            icon={ContentIcon}
            label="Контент"
            isExpanded={isExpanded}
            isActive={location.pathname.startsWith("/content")}
          />
        )}
        {user.role === "admin" && (
          <>
            <VerNavItem
              to="/management"
              icon={ManagementIcon}
              label="Управление"
              isExpanded={isExpanded}
              isActive={location.pathname.startsWith("/management")}
            />
          </>
        )}
      </nav>

      {/* переключение состояния панели */}
      <div className="relative h-12 mx-3 mb-3">
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="absolute top-0 h-12 w-12 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-300"
          style={{
            left: isExpanded ? "calc(100% - 3rem)" : "calc(50% - 1.5rem)",
          }}
        >
          <ArrowToggle
            className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""
              }`}
          />
        </button>
      </div>
    </aside>
  );
}

/* элемент панели (ссылка на страницу раздела) */
function VerNavItem({
  to,
  icon: Icon,
  label,
  isExpanded,
  isActive,
}: {
  to: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  isExpanded: boolean;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex font-medium items-center h-12 px-3 rounded-e-xl transition-all
        ${isActive ? "bg-blue-50 text-primary-hover" : "text-gray-700 hover:bg-gray-100"}`}
    >
      {/* иконка раздела */}
      <div className="w-11 min-w-11 ml-3 flex items-center justify-center">
        <Icon className="w-9 h-9" />
      </div>

      {/* название раздела */}
      <div
        className={`text-md overflow-hidden transition-all duration-300${isExpanded ? "max-w-[200px] opacity-100 ml-2" : "max-w-0 opacity-0"
          }`}
      >
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </Link>
  );
}
