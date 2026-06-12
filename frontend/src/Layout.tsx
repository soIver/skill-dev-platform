import { useLocation } from "react-router-dom";

import AppRoutes from "./routes";
import AuthBootstrap from "./components/AuthBootstrap";
import ToastViewport from "./components/ToastViewport";
import VerNavBar from "./components/VerNavBar";
import { ToastProvider } from "./components/ToastProvider";
import { useNotifications } from "./hooks/useNotifications";

function NotificationManager() {
  useNotifications();
  return null;
}

export default function Layout() {
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith("/auth");
  const isTestAttemptPage = location.pathname.startsWith("/tests/attempt/");

  return (
    <ToastProvider>
      <NotificationManager />
      <div className="flex min-h-screen bg-gray-50">
        <AuthBootstrap />
        {!isAuthPage && !isTestAttemptPage ? <VerNavBar /> : null}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-auto flex flex-col">
            <AppRoutes />
          </main>
        </div>
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
