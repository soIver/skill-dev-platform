import AppRoutes from "./routes";
import { useLocation } from "react-router-dom";

export default function Layout() {
  const location = useLocation(); // проверка текущего пути
  const isAuthPage = location.pathname.startsWith("/auth");

  return (
    <>
      {!isAuthPage && (
        <nav className="bg-blue-600 p-4 text-white">
          {/* { навигационная панель } */}
        </nav>
      )}
      <main>
        <AppRoutes />
      </main>
    </>
  );
}