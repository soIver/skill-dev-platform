import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { register, requestEmailConfirmation } from "../auth";
import FieldRequirements from "../components/FieldRequirements";
import { useToast } from "../components/ToastProvider";
import GitHubIcon from "../assets/icons/github.svg?react";
import { USERNAME_MAX_LENGTH, checkEmail, checkPassword, checkUsername } from "../validation";
import { flashField } from "../utils";

export default function Registration() {
  const [searchParams] = useSearchParams();
  const ghEmail = searchParams.get("gh_email") || "";
  const ghLogin = searchParams.get("gh_login") || "";
  const ghTokenEnc = searchParams.get("gh_token_enc") || "";
  const ghId = searchParams.get("gh_id") || "";
  const isGitHubRegistration = Boolean(ghEmail && ghTokenEnc && ghId);

  const [email, setEmail] = useState(ghEmail);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [username, setUsername] = useState(ghLogin);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [activeField, setActiveField] = useState<"username" | "email" | "password" | "repeatPassword" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = React.useRef<HTMLInputElement>(null);
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const repeatPasswordRef = React.useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const { showToast } = useToast();

  const emailChecks = checkEmail(email);
  const usernameChecks = checkUsername(username);
  const passwordChecks = checkPassword(password);
  const isEmailValid = emailChecks.valid;
  const isUsernameValid = Object.values(usernameChecks).every(Boolean);
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const handleGitHubLogin = async () => {
    try {
      const response = await fetch("/api/github/login-url");
      if (!response.ok) throw new Error("Failed to fetch login URL");
      const data = await response.json();
      window.location.assign(data.authorization_url);
    } catch {
      showToast({
        title: "Ошибка GitHub",
        message: "Не удалось начать авторизацию GitHub.",
        variant: "error",
      });
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEmailValid) {
      flashField(emailRef.current);
      showToast({
        title: "Ошибка регистрации",
        message: "Пожалуйста, укажите корректный адрес электронной почты.",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await requestEmailConfirmation(email);
      setConfirmedEmail(email);
    } catch (error) {
      showToast({
        title: "Ошибка регистрации",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось отправить письмо для подтверждения.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGitHubSubmit = async (e: React.FormEvent) => {
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

    setIsSubmitting(true);

    try {
      await register({
        username,
        email,
        password,
        github_token: ghTokenEnc,
        github_id: parseInt(ghId, 10),
      });
      showToast({
        title: "Регистрация завершена",
        message: "Аккаунт успешно создан.",
        variant: "success",
      });
      navigate("/profile");
    } catch (error) {
      showToast({
        title: "Ошибка регистрации",
        message:
          error instanceof Error && error.message
            ? error.message
            : "При регистрации произошла ошибка на сервере.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmedEmail) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <h1 className="auth-panel-header">Подтверждение адреса электронной почты</h1>
          <div className="space-y-6">
            <p className="text-base text-gray-900">
              На электронную почту {confirmedEmail} было отправлено письмо с инструкцией для подтверждения
            </p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Вход
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isGitHubRegistration) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <h1 className="auth-panel-header">Регистрация</h1>

          <form onSubmit={handleGitHubSubmit} className="space-y-4">
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
                maxLength={USERNAME_MAX_LENGTH}
                required
              />
              <FieldRequirements
                visible={activeField === "username"}
                requirements={[
                  { text: "От 4 до 16 символов", met: usernameChecks.length },
                  { text: "Только латиница, кириллица, символы \"-\" и \"_\"", met: usernameChecks.validChars },
                ]}
              />
            </div>

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
                disabled
              />
              <FieldRequirements
                visible={activeField === "email"}
                requirements={[
                  { text: "Корректный адрес электронной почты", met: emailChecks.valid },
                ]}
              />
            </div>

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

            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-button mt-4"
            >
              Зарегистрироваться
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Регистрация</h1>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
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
              className="input-field"
              placeholder="you@example.com"
              maxLength={64}
              required
            />
            <FieldRequirements
              visible={activeField === "email"}
              requirements={[
                { text: "Корректный адрес электронной почты", met: emailChecks.valid },
              ]}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="primary-button mt-4"
          >
            Зарегистрироваться
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
          Уже есть аккаунт?{" "}
          <Link to="/auth/login" className="hyperlink">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
