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
    <div className="flex justify-around border rounded-b-2xl bg-white border-gray-300 mb-8">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-8 py-4 mx-20 text-lg font-medium transition-colors duration-200 border-b-2 flex-1 text-center ${
              isActive
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
