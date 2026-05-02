import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Content() {
  const tabs = [
    { to: "skills", label: "Навыки" },
    { to: "tests", label: "Тесты" },
    { to: "recommendations", label: "Рекомендации" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
