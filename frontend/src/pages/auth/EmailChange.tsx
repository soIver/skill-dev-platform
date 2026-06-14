import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { config } from "../../config";
import FieldRequirements from "../../components/FieldRequirements";
import { LoadingText } from "../../components/LoadingText";
import { useToast } from "../../components/ToastProvider";
import { checkEmail } from "../../validation";
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

export default function EmailChange() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "sent">("loading");
  const [email, setEmail] = useState("");
  const [activeField, setActiveField] = useState<"email" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const emailChecks = checkEmail(email);
  const isEmailValid = emailChecks.valid;

  useEffect(() => {
    let cancelled = false;

    const verifyCode = async () => {
      if (!code) {
        setStatus("invalid");
        return;
      }

      try {
        const response = await fetch(
          `${config.apiBaseUrl}/auth/email-change/verify?code=${encodeURIComponent(code)}`,
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

    if (!isEmailValid) {
      flashField(emailRef.current);
      showToast({
        title: "Ошибка смены почты",
        message: "Пожалуйста, укажите корректный адрес электронной почты.",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/email-change/request-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          code,
          email,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus("sent");
    } catch (error) {
      showToast({
        title: "Ошибка смены почты",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось отправить письмо для подтверждения нового адреса.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <h1 className="auth-panel-header">Смена адреса электронной почты</h1>

        {status === "loading" ? (
          <LoadingText text="Проверка кода..." className="text-base text-gray-900" />
        ) : null}

        {status === "invalid" ? (
          <div className="space-y-4">
            <p className="text-base text-gray-900">Ссылка недействительна или срок её действия истёк.</p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}

        {status === "sent" ? (
          <div className="space-y-6">
            <p className="text-base text-gray-900">
              На электронную почту {email} было отправлено письмо с инструкцией для подтверждения
            </p>
            <button type="button" onClick={() => navigate("/account/credentials")} className="primary-button">
              Профиль
            </button>
          </div>
        ) : null}

        {status === "ready" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Новый адрес электронной почты
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
              Подтвердить
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
