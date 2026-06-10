import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { config } from "../../config";

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail || payload.message || "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

export default function CuratorInvitationConfirmation() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const [status, setStatus] = useState<"loading" | "success" | "invalid">("loading");
  const [message, setMessage] = useState("Ваша роль успешно изменена на «Куратор контента»!");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const confirmInvitation = async () => {
      if (!code) {
        setStatus("invalid");
        return;
      }

      try {
        const response = await fetch(`${config.apiBaseUrl}/auth/curator-invitation/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const data = (await response.json()) as { message: string };
        if (!cancelled) {
          setMessage(data.message);
          setStatus("success");
        }
      } catch {
        if (!cancelled) {
          setStatus("invalid");
        }
      }
    };

    void confirmInvitation();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        {status === "loading" ? (
          <>
            <h1 className="auth-panel-header">Подтверждение роли</h1>
            <p className="text-base text-gray-900">Проверка приглашения...</p>
          </>
        ) : null}

        {status === "success" ? (
          <div className="space-y-6 text-center">
            <h1 className="auth-panel-header text-center">{message}</h1>
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" strokeWidth={1.8} />
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}

        {status === "invalid" ? (
          <div className="space-y-4">
            <h1 className="auth-panel-header">Подтверждение роли</h1>
            <p className="text-base text-gray-900">Ссылка недействительна или срок её действия истёк.</p>
            <button type="button" onClick={() => navigate("/auth/login")} className="primary-button">
              Войти
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
