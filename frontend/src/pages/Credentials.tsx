import { useNavigate } from "react-router-dom";

import { logout } from "../auth";
import { useUserStore } from "../hooks/useStore";
import GitHubIcon from "../assets/icons/github.svg?react";

export default function Credentials() {
  const navigate = useNavigate();
  const user = useUserStore((state) => state.user);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error(err);
    }

    navigate("/auth/login");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="space-y-8">
        {/* Основные */}
        <div className="workspace-panel">
          <h2 className="workspace-panel-header">Основные</h2>

          <div className="space-y-6">
            <div className="flex items-center">
              <div>
                <p className="text-sm text-gray-500">Электронная почта</p>
                <p className="text-lg font-medium">{user?.email}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button className="primary-button flex-3">Сменить почту</button>
              <button className="primary-button flex-3">Сменить пароль</button>
              <button onClick={handleLogout} className="danger-button flex-2">
                Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="workspace-panel">
          <h2 className="workspace-panel-header">Интеграции</h2>
          <button className="flex items-center gap-3 px-6 py-4 border border-gray-200 hover:border-gray-300 rounded-2xl w-full transition-colors">
            <GitHubIcon className="w-6 h-6" />
            <span className="font-medium">Подключить GitHub</span>
          </button>
        </div>
      </div>
    </div>
  );
}
