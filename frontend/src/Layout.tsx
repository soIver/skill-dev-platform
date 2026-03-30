import AppRoutes from "./routes";
import VerNavBar from "./components/VerNavBar";

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <VerNavBar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto">
          <AppRoutes />
        </main>
      </div>
    </div>
  );
}
