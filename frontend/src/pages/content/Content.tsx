import { TabTracker } from "../../components/TabTracker";

export default function Content() {
  const tabs = [
    { to: "tests", label: "Тесты" },
    { to: "skills", label: "Навыки" },
    { to: "recommendations", label: "Рекомендации" },
  ];

  return <TabTracker section="content" tabs={tabs} />;
}
