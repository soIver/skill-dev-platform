import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { authFetch, authJson, logout } from "../../auth";
import { useToast } from "../../components/ToastProvider";
import { config } from "../../config";
import { useUserStore, type GitHubProfile } from "../../hooks/useUserStore";
import { formatDurationSeconds } from "../../utils";
import GitHubIcon from "../../assets/icons/github.svg?react";

interface CredentialChangeRequestResponse {
  message?: string;
  detail?: string;
  retry_after_seconds?: number;
}

type CredentialChangeAction = "email" | "password";

interface CredentialChangeConfig {
  path: string;
  waitTitle: string;
  waitMessage: (seconds: number) => string;
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  fallbackError: string;
}

const credentialChangeConfig: Record<CredentialChangeAction, CredentialChangeConfig> = {
  email: {
    path: "/auth/email-change/request",
    waitTitle: "Пожалуйста, подождите",
    waitMessage: (seconds) =>
      `Обязательно проверьте папку "спам" в почтовом ящике. Повторная отправка письма будет доступна через ${formatDurationSeconds(seconds)}.`,
    successTitle: "Письмо отправлено",
    successMessage: "На Вашу почту была отправлена ссылка для смены адреса электронной почты.",
    errorTitle: "Ошибка смены почты",
    fallbackError: "Не удалось отправить письмо для смены почты.",
  },
  password: {
    path: "/auth/password-change/request",
    waitTitle: "Пожалуйста, подождите",
    waitMessage: (seconds) =>
      `Обязательно проверьте папку "спам" в почтовом ящике. Повторная отправка письма будет доступна через ${formatDurationSeconds(seconds)}.`,
    successTitle: "Письмо отправлено",
    successMessage: "На Вашу почту была отправлена ссылка для смены пароля.",
    errorTitle: "Ошибка смены пароля",
    fallbackError: "Не удалось отправить письмо для смены пароля.",
  },
};

async function readCredentialChangeResponse(response: Response): Promise<CredentialChangeRequestResponse> {
  try {
    return (await response.json()) as CredentialChangeRequestResponse;
  } catch {
    return {};
  }
}


