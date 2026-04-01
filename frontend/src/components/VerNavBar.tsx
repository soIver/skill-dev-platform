import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUserStore } from "../hooks/useStore";

import ProfileIcon from "../assets/icons/profile.svg";
import ArrowToggle from "../assets/icons/arrow-toggle.svg";

const NAV_WIDTH = {
  expanded: "w-64",
  collapsed: "w-20",
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
      <div className="h-20 flex items-center px-6">
        <span
          className={`text-2xl font-bold transition-all ${
            isExpanded
              ? "ml-2 opacity-100 duration-400"
              : "opacity-0 duration-200"
          }`}
        >
          SkillDev
        </span>
      </div>

      {/* область навигации */}
      <nav className="flex-1 pe-2 py-4 space-y-2">
        <VerNavItem
          to="/profile"
          icon={ProfileIcon}
          label="Профиль"
          isExpanded={isExpanded}
          isActive={location.pathname.search("/profile") !== -1}
        />
      </nav>

      {/* переключение состояния панели */}
      <div className="p-3 flex justify-end">
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="h-12 w-12 flex items-center justify-center rounded-xl hover:bg-gray-100"
        >
          <ArrowToggle
            className={`w-5 h-5 transition-transform duration-300 ${
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
        ${isActive ? "bg-blue-50 text-primary-hover border border-gray-200" : "text-gray-700 hover:bg-gray-100"}`}
    >
      {/* иконка раздела */}
      <div className="w-10 min-w-10 flex items-center justify-center">
        <Icon className="w-7 h-7" />
      </div>

      {/* название раздела */}
      <div
        className={`text-lg overflow-hidden transition-all duration-300${
          isExpanded ? "max-w-[200px] opacity-100 ml-2" : "max-w-0 opacity-0"
        }`}
      >
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </Link>
  );
}
