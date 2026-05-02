import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUserStore } from "../hooks/useStore";

import ProfileIcon from "../assets/icons/profile.svg?react";
import TestsIcon from "../assets/icons/tests.svg?react";
import VacanciesIcon from "../assets/icons/vacancies.svg?react";
import ContentIcon from "../assets/icons/content.svg?react";
import AdminIcon from "../assets/icons/admin.svg?react";
import ArrowToggle from "../assets/icons/arrow-toggle.svg?react";
import IsdLogo from "../assets/icons/isd-logo.svg?react";

const NAV_WIDTH = {
  expanded: "w-64",
  collapsed: "w-26",
};

export default function VerNavBar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const location = useLocation();
  const user = useUserStore((state) => state.user);

  if (!user) return null;

  return (
    <aside
      className={`bg-white border border-gray-300 h-screen flex flex-col transition-all duration-300
      ${isExpanded ? NAV_WIDTH.expanded : NAV_WIDTH.collapsed}`}
    >
      {/* лого */}
      <div className="h-20 flex items-center px-6 overflow-hidden">
        <IsdLogo
          className={`shrink-0 transition-all duration-300 ${
            isExpanded ? "w-0 opacity-0" : "w-15 h-15 opacity-100"
          }`}
        />
        <span
          className={`text-2xl font-bold whitespace-nowrap shrink-0 transition-all ${
            isExpanded
              ? "ml-2 opacity-100 duration-400"
              : "max-w-0 opacity-0 duration-200"
          }`}
        >
          IT-SKILL-DEV
        </span>
      </div>

      {/* область навигации */}
      <nav className="flex-1 pe-2 py-4 space-y-3">
        <VerNavItem
          to="/profile"
          icon={ProfileIcon}
          label="Профиль"
          isExpanded={isExpanded}
          isActive={location.pathname.startsWith("/profile")}
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
          <VerNavItem
            to="/admin"
            icon={AdminIcon}
            label="Администрирование"
            isExpanded={isExpanded}
            isActive={location.pathname.startsWith("/admin")}
          />
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
            className={`w-6 h-6 transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
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
        className={`text-md overflow-hidden transition-all duration-300${
          isExpanded ? "max-w-[200px] opacity-100 ml-2" : "max-w-0 opacity-0"
        }`}
      >
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </Link>
  );
}
