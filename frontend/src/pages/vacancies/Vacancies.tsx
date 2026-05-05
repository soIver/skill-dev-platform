import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Vacancies() {
  const tabs = [
    { to: "matching", label: "Подбор вакансий" },
    { to: "analysis", label: "Анализ вакансии" },
  ];

  return (
    <div className="mx-auto min-w-fit" style={{ maxWidth: '90%' }}>
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
