import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login } from "../auth";
import { useToast } from "../components/ToastProvider";
import GitHubIcon from "../assets/icons/github.svg?react";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await login({ identifier, password });
      showToast({
        title: "Вход выполнен",
        message: "Вы успешно вошли в аккаунт.",
        variant: "success",
      });
      navigate("/profile");
    } catch (error: unknown) {
      console.error(error);
      showToast({
        title: "Ошибка входа",
        message:
          error instanceof Error && error.message
            ? error.message
            : "При авторизации произошла ошибка на сервере.",
        variant: "error",
      });
    }
  };

  const handleGitHubLogin = async () => {
    try {
      const response = await fetch("/api/github/login-url");
      if (!response.ok) throw new Error("Failed to fetch login URL");
      const data = await response.json();
      window.location.assign(data.authorization_url);
    } catch (error) {
      showToast({
        title: "Ошибка GitHub",
        message: "Не удалось начать авторизацию GitHub.",
        variant: "error",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Вход</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Электронная почта или имя пользователя
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Ваш пароль"
              required
            />
          </div>

          <button type="submit" className="primary-button mt-5">
            Войти
          </button>
        </form>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-400"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-600">или</span>
          </div>
        </div>

        <button
          onClick={handleGitHubLogin}
          type="button"
          className="github-connect-button justify-center"
        >
          <GitHubIcon className="w-7 h-7" />
          <span className="font-medium">Войти через GitHub</span>
        </button>

        <div className="mt-4 text-center text-sm text-gray-600">
          Нет аккаунта?{" "}
          <Link to="/auth/registration" className="hyperlink">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
