import { Outlet } from "react-router-dom";
import HorNavBar from "../components/HorNavBar";

export default function Vacancies() {
  const tabs = [
    { to: "matching", label: "Подбор вакансий" },
    { to: "analysis", label: "Анализ вакансии" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
