import { TabTracker } from "../../components/TabTracker";

export default function Content() {
  const tabs = [
    { to: "classifier", label: "Классификатор" },
    { to: "skills", label: "Навыки" },
    { to: "tasks", label: "Задания" },
    { to: "tests", label: "Тесты" },
  ];

  return <TabTracker section="content" tabs={tabs} />;
}
