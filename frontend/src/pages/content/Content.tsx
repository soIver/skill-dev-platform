import { Outlet } from "react-router-dom";
import HorNavBar from "../../components/HorNavBar";

export default function Content() {
  const tabs = [
    { to: "tests", label: "Тесты" },
    { to: "skills", label: "Навыки" },
    { to: "recommendations", label: "Рекомендации" },
  ];

  return (
    <div className="mx-auto min-w-fit" style={{ maxWidth: '90%' }}>
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}
