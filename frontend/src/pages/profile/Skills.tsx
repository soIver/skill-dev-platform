import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { PaginatedTable, type Column } from "../../components/PaginatedTable";
import { ActionMenu } from "../../components/ActionMenu";
import { authJson } from "../../auth";
import { InfoModal } from "../../components/InfoModal";

interface UserSkill {
  id: number;
  skill_name: string;
  level_name: string;
  confidence: number;
}

interface PaginatedResponse {
  items: UserSkill[];
  total_pages: number;
  current_page: number;
}

export default function Skills() {
  const [data, setData] = useState<UserSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showInfo, setShowInfo] = useState(false);

  const lastFetchedPage = useRef<number | null>(null);

  const fetchSkills = useCallback(async (page: number) => {
    if (lastFetchedPage.current === page) return;
    lastFetchedPage.current = page;

    setIsLoading(true);
    try {
      const response = await authJson<PaginatedResponse>(`/skills/me?page=${page}&limit=10`);
      setData(response.items);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Ошибка при загрузке навыков:", error);
      lastFetchedPage.current = null; // Позволяем повторную попытку при ошибке
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills(currentPage);
  }, [currentPage, fetchSkills]);

  const columns: Column<UserSkill>[] = [
    { key: "skill_name", header: "Название", align: "center" },
    { key: "level_name", header: "Уровень", align: "center" },
    {
      key: "confidence",
      header: (
        <div className="flex items-center justify-center gap-1">
          <span>Уверенность</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(true);
            }}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-indigo-100 hover:bg-primary- hover transition-colors text-xs font-bold"
            title="Что это?"
          >
            ?
          </button>
        </div>
      ),
      align: "center",
      showProgressBar: true,
    },
    {
      key: "action",
      header: "Действие",
      align: "center",
      render: () => (
        <ActionMenu
          items={[
            { label: "Найти задания", to: "/tasks" },
            { label: "Найти тест", to: "/tests" },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="workspace-container">
      <div className="workspace-panel relative">
        {showInfo && (
          <InfoModal
            title="Как рассчитывается уверенность?"
            message={`Показатель уверенности отражает соответствие Ваших знаний и умений навыку определённого уровня. 

    Оценка формируется на основе Ваших последних действий в системе. Чем выше качество выполнения заданий и прохождения тестов по этому навыку, тем выше процент уверенности.

    Обратите внимание: навыки имеют свойство «забываться» со временем. Чем дольше Вы не подтверждали уровень владения навыком в системе, тем ниже будет уверенность в нём.`}
            onClose={() => setShowInfo(false)}
          />
        )}
        <h2 className="workspace-panel-header">Мои навыки</h2>
        <div className="flex-1 min-h-0 flex flex-col">
          <PaginatedTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            emptyMessage={
              <>
                Вы можете <Link to="/tests" className="hyperlink">пройти тест</Link>, <Link to="/tasks" className="hyperlink">выполнить задание</Link> <br />или <Link to="/profile/repositories" className="hyperlink">загрузить репозиторий</Link>, чтобы получить первые навыки.
              </>
            }
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}
