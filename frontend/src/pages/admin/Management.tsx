import { useEffect, useMemo, useRef, useState } from "react";

import { authJson } from "../../auth";
import { ITEMS_PER_TABLE_PAGE, SEARCH_DEBOUNCE_MS } from "../../config";
import { EditorConfirmModal } from "../../components/EditorConfirmModal";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { useToast } from "../../components/ToastProvider";
import { useManagementStore, type CuratorManagementItem } from "../../hooks/useManagementStore";
import { checkEmail } from "../../validation";

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
  const { query, results, currentPage, totalPages, hasLoaded, lastSearch, setManagementState } = useManagementStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availability, setAvailability] = useState<CuratorInvitationAvailabilityResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  const trimmedQuery = query.trim();
  const isFullEmail = checkEmail(trimmedQuery).valid;
  const canInvite = isFullEmail && availability?.can_invite === true && !isSubmitting;

  const loadCurators = async (page: number, search: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_TABLE_PAGE.DEFAULT),
      });
      if (search.trim()) {
        params.set("q", search.trim());
      }

      const response = await authJson<CuratorManagementResponse>(`/management/curators?${params.toString()}`);
      setManagementState({
        results: response.items,
        currentPage: response.current_page,
        totalPages: response.total_pages,
        hasLoaded: true,
        lastSearch: { query: search, page },
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (hasLoaded && query === lastSearch.query) {
        return;
      }
      void loadCurators(1, query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, hasLoaded, lastSearch.query]);

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
      await loadCurators(1, query);
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
      await loadCurators(currentPage, query);
    } finally {
      setIsSubmitting(false);
    }
  };

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
      render: (item) => item.kind === "invitation" ? "—" : item.tests_count ?? 0,
    },
    {
      key: "skills_count",
      header: "Навыков",
      align: "center",
      render: (item) => item.kind === "invitation" ? "—" : item.skills_count ?? 0,
    },
    {
      key: "tasks_count",
      header: "Заданий",
      align: "center",
      render: (item) => item.kind === "invitation" ? "—" : item.tasks_count ?? 0,
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
              className="px-3 py-1.5 rounded-lg cursor-pointer border bg-white border-danger text-danger hover:bg-red-50 transition-colors disabled:opacity-50"
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
            className="px-3 py-1.5 rounded-lg border border-danger text-danger hover:bg-red-50 transition-colors disabled:opacity-50"
            disabled={isSubmitting}
          >
            Отозвать роль
          </button>
        );
      },
    },
  ], [isSubmitting]);

  return (
    <div className="workspace-container my-4">
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
            className="px-4 py-2 rounded-xl cursor-pointer bg-primary text-white font-medium transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Назначить куратором
          </button>
        </div>

        <PaginatedTable
          columns={columns}
          data={results}
          isLoading={isLoading}
          emptyMessage="Кураторы и приглашения не найдены"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => void loadCurators(page, query)}
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
