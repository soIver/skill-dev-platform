import { useCallback } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, Hourglass } from "lucide-react";
import { PaginatedTable, type Column, type PaginatedPage } from "../../components/PaginatedTable";
import { ActionMenu } from "../../components/ActionMenu";
import { authJson } from "../../auth";
import { useToast } from "../../components/ToastProvider";
import { ITEMS_PER_TABLE_PAGE } from "../../config";
import { useRepositoriesStore, type RepoItem } from "../../hooks/useRepositoriesStore";

export default function Repositories() {
  const { showToast } = useToast();
  const {
    repos,
    totalPages,
    fetchedPages,
    isInitialized,
    setReposData,
    updateRepoStatus,
    addRepos,
  } = useRepositoriesStore();

  const fetchPage = useCallback(async (page: number, limit: number) => {
    try {
      const data = await authJson<{ items: RepoItem[]; total_pages: number; current_page: number; total_items: number }>(
        `/github/repos?page=${page}&limit=${limit}`
      );
      return data;
    } catch (err) {
      showToast({
        title: "Ошибка",
        message: err instanceof Error && err.message ? err.message : "Не удалось загрузить репозитории",
        variant: "error",
      });
      return null;
    }
  }, [showToast]);

  const loadRepositoriesPage = useCallback(async (page: number, limit: number): Promise<PaginatedPage<RepoItem>> => {
    if (fetchedPages.includes(page)) {
      const start = (page - 1) * limit;
      return {
        items: repos.slice(start, start + limit),
        totalPages,
      };
    }

    const data = await fetchPage(page, limit);
    if (!data) {
      return { items: [], totalPages };
    }

    const computedTotalPages = Math.max(1, Math.ceil(data.total_items / limit));
    const itemsWithId = data.items.map((item) => ({ ...item, id: item.name }));
    if (page === 1 && !isInitialized) {
      setReposData(itemsWithId, computedTotalPages, [1]);
    } else {
      addRepos(itemsWithId, page);
    }
    return { items: itemsWithId, totalPages: computedTotalPages };
  }, [addRepos, fetchPage, fetchedPages, isInitialized, repos, setReposData, totalPages]);

  const resolveRepository = useCallback((item: RepoItem) => (
    repos.find((repo) => repo.name === item.name) ?? item
  ), [repos]);

  const handleAnalyze = async (repo: RepoItem) => {
    try {
      await authJson("/github/analyze", {
        method: "POST",
        body: JSON.stringify({
          gh_id: repo.gh_id,
          repo_name: repo.name,
          repo_url: repo.url,
          last_commit_date: repo.last_commit_date,
        }),
      });
      showToast({
        title: "Успех",
        message: `Репозиторий ${repo.name} поставлен в очередь на обработку.`,
        variant: "success",
      });
      updateRepoStatus(repo.name, "Подготовка");
    } catch (err) {
      // ошибка уже показана authJson
      if (err instanceof Error && err.message.includes("Репозиторий слишком большой")) {
        updateRepoStatus(repo.name, "Недоступен");
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const columns: Column<RepoItem>[] = [
    {
      key: "name",
      header: "Название",
      align: "center",
      render: (item) => (
        <div>
          <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
            {item.name}
          </a>
          {item.description && <p className="text-xs text-gray-500 mt-1 max-w-sm truncate mx-auto">{item.description}</p>}
        </div>
      )
    },
    {
      key: "analyzed_at",
      header: "Последняя проверка",
      align: "center",
      render: (item) => <span className="text-sm text-gray-600">{formatDate(item.analyzed_at)}</span>
    },
    {
      key: "last_commit_date",
      header: "Последний коммит",
      align: "center",
      render: (item) => <span className="text-sm text-gray-600">{formatDate(item.last_commit_date)}</span>
    },
    {
      key: "status",
      header: "Статус проверки",
      align: "center",
      render: (item) => {
        switch (item.status) {
          case "Доступен":
            return <div className="flex items-center justify-center gap-1 text-success text-sm"><CheckCircle2 className="w-4 h-4" /> Доступен</div>;
          case "Недоступен":
            return <div className="flex items-center justify-center gap-1 text-danger text-sm" title="Репозиторий недоступен для анализа"><XCircle className="w-4 h-4" /> Недоступен</div>;
          case "Проверен":
            return <div className="flex items-center justify-center gap-1 text-primary text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Проверен</div>;
          case "Подготовка":
            return <div className="flex items-center justify-center gap-1 text-warning text-sm"><Hourglass className="w-4 h-4" /> Подготовка</div>;
          case "В процессе...":
            return <div className="flex items-center justify-center gap-1 text-primary text-sm"><Loader2 className="w-4 h-4 animate-spin" /> В процессе</div>;
          default:
            return <span className="text-sm">{item.status}</span>;
        }
      }
    },
    {
      key: "actions",
      header: "Действие",
      align: "center",
      render: (item) => (
        <ActionMenu
          items={[
            {
              label: "Проверить",
              onClick: () => handleAnalyze(item),
              disabled: item.status !== "Доступен"
            },
            {
              label: "Открыть",
              onClick: () => window.open(item.url, "_blank")
            }
          ]}
        />
      )
    }
  ];

  return (
    <div className="workspace-container">
      <div className="workspace-panel h-full flex flex-col">
        <h2 className="workspace-panel-header shrink-0">Мои репозитории</h2>

        <div className="flex-1 min-h-0 flex flex-col">
          <PaginatedTable
            columns={columns}
            itemsPerPage={ITEMS_PER_TABLE_PAGE.REPOS}
            loadPage={loadRepositoriesPage}
            cacheKey="repositories"
            queryKey="repositories"
            resolveItem={resolveRepository}
            emptyMessage={
              <>
                Привяжите профиль GitHub в <Link to="/account/credentials" className="hyperlink">настройках интеграций</Link>,<br />чтобы получить возможность загружать свои репозитории.
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
