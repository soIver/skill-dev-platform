import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Admin() {
  const tabs = [
    { to: "management", label: "Управление" },
    { to: "statistics", label: "Статистика" },
  ];

  return (
    <div className="mx-auto min-w-fit" style={{ maxWidth: '90%' }}>
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
