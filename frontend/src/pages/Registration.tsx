import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../auth";
import { useToast } from "../components/ToastProvider";

export default function Registration() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const navigate = useNavigate();
  const { showToast } = useToast();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== repeatPassword) {
      showToast({
        title: "Ошибка регистрации",
        message: "Пароли не совпадают.",
        variant: "error",
      });
      return;
    }

    try {
      await register({ username, email, password });
      showToast({
        title: "Регистрация завершена",
        message: "Аккаунт успешно создан.",
        variant: "success",
      });
      navigate("/profile");
    } catch (error: unknown) {
      console.error(error);
      showToast({
        title: "Ошибка регистрации",
        message:
          error instanceof Error && error.message
            ? error.message
            : "При регистрации произошла ошибка на сервере.",
        variant: "error",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Регистрация</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Имя пользователя
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="username"
              required
            />
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Повторите пароль
            </label>
            <input
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              className="input-field"
              placeholder="Ваш пароль ещё раз"
              required
            />
          </div>

          <button type="submit" className="primary-button mt-4">
            Зарегистрироваться
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-gray-600">
          Уже есть аккаунт?{" "}
          <Link to="/auth/login" className="hyperlink">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
