import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { authJson, logout } from "../../auth";
import { useToast } from "../../components/ToastProvider";
import { AutocompleteSearch } from "../../components/AutocompleteSearch";
import { useUserStore, type GitHubProfile } from "../../hooks/useUserStore";
import GitHubIcon from "../../assets/icons/github.svg?react";

interface Repo {
  id: string;
  name: string;
  url: string;
  description: string;
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
  const [cachedRepos, setCachedRepos] = useState<Repo[] | null>(null);
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

  const githubDisplayName =
    githubConnection?.name || githubConnection?.login || "GitHub профиль";

  const handleSearchRepos = async (query: string): Promise<Repo[]> => {
    let currentRepos = cachedRepos;
    if (!currentRepos) {
      const data = await authJson<any[]>("/github/repos");
      currentRepos = data.map(r => ({ ...r, id: r.url }));
      setCachedRepos(currentRepos);
    }
    if (!query) return currentRepos.slice(0, 5);
    return currentRepos.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
  };

  const handleAnalyzeRepo = async (repo: Repo) => {
    try {
      await authJson("/analysis/repository", {
        method: "POST",
        body: JSON.stringify({ repo_name: repo.name, repo_url: repo.url }),
      });
      showToast({
        title: "Анализ запущен",
        message: `Репозиторий ${repo.name} поставлен в очередь на обработку.`,
        variant: "success",
      });
    } catch (err) {
      showToast({
        title: "Ошибка",
        message: err instanceof Error && err.message ? err.message : "Не удалось запустить анализ",
        variant: "error",
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="space-y-8">
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
              <button className="primary-button flex-3">Сменить почту</button>
              <button className="primary-button flex-3">Сменить пароль</button>
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

            {githubConnection?.connected && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Анализ репозитория</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Выберите публичный репозиторий, в котором вы являетесь единственным контрибьютором,
                  чтобы проанализировать ваши навыки.
                </p>
                <AutocompleteSearch<Repo>
                  onSearch={handleSearchRepos}
                  onSelect={handleAnalyzeRepo}
                  itemToString={(repo) => repo.name}
                  placeholder="Начните вводить название репозитория..."
                  buttonText="Анализировать"
                  renderItem={(repo) => (
                    <div>
                      <div className="font-medium">{repo.name}</div>
                      {repo.description && (
                        <div className="text-xs text-gray-500 truncate">{repo.description}</div>
                      )}
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
