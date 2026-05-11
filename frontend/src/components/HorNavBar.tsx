import { NavLink } from "react-router-dom";

interface Tab {
  to: string;
  label: string;
}

interface HorNavBarProps {
  tabs: Tab[];
}

export default function HorNavBar({ tabs }: HorNavBarProps) {
  return (
    <div className="hor-nav-bar">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `py-4 mx-5 text-lg font-medium transition-colors duration-200 border-b-2 flex-1 text-center ${isActive
              ? "border-primary-hover text-primary"
              : "border-transparent hover:text-gray-600"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
