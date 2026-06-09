import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

import { config } from "../../config";
import FieldRequirements from "../../components/FieldRequirements";
import { useToast } from "../../components/ToastProvider";
import { useUserStore } from "../../hooks/useUserStore";

function checkPassword(v: string) {
  return {
    length: v.length >= 12 && v.length <= 32,
    hasDigit: /\d/.test(v),
    hasSpecial: /[^\p{L}\d]/u.test(v),
    hasMixedCaseLetters: /\p{Ll}/u.test(v) && /\p{Lu}/u.test(v),
  };
}

function flashField(el: HTMLInputElement | null) {
  if (!el) return;
  el.classList.remove("input-field-error");
  void el.offsetWidth;
  el.classList.add("input-field-error");
  el.addEventListener("animationend", () => el.classList.remove("input-field-error"), { once: true });
}

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

export default function PasswordChange() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "success">("loading");
  const [successMessage, setSuccessMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [activeField, setActiveField] = useState<"newPassword" | "repeatPassword" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const repeatPasswordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const clearSession = useUserStore((state) => state.clearSession);
  const { showToast } = useToast();

  const passwordChecks = checkPassword(newPassword);
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
          `${config.apiBaseUrl}/auth/password-change/verify?code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        if (!cancelled) {
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

    if (!isPasswordValid) {
      flashField(newPasswordRef.current);
      showToast({
        title: "Ошибка смены пароля",
        message: "Пожалуйста, исправьте ошибки в форме.",
        variant: "error",
      });
      return;
    }

    if (newPassword !== repeatPassword) {
      flashField(repeatPasswordRef.current);
      showToast({
        title: "Ошибка смены пароля",
        message: "Пароли не совпадают.",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/password-change/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          code,
          current_password: currentPassword,
          new_password: newPassword,
          repeat_password: repeatPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const data = (await response.json()) as { message?: string };
      clearSession();
      setSuccessMessage(data.message || "Пароль успешно изменён!");
      setStatus("success");
    } catch (error) {
      showToast({
        title: "Ошибка смены пароля",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось сменить пароль.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPasswordInput = (
    value: string,
    onChange: (value: string) => void,
    isVisible: boolean,
    onToggle: () => void,
    placeholder: string,
    ref?: React.Ref<HTMLInputElement>,
    onFocus?: () => void,
    onBlur?: () => void,
  ) => (
    <div className="password-field-wrapper">
      <input
        ref={ref}
        type={isVisible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="input-field pr-10"
        placeholder={placeholder}
        maxLength={64}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        className="password-toggle-btn"
        tabIndex={-1}
      >
        {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Восстановление пароля</h1>

        {status === "loading" ? (
          <p className="text-sm text-gray-500">Проверка кода...</p>
        ) : null}

        {status === "invalid" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Ссылка недействительна или срок её действия истёк.</p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}

        {status === "success" ? (
          <div className="space-y-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" strokeWidth={1.8} />
            <p className="text-sm font-medium text-gray-700">{successMessage}</p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}

        {status === "ready" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Текущий пароль
              </label>
              {renderPasswordInput(
                currentPassword,
                setCurrentPassword,
                showCurrentPassword,
                () => setShowCurrentPassword(!showCurrentPassword),
                "Ваш текущий пароль",
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Новый пароль
              </label>
              {renderPasswordInput(
                newPassword,
                setNewPassword,
                showNewPassword,
                () => setShowNewPassword(!showNewPassword),
                "Ваш новый пароль",
                newPasswordRef,
                () => setActiveField("newPassword"),
                () => setActiveField(null),
              )}
              <FieldRequirements
                visible={activeField === "newPassword"}
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
              {renderPasswordInput(
                repeatPassword,
                setRepeatPassword,
                showRepeatPassword,
                () => setShowRepeatPassword(!showRepeatPassword),
                "Ваш новый пароль ещё раз",
                repeatPasswordRef,
                () => setActiveField("repeatPassword"),
                () => setActiveField(null),
              )}
              <FieldRequirements
                visible={activeField === "repeatPassword"}
                requirements={[
                  { text: "Пароли совпадают", met: newPassword === repeatPassword && repeatPassword.length > 0 },
                ]}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-button mt-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Подтвердить
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
