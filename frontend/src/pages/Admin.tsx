import { Outlet } from "react-router-dom";
import HorNavBar from "../components/HorNavBar";

export default function Admin() {
  const tabs = [
    { to: "skills", label: "Навыки" },
    { to: "recommendations", label: "Рекомендации" },
    { to: "users", label: "Пользователи" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
