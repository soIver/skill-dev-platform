import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { authJson } from "../auth";
import { ITEMS_PER_TABLE_PAGE, SEARCH_DEBOUNCE_MS } from "../config";
import { EditorConfirmModal } from "../components/EditorConfirmModal";
import { PaginatedTable, type Column, type PaginatedPage } from "../components/PaginatedTable";
import { useToast } from "../components/ToastProvider";
import { useContentStore } from "../hooks/useContentStore";
import { useManagementStore, type CuratorManagementItem } from "../hooks/useManagementStore";
import { checkEmail } from "../validation";

interface CuratorManagementResponse {
  items: CuratorManagementItem[];
  total_pages: number;
  current_page: number;
}

interface CuratorInvitationAvailabilityResponse {
  can_invite: boolean;
  reason?: string | null;
}

type PendingAction =
  | { type: "cancel"; item: CuratorManagementItem }
  | { type: "revoke"; item: CuratorManagementItem };

export default function ManagementAdmin() {
  const { query, setManagementState } = useManagementStore();
  const { setSkillsState, setTasksState, setTestsState } = useContentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [availability, setAvailability] = useState<CuratorInvitationAvailabilityResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const trimmedQuery = query.trim();
  const isFullEmail = checkEmail(trimmedQuery).valid;
  const canInvite = isFullEmail && availability?.can_invite === true && !isSubmitting;

  const loadCuratorsPage = useCallback(async (page: number, limit: number): Promise<PaginatedPage<CuratorManagementItem>> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    const response = await authJson<CuratorManagementResponse>(`/management/curators?${params.toString()}`);
    return { items: response.items, totalPages: response.total_pages };
  }, [trimmedQuery]);

  const refreshTable = () => setTableRefreshKey((value) => value + 1);

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      if (!isFullEmail) {
        setAvailability(null);
        return;
      }

      try {
        const params = new URLSearchParams({ email: trimmedQuery });
        const response = await authJson<CuratorInvitationAvailabilityResponse>(
          `/management/curator-invitations/availability?${params.toString()}`,
        );
        if (!cancelled) {
          setAvailability(response);
        }
      } catch {
        if (!cancelled) {
          setAvailability({ can_invite: false, reason: "Не удалось проверить адрес" });
        }
      }
    };

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [isFullEmail, trimmedQuery]);

  const handleInvite = async () => {
    if (!canInvite) return;

    setIsSubmitting(true);
    try {
      await authJson<{ message: string }>("/management/curator-invitations", {
        method: "POST",
        body: JSON.stringify({ email: trimmedQuery }),
      });
      showToast({
        title: "Приглашение отправлено",
        message: "Письмо с приглашением отправлено на указанную почту.",
        variant: "success",
      });
      refreshTable();
      setAvailability({ can_invite: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    setIsSubmitting(true);
    try {
      if (pendingAction.type === "cancel") {
        const params = new URLSearchParams({ email: pendingAction.item.email });
        await authJson<{ message: string }>(`/management/curator-invitations?${params.toString()}`, {
          method: "DELETE",
        });
        showToast({
          title: "Приглашение отменено",
          message: "Код приглашения больше не действует.",
          variant: "success",
        });
      } else if (typeof pendingAction.item.id === "number") {
        await authJson<{ message: string }>(`/management/curators/${pendingAction.item.id}/revoke`, {
          method: "PATCH",
        });
        showToast({
          title: "Роль отозвана",
          message: "Пользователь переведён на роль «Пользователь».",
          variant: "success",
        });
      }

      setPendingAction(null);
      refreshTable();
    } finally {
      setIsSubmitting(false);
    }
  };

  const openContentForOwner = useCallback((
    item: CuratorManagementItem,
    section: "skills" | "tests" | "tasks",
  ) => {
    if (item.kind !== "user" || typeof item.id !== "number") return;

    const ownerUsername = item.username || item.email;

    if (section === "skills") {
      setSkillsState({
        skillInput: "",
        levelInput: "",
        ownerId: item.id,
        ownerUsername,
        results: [],
        currentPage: 1,
        totalPages: 1,
      });
    } else if (section === "tests") {
      setTestsState({
        keywordInput: "",
        skillInput: "",
        ownerId: item.id,
        ownerUsername,
        results: [],
        currentPage: 1,
        totalPages: 1,
      });
    } else {
      setTasksState({
        keywordInput: "",
        skillInput: "",
        ownerId: item.id,
        ownerUsername,
        results: [],
        currentPage: 1,
        totalPages: 1,
      });
    }

    navigate(`/content/${section}`);
  }, [navigate, setSkillsState, setTasksState, setTestsState]);

  const renderContentCount = useCallback((
    item: CuratorManagementItem,
    count: number | null | undefined,
    section: "skills" | "tests" | "tasks",
    label: string,
  ) => {
    if (item.kind === "invitation") {
      return "—";
    }

    const normalizedCount = count ?? 0;

    return (
      <div className="flex items-center justify-center gap-2">
        <span className="min-w-4 text-center">{normalizedCount}</span>
        <button
          type="button"
          onClick={() => openContentForOwner(item, section)}
          disabled={normalizedCount === 0}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:border-gray-200 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:text-gray-300"
          title={`Открыть ${label} пользователя`}
          aria-label={`Открыть ${label} пользователя`}
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }, [openContentForOwner]);

  const columns = useMemo<Column<CuratorManagementItem>[]>(() => [
    {
      key: "username",
      header: "Имя пользователя",
      render: (item) => item.kind === "invitation" ? "—" : item.username || "—",
    },
    {
      key: "email",
      header: "Электронная почта",
      render: (item) => item.email,
    },
    {
      key: "tests_count",
      header: "Тестов",
      align: "center",
      render: (item) => renderContentCount(item, item.tests_count, "tests", "тесты"),
    },
    {
      key: "skills_count",
      header: "Навыков",
      align: "center",
      render: (item) => renderContentCount(item, item.skills_count, "skills", "навыки"),
    },
    {
      key: "tasks_count",
      header: "Заданий",
      align: "center",
      render: (item) => renderContentCount(item, item.tasks_count, "tasks", "задания"),
    },
    {
      key: "action",
      header: "Действие",
      align: "center",
      render: (item) => {
        if (item.kind === "invitation") {
          return (
            <button
              type="button"
              onClick={() => setPendingAction({ type: "cancel", item })}
              className="px-3 py-1.5 rounded-lg border bg-white border-danger text-danger hover:bg-red-50 transition-colors"
              disabled={isSubmitting}
            >
              Отменить приглашение
            </button>
          );
        }

        if (item.role === "admin") {
          return "—";
        }

        return (
          <button
            type="button"
            onClick={() => setPendingAction({ type: "revoke", item })}
            className="px-3 py-1.5 rounded-lg bg-white border border-danger text-danger hover:bg-red-50 transition-colors"
            disabled={isSubmitting}
          >
            Отозвать роль
          </button>
        );
      },
    },
  ], [isSubmitting, renderContentCount]);

  return (
    <div className="workspace-container m-7">
      <div className="workspace-panel">
        <h2 className="workspace-panel-header">Управление</h2>

        <div className="mb-4 flex w-full flex-col gap-3 md:w-1/2 md:flex-row md:items-start">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={query}
              onChange={(event) => setManagementState({ query: event.target.value })}
              className="input-field mt-0"
              placeholder="Имя пользователя или электронная почта"
              maxLength={64}
            />
            {isFullEmail && availability?.reason ? (
              <p className="mt-2 text-sm text-gray-500">{availability.reason}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleInvite}
            disabled={!canInvite}
            className="px-4 py-2 rounded-xl bg-primary text-white font-medium transition-colors hover:bg-primary-hover"
          >
            Назначить куратором
          </button>
        </div>

        <PaginatedTable
          columns={columns}
          emptyMessage="Кураторы не найдены"
          itemsPerPage={ITEMS_PER_TABLE_PAGE.DEFAULT}
          loadPage={loadCuratorsPage}
          cacheKey="management-curators"
          queryKey={trimmedQuery}
          refreshKey={tableRefreshKey}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />
      </div>

      {pendingAction ? (
        <EditorConfirmModal
          title={pendingAction.type === "cancel" ? "Отменить приглашение?" : "Отозвать роль?"}
          message={
            pendingAction.type === "cancel"
              ? `Приглашение для ${pendingAction.item.email} будет отменено.`
              : `Пользователь ${pendingAction.item.username || pendingAction.item.email} потеряет права куратора контента, все его сессии будут завершены.`
          }
          confirmText={pendingAction.type === "cancel" ? "Отменить" : "Отозвать"}
          confirmVariant="danger"
          onConfirm={handleConfirmAction}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </div>
  );
}
