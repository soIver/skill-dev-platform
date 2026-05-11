import { TabTracker } from "../../components/TabTracker";

export default function Admin() {
  const tabs = [
    { to: "management", label: "Управление" },
    { to: "statistics", label: "Статистика" },
  ];

  return <TabTracker section="admin" tabs={tabs} />;
}
