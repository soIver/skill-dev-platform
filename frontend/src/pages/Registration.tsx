import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../auth";

export default function Registration() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const navigate = useNavigate();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== repeatPassword) {
      alert("Пароли не совпадают!");
      return;
    }

    try {
      await register({ email, password });
      navigate("/profile");
    } catch (error: unknown) {
      console.error(error);

      const message =
        error instanceof Error ? error.message : "Что-то пошло не так";

      alert(message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Регистрация</h1>

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
