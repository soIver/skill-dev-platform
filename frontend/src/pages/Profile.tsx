import { Outlet } from "react-router-dom";
import HorNavBar from "../components/HorNavBar";

export default function Profile() {
  const tabs = [
    { to: "skills", label: "Навыки и рекомендации" },
    { to: "credentials", label: "Учётные данные" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
