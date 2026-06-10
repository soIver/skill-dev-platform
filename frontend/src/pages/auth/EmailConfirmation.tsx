import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

import { completeEmailRegistration } from "../../auth";
import { config } from "../../config";
import FieldRequirements from "../../components/FieldRequirements";
import { useToast } from "../../components/ToastProvider";
import { USERNAME_MAX_LENGTH, checkPassword, checkUsername } from "../../validation";
import { flashField } from "../../utils";

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string | { msg?: string }[]; message?: string };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload.detail) && payload.detail[0]?.msg) {
      return payload.detail[0].msg;
    }
    return payload.message || "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

export default function EmailConfirmation() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "success">("loading");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [activeField, setActiveField] = useState<"username" | "password" | "repeatPassword" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const repeatPasswordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const usernameChecks = checkUsername(username);
  const passwordChecks = checkPassword(password);
  const isUsernameValid = Object.values(usernameChecks).every(Boolean);
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  useEffect(() => {
    let cancelled = false;

    const verifyCode = async () => {
      if (!code) {
        setStatus("invalid");
        return;
      }

      try {
        const response = await fetch(
          `${config.apiBaseUrl}/auth/email-confirmation/verify?code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const data = (await response.json()) as { email: string };
        if (!cancelled) {
          setEmail(data.email);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("invalid");
        }
      }
    };

    void verifyCode();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isUsernameValid || !isPasswordValid) {
      if (!isUsernameValid) flashField(usernameRef.current);
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
      await completeEmailRegistration({
        code,
        username,
        email,
        password,
        repeat_password: repeatPassword,
      });
      setStatus("success");
    } catch (error) {
      showToast({
        title: "Ошибка регистрации",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось завершить регистрацию.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        {status === "success" ? (
          <div className="space-y-6 text-center">
            <h1 className="auth-panel-header text-center">Адрес почты успешно подтверждён!</h1>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" strokeWidth={1.8} />
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : (
          <>
            <h1 className="auth-panel-header">Регистрация</h1>

            {status === "loading" ? (
              <p className="text-base text-gray-900">Проверка кода...</p>
            ) : null}

            {status === "invalid" ? (
              <div className="space-y-4">
                <p className="text-base text-gray-900">Ссылка недействительна или срок её действия истёк.</p>
                <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
                  Войти
                </button>
              </div>
            ) : null}

            {status === "ready" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Электронная почта
                  </label>
                  <input
                    type="email"
                    value={email}
                    className="input-field disabled:bg-gray-100 disabled:text-gray-500"
                    maxLength={64}
                    disabled
                    required
                  />
                </div>

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
                  className="primary-button mt-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Завершить регистрацию
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
