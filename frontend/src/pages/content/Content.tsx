import { TabTracker } from "../../components/TabTracker";

export default function Content() {
  const tabs = [
    { to: "tests", label: "Тесты" },
    { to: "skills", label: "Навыки" },
    { to: "tasks", label: "Задачи" },
  ];

  return <TabTracker section="content" tabs={tabs} />;
}
