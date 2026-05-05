import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Profile() {
  const tabs = [
    { to: "skills", label: "Навыки и рекомендации" },
    { to: "credentials", label: "Учётные данные" },
  ];

  return (
    <div className="mx-auto min-w-fit" style={{ maxWidth: '90%' }}>
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
