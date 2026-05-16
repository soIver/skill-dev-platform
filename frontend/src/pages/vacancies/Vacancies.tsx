import { TabTracker } from "../../components/TabTracker";

export default function Vacancies() {
  const tabs = [
    { to: "matching", label: "Поиск вакансий" },
    { to: "analysis", label: "Анализ вакансии" },
  ];

  return <TabTracker section="vacancies" tabs={tabs} />;
}
