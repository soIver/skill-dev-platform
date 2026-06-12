import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { config } from "../../config";
import { LoadingText } from "../../components/LoadingText";
import { useUserStore } from "../../hooks/useUserStore";

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

const emailChangeConfirmationRequests = new Map<string, Promise<void>>();

function confirmEmailChangeOnce(code: string): Promise<void> {
  const existingRequest = emailChangeConfirmationRequests.get(code);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`${config.apiBaseUrl}/auth/email-change/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ code }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
    })
    .finally(() => {
      emailChangeConfirmationRequests.delete(code);
    });

  emailChangeConfirmationRequests.set(code, request);
  return request;
}

export default function EmailChangeConfirmation() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const [status, setStatus] = useState<"loading" | "invalid" | "success">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const clearSession = useUserStore((state) => state.clearSession);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const confirmEmailChange = async () => {
      if (!code) {
        setStatus("invalid");
        return;
      }

      try {
        await confirmEmailChangeOnce(code);

        if (!cancelled) {
          clearSession();
          setStatus("success");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error && error.message
              ? error.message
              : "Ссылка недействительна или срок её действия истёк.",
          );
          setStatus("invalid");
        }
      }
    };

    void confirmEmailChange();

    return () => {
      cancelled = true;
    };
  }, [clearSession, code]);

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        {status === "loading" ? (
          <>
            <h1 className="auth-panel-header">Смена адреса электронной почты</h1>
            <LoadingText text="Проверка кода..." className="text-base text-gray-900" />
          </>
        ) : null}

        {status === "invalid" ? (
          <div className="space-y-4">
            <h1 className="auth-panel-header">Смена адреса электронной почты</h1>
            <p className="text-base text-gray-900">
              {errorMessage || "Ссылка недействительна или срок её действия истёк."}
            </p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}

        {status === "success" ? (
          <div className="space-y-6 text-center">
            <h1 className="auth-panel-header text-center">Смена адреса электронной почты</h1>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" strokeWidth={1.8} />
            <p className="text-base font-medium text-gray-900">
              Адрес электронной почты успешно изменён!
            </p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
