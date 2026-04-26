import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login } from "../auth";
import { useToast } from "../components/ToastProvider";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await login({ email, password });
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

  const handleGitHubLogin = () => {
    console.log("Вход через GitHub");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Вход</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Электронная почта
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          className="primary-button bg-gray-800"
        >
          Войти через GitHub
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
