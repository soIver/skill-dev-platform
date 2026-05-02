import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Admin() {
  const tabs = [
    { to: "management", label: "Управление" },
    { to: "statistics", label: "Статистика" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
