import AppRoutes from "./routes";
import AuthBootstrap from "./components/AuthBootstrap";
import ToastViewport from "./components/ToastViewport";
import VerNavBar from "./components/VerNavBar";
import { ToastProvider } from "./components/ToastProvider";

export default function Layout() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AuthBootstrap />
        <VerNavBar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-auto">
            <AppRoutes />
          </main>
        </div>
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
