import { TabTracker } from "../../components/TabTracker";

export default function Profile() {
  const tabs = [
    { to: "skills", label: "Навыки" },
    { to: "repositories", label: "Репозитории" },
    { to: "credentials", label: "Учётные данные" },
  ];

  return <TabTracker section="profile" tabs={tabs} />;
}
