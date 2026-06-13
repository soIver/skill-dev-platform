import { TabTracker } from "../../components/TabTracker";

export default function My() {
  const tabs = [
    { to: "profile", label: "Профиль" },
    { to: "repositories", label: "Репозитории" },
    { to: "credentials", label: "Учётные данные" },
  ];

  return <TabTracker section="profile" tabs={tabs} />;
}
