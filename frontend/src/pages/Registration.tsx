import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { register } from "../auth";
import { useToast } from "../components/ToastProvider";
import FieldRequirements from "../components/FieldRequirements";
import { Eye, EyeOff } from "lucide-react";

const USERNAME_RE = /^[a-zA-Zа-яА-ЯёЁ_-]*$/;

// проверки имени пользователя
function checkUsername(v: string) {
  return {
    length: v.length >= 4 && v.length <= 32,
    validChars: v.length === 0 || USERNAME_RE.test(v),
  };
}

// проверки пароля
function checkPassword(v: string) {
  return {
    length: v.length >= 12 && v.length <= 32,
    hasDigit: /\d/.test(v),
    hasSpecial: /[^\p{L}\d]/u.test(v),
    hasMixedCaseLetters: /\p{Ll}/u.test(v) && /\p{Lu}/u.test(v),
  };
}

// проверки email
function checkEmail(v: string) {
  return {
    valid: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(v),
  };
}

// вспомогательная функция — добавляет класс анимации и убирает после её окончания
function flashField(el: HTMLInputElement | null) {
  if (!el) return;
  el.classList.remove("input-field-error");
  // читаем offsetWidth для принудительного reflow (сброс анимации)
  void el.offsetWidth;
  el.classList.add("input-field-error");
  el.addEventListener("animationend", () => el.classList.remove("input-field-error"), { once: true });
}

export default function Registration() {
  const [searchParams] = useSearchParams();
  const ghEmail = searchParams.get("gh_email") || "";
  const ghLogin = searchParams.get("gh_login") || "";
  const ghTokenEnc = searchParams.get("gh_token_enc") || "";
  const ghId = searchParams.get("gh_id") || "";

  const [username, setUsername] = useState(ghLogin);
  const [email, setEmail] = useState(ghEmail);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);

  // какое поле сейчас активно
  const [activeField, setActiveField] = useState<"username" | "email" | "password" | "repeatPassword" | null>(null);

  // refs для доступа к DOM-элементам инпутов
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const repeatPasswordRef = React.useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const { showToast } = useToast();

  const usernameChecks = checkUsername(username);
  const emailChecks = checkEmail(email);
  const passwordChecks = checkPassword(password);

  const isUsernameValid = Object.values(usernameChecks).every(Boolean);
  const isEmailValid = emailChecks.valid;
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isUsernameValid || !isEmailValid || !isPasswordValid) {
      if (!isUsernameValid) flashField(usernameRef.current);
      if (!isEmailValid) flashField(emailRef.current);
      if (!isPasswordValid) flashField(passwordRef.current);
      showToast({
        title: "Ошибка регистрации",
        message: "Пожалуйста, исправьте ошибки в форме.",
        variant: "error",
      });
      return;
    }

    if (password !== repeatPassword) {
      flashField(repeatPasswordRef.current);
      showToast({
        title: "Ошибка регистрации",
        message: "Пароли не совпадают.",
        variant: "error",
      });
      return;
    }

    try {
      await register({
        username,
        email,
        password,
        ...(ghTokenEnc ? { github_token: ghTokenEnc } : {}),
        ...(ghId ? { github_id: parseInt(ghId, 10) } : {}),
      });
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
    <div className="auth-screen">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Регистрация</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* имя пользователя */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Имя пользователя
            </label>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setActiveField("username")}
              onBlur={() => setActiveField(null)}
              className="input-field"
              placeholder="Как к Вам обращаться?"
              maxLength={64}
              required
            />
            <FieldRequirements
              visible={activeField === "username"}
              requirements={[
                { text: "От 4 до 32 символов", met: usernameChecks.length },
                { text: "Только латиница, кириллица, символы \"-\" и \"_\"", met: usernameChecks.validChars },
              ]}
            />
          </div>

          {/* электронная почта */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Электронная почта
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setActiveField("email")}
              onBlur={() => setActiveField(null)}
              className="input-field disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="you@example.com"
              maxLength={64}
              required
              disabled={!!ghEmail}
            />
            <FieldRequirements
              visible={activeField === "email"}
              requirements={[
                { text: "Корректный адрес электронной почты", met: emailChecks.valid },
              ]}
            />
          </div>

          {/* пароль */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Пароль
            </label>
            <div className="password-field-wrapper">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setActiveField("password")}
                onBlur={() => setActiveField(null)}
                className="input-field pr-10"
                placeholder="Ваш надёжный пароль"
                maxLength={64}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle-btn"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <FieldRequirements
              visible={activeField === "password"}
              requirements={[
                { text: "От 12 до 32 символов", met: passwordChecks.length },
                { text: "Минимум одна цифра", met: passwordChecks.hasDigit },
                { text: "Минимум один спецсимвол", met: passwordChecks.hasSpecial },
                { text: "Минимум две буквы в разных регистрах", met: passwordChecks.hasMixedCaseLetters },
              ]}
            />
          </div>

          {/* повторите пароль */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Повторите пароль
            </label>
            <div className="password-field-wrapper">
              <input
                ref={repeatPasswordRef}
                type={showRepeatPassword ? "text" : "password"}
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                onFocus={() => setActiveField("repeatPassword")}
                onBlur={() => setActiveField(null)}
                className="input-field pr-10"
                placeholder="Ваш надёжный пароль ещё раз"
                maxLength={64}
                required
              />
              <button
                type="button"
                onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                className="password-toggle-btn"
                tabIndex={-1}
              >
                {showRepeatPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <FieldRequirements
              visible={activeField === "repeatPassword"}
              requirements={[
                { text: "Пароли совпадают", met: password === repeatPassword && repeatPassword.length > 0 },
              ]}
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