export default function Credentials() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const githubStatus = searchParams.get("github");
  const githubMessage = searchParams.get("message");
  const user = useUserStore((state) => state.user);
  const githubConnection = useUserStore((state) => state.githubProfile);
  const setGitHubProfile = useUserStore((state) => state.setGitHubProfile);
  const [isGitHubLoading, setIsGitHubLoading] = useState(!githubConnection);
  const [isGitHubSubmitting, setIsGitHubSubmitting] = useState(false);
  const [credentialCooldowns, setCredentialCooldowns] = useState<Record<CredentialChangeAction, number>>({
    email: 0,
    password: 0,
  });
  const [credentialSubmitting, setCredentialSubmitting] = useState<Record<CredentialChangeAction, boolean>>({
    email: false,
    password: false,
  });
  const { showToast } = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      showToast({
        title: "Выход выполнен",
        message: "Сессия завершена.",
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({
        title: "Ошибка выхода",
        message:
          err instanceof Error && err.message
            ? err.message
            : "При выходе из аккаунта произошла ошибка на сервере.",
        variant: "error",
      });
    }

    navigate("/auth/login");
  };

  useEffect(() => {
    let cancelled = false;

    // проверка, нужно ли принудительное обновление (например, после успешного OAuth)
    const isReturningFromOAuth = githubStatus === "connected";

    // условие выхода: если профиль уже есть в состоянии localStorage
    // и мы не в процессе возврата из OAuth
    if (githubConnection?.connected && !isReturningFromOAuth) {
      setIsGitHubLoading(false);
      return;
    }

    const loadGitHubProfile = async () => {
      setIsGitHubLoading(true);

      try {
        const data = await authJson<GitHubProfile>("/github/profile");
        if (!cancelled) {
          setGitHubProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          showToast({
            title: "Ошибка GitHub",
            message:
              err instanceof Error && err.message
                ? err.message
                : "При загрузке статуса GitHub произошла ошибка на сервере.",
            variant: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setIsGitHubLoading(false);
        }
      }
    };

    void loadGitHubProfile();

    return () => {
      cancelled = true;
    };
  }, [githubConnection?.connected, githubStatus, setGitHubProfile, showToast]);

  useEffect(() => {
    if (!githubStatus) {
      return;
    }

    const noticeKey = `${location.key}:${githubStatus}:${githubMessage ?? ""}`;
    const shouldShowToast =
      window.sessionStorage.getItem("github-oauth-notice") !== noticeKey;

    if (githubStatus === "error" && shouldShowToast) {
      showToast({
        title: "Ошибка GitHub",
        message: githubMessage || "При привязке GitHub произошла ошибка на сервере.",
        variant: "error",
      });
    } else if (githubStatus === "connected" && shouldShowToast) {
      setIsGitHubLoading(true);
      showToast({
        title: "GitHub подключён",
        message: "Профиль GitHub успешно привязан.",
        variant: "success",
      });
    }

    window.sessionStorage.setItem("github-oauth-notice", noticeKey);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("github");
    nextParams.delete("message");
    nextParams.delete("login");
    setSearchParams(nextParams, { replace: true });
  }, [githubMessage, githubStatus, location.key, searchParams, setSearchParams, showToast]);

  useEffect(() => {
    if (credentialCooldowns.email <= 0 && credentialCooldowns.password <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCredentialCooldowns((current) => ({
        email: Math.max(0, current.email - 1),
        password: Math.max(0, current.password - 1),
      }));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [credentialCooldowns.email, credentialCooldowns.password]);

  const handleConnectGitHub = async () => {
    setIsGitHubSubmitting(true);

    try {
      const data = await authJson<{ authorization_url: string }>("/github/connect-url");
      window.location.assign(data.authorization_url);
    } catch (err) {
      showToast({
        title: "Ошибка GitHub",
        message:
          err instanceof Error && err.message
            ? err.message
            : "Не удалось начать авторизацию GitHub.",
        variant: "error",
      });
      setIsGitHubSubmitting(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setIsGitHubSubmitting(true);

    try {
      await authJson<{ message: string }>("/github/connection", {
        method: "DELETE",
      });
      setGitHubProfile({
        connected: false,
        login: null,
        name: null,
        avatar_url: null,
        profile_url: null,
      });
      showToast({
        title: "GitHub отключён",
        message: "Профиль GitHub успешно отвязан.",
        variant: "success",
      });
    } catch (err) {
      showToast({
        title: "Ошибка GitHub",
        message:
          err instanceof Error && err.message
            ? err.message
            : "При отвязке GitHub произошла ошибка на сервере.",
        variant: "error",
      });
    } finally {
      setIsGitHubSubmitting(false);
    }
  };

  const handleRequestCredentialChange = async (action: CredentialChangeAction) => {
    const actionConfig = credentialChangeConfig[action];
    setCredentialSubmitting((current) => ({ ...current, [action]: true }));

    try {
      const response = await authFetch(
        `${config.apiBaseUrl}${actionConfig.path}`,
        {
          method: "POST",
        },
      );
      const data = await readCredentialChangeResponse(response);

      if (response.status === 429) {
        const retryAfter = Math.max(1, data.retry_after_seconds ?? 60);
        setCredentialCooldowns((current) => ({ ...current, [action]: retryAfter }));
        showToast({
          title: actionConfig.waitTitle,
          message: actionConfig.waitMessage(retryAfter),
          variant: "error",
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Не удалось отправить письмо.");
      }

      setCredentialCooldowns((current) => ({
        ...current,
        [action]: Math.max(1, data.retry_after_seconds ?? 60),
      }));
      showToast({
        title: actionConfig.successTitle,
        message: actionConfig.successMessage,
        variant: "success",
      });
    } catch (err) {
      showToast({
        title: actionConfig.errorTitle,
        message:
          err instanceof Error && err.message
            ? err.message
            : actionConfig.fallbackError,
        variant: "error",
      });
    } finally {
      setCredentialSubmitting((current) => ({ ...current, [action]: false }));
    }
  };

  const githubDisplayName =
    githubConnection?.name || githubConnection?.login || "GitHub профиль";
  const isEmailChangeDisabled = credentialSubmitting.email || credentialCooldowns.email > 0;
  const isPasswordChangeDisabled = credentialSubmitting.password || credentialCooldowns.password > 0;
  const emailChangeDisabledTitle =
    credentialSubmitting.email
      ? "Отправка письма для смены почты..."
      : credentialCooldowns.email >= 86400
      ? `Смена адреса электронной почты будет доступна через ${formatDurationSeconds(credentialCooldowns.email)}`
      : "Отправка кода для смены почты возможна не чаще одного раза в минуту";


  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="workspace-container flex-col! gap-8! min-h-0!">
        {/* Основные */}
        <div className="workspace-panel">
          <h2 className="workspace-panel-header">Основные</h2>

          <div className="space-y-6">
            <div className="flex items-center">
              <div>
                <p className="text-sm text-gray-500">Имя пользователя</p>
                <p className="text-lg font-medium">{user?.username}</p>
              </div>
            </div>

            <div className="flex items-center">
              <div>
                <p className="text-sm text-gray-500">Электронная почта</p>
                <p className="text-lg font-medium">{user?.email}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <span
                className="flex-3"
                title={
                  isEmailChangeDisabled
                    ? emailChangeDisabledTitle
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => handleRequestCredentialChange("email")}
                  disabled={isEmailChangeDisabled}
                  className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Сменить почту
                </button>
              </span>
              <span
                className="flex-3"
                title={
                  isPasswordChangeDisabled
                    ? "Отправка кода для смены пароля возможна не чаще одного раза в минуту"
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => handleRequestCredentialChange("password")}
                  disabled={isPasswordChangeDisabled}
                  className="primary-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Сменить пароль
                </button>
              </span>
              <button onClick={handleLogout} className="danger-button flex-2">
                Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="workspace-panel">
          <h2 className="workspace-panel-header">Интеграции</h2>

          <div className="space-y-4">
            {isGitHubLoading ? (
              <div className="rounded-2xl border border-gray-200 px-6 py-4 text-sm text-gray-500">
                Загрузка статуса GitHub...
              </div>
            ) : githubConnection?.connected ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  {githubConnection.avatar_url ? (
                    <img
                      src={githubConnection.avatar_url}
                      alt={githubDisplayName}
                      className="h-12 w-12 rounded-full"
                    />
                  ) : (
                    <GitHubIcon className="w-6 h-6" />
                  )}

                  <div>
                    <p className="font-medium text-lg">{githubDisplayName}</p>
                    {githubConnection.login ? (
                      <p className="text-sm text-gray-500">@{githubConnection.login}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-4 md:flex-row">
                  {githubConnection.profile_url ? (
                    <a
                      href={githubConnection.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="primary-button text-center"
                    >
                      Открыть профиль
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleDisconnectGitHub}
                    disabled={isGitHubSubmitting}
                    className="danger-button whitespace-nowrap"
                  >
                    Отвязать профиль
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGitHub}
                disabled={isGitHubSubmitting}
                className="github-connect-button"
              >
                <GitHubIcon className="w-7 h-7" />
                <span className="font-medium">Привязать профиль GitHub</span>
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
