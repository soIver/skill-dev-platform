import { useEffect } from "react";
import { useLocation, Navigate, Outlet } from "react-router-dom";
import HorNavBar from "./HorNavBar";
import { useUserStore } from "../hooks/useUserStore";

interface Tab {
  to: string;
  label: string;
}

interface TabTrackerProps {
  section: string;
  tabs: Tab[];
}

export function TabTracker({ section, tabs }: TabTrackerProps) {
  const location = useLocation();
  const { setActiveTab } = useUserStore();

  useEffect(() => {
    const pathParts = location.pathname.split("/");
    const subTab = pathParts[pathParts.length - 1];

    if (tabs.some(t => t.to === subTab)) {
      setActiveTab(section, subTab);
    }
  }, [location.pathname, section, tabs, setActiveTab]);

  return (
    <div className="mx-auto min-w-fit w-full flex-1 flex flex-col min-h-0" style={{ maxWidth: '95%' }}>
      <HorNavBar tabs={tabs} />
      <Outlet />
    </div>
  );
}

export function TabRedirect({ section, defaultTab }: { section: string, defaultTab: string }) {
  const activeTab = useUserStore((state) => state.activeTabs[section]);
  return <Navigate to={activeTab || defaultTab} replace />;
}
