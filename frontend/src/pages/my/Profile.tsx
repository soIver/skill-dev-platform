import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PaginatedTable, type Column, type PaginatedPage } from "../../components/PaginatedTable";
import { ActionMenu } from "../../components/ActionMenu";
import { authJson } from "../../auth";
import { InfoModal } from "../../components/InfoModal";
import { ClassifierTree } from "../../components/ClassifierTree";
import { useTasksStore } from "../../hooks/useTasksStore";
import { useTestsStore } from "../../hooks/useTestsStore";
import { useClassifierTree } from "../../hooks/useClassifierTree";
import type {
  ClassifierFunctionTreeItem,
  ClassifierGroupTreeItem,
  ClassifierProfStandardTreeItem,
} from "../../hooks/useContentStore";

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

interface UserPsFunctionsResponse {
  items: ClassifierProfStandardTreeItem[];
}

export default function Profile() {
  const navigate = useNavigate();
  const tasksStore = useTasksStore();
  const testsStore = useTestsStore();
  const { items: classifierTree, isLoading: isClassifierLoading } = useClassifierTree();
  const [showInfo, setShowInfo] = useState(false);
  const [psFunctions, setPsFunctions] = useState<ClassifierProfStandardTreeItem[]>([]);
  const [isFunctionsLoading, setIsFunctionsLoading] = useState(true);

  const loadSkillsPage = useCallback(async (page: number, limit: number): Promise<PaginatedPage<UserSkill>> => {
    const response = await authJson<PaginatedResponse>(`/skills/my?page=${page}&limit=${limit}`);
    return { items: response.items, totalPages: response.total_pages };
  }, []);

  const fetchPsFunctions = useCallback(async () => {
    setIsFunctionsLoading(true);
    try {
      const response = await authJson<UserPsFunctionsResponse>("/skills/my-functions");
      setPsFunctions(response.items);
    } catch (error) {
      console.error("Ошибка при загрузке трудовых функций:", error);
    } finally {
      setIsFunctionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPsFunctions();
  }, [fetchPsFunctions]);

  const collectedFunctionIds = useMemo(() => new Set(
    psFunctions.flatMap((standard) => (
      standard.groups.flatMap((group) => group.functions.map((item) => item.id))
    )),
  ), [psFunctions]);

  const fullStandardsById = useMemo(() => new Map(
    classifierTree.map((standard) => [standard.id, standard]),
  ), [classifierTree]);

  const getFullStandard = (standard: ClassifierProfStandardTreeItem) =>
    fullStandardsById.get(standard.id) ?? standard;

  const getFullGroup = (
    standard: ClassifierProfStandardTreeItem,
    group: ClassifierGroupTreeItem,
  ) => getFullStandard(standard).groups.find((item) => item.id === group.id) ?? group;

  const getGroupProgress = (
    standard: ClassifierProfStandardTreeItem,
    group: ClassifierGroupTreeItem,
  ) => {
    const fullGroup = getFullGroup(standard, group);
    return {
      collected: fullGroup.functions.filter((item) => collectedFunctionIds.has(item.id)).length,
      total: fullGroup.functions.length,
    };
  };

  const getStandardProgress = (standard: ClassifierProfStandardTreeItem) => {
    const fullStandard = getFullStandard(standard);
    return {
      collected: fullStandard.groups.filter((group) => (
        group.functions.length > 0 &&
        group.functions.every((item) => collectedFunctionIds.has(item.id))
      )).length,
      total: fullStandard.groups.length,
    };
  };

  const getMissingStandardFunctions = (standard: ClassifierProfStandardTreeItem) =>
    getFullStandard(standard).groups.flatMap((group) => (
      group.functions.filter((item) => !collectedFunctionIds.has(item.id))
    ));

  const getCollectedStandardFunctions = (standard: ClassifierProfStandardTreeItem) =>
    getFullStandard(standard).groups.flatMap((group) => (
      group.functions.filter((item) => collectedFunctionIds.has(item.id))
    ));

  const getMissingGroupFunctions = (
    standard: ClassifierProfStandardTreeItem,
    group: ClassifierGroupTreeItem,
  ) => getFullGroup(standard, group).functions.filter((item) => !collectedFunctionIds.has(item.id));

  const getCollectedGroupFunctions = (
    standard: ClassifierProfStandardTreeItem,
    group: ClassifierGroupTreeItem,
  ) => getFullGroup(standard, group).functions.filter((item) => collectedFunctionIds.has(item.id));

  const navigateToTasksBySkill = (skill: UserSkill) => {
    tasksStore.resetSearchState();
    tasksStore.setKeywordInput(`${skill.skill_name}, - ${skill.level_name}`);
    tasksStore.setOnlyUncompleted(true);
    tasksStore.setSelectedPsFunctions([]);
    navigate("/tasks");
  };

  const navigateToTestsBySkill = (skill: UserSkill) => {
    testsStore.resetSearchState();
    testsStore.setKeywordInput(`${skill.skill_name}, - ${skill.level_name}`);
    testsStore.setOnlyUnpassed(true);
    testsStore.setSelectedPsFunctions([]);
    navigate("/tests");
  };

  const navigateToTasksByFunctions = (items: ClassifierFunctionTreeItem[]) => {
    tasksStore.resetSearchState();
    tasksStore.setKeywordInput("");
    tasksStore.setOnlyUncompleted(true);
    tasksStore.setSelectedPsFunctions(items);
    navigate("/tasks");
  };

  const navigateToTestsByFunctions = (items: ClassifierFunctionTreeItem[]) => {
    testsStore.resetSearchState();
    testsStore.setKeywordInput("");
    testsStore.setOnlyUnpassed(true);
    testsStore.setSelectedPsFunctions(items);
    navigate("/tests");
  };

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
      render: (item) => (
        <ActionMenu
          items={[
            { label: "Найти задания", onClick: () => navigateToTasksBySkill(item) },
            { label: "Найти тест", onClick: () => navigateToTestsBySkill(item) },
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
            emptyMessage={
              <>
                Вы можете <Link to="/tests" className="hyperlink">пройти тест</Link>, <Link to="/tasks" className="hyperlink">выполнить задание</Link> <br />или <Link to="/account/repositories" className="hyperlink">загрузить репозиторий</Link>, чтобы получить первые навыки.
              </>
            }
            loadPage={loadSkillsPage}
            cacheKey="profile-skills"
            queryKey="profile-skills"
          />
        </div>
      </div>
      <div className="workspace-panel relative">
        <h2 className="workspace-panel-header">Мои трудовые функции</h2>
        <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg bg-white">
          {isFunctionsLoading || (psFunctions.length > 0 && isClassifierLoading) ? (
            <div className="py-8 text-center text-gray-500">Загрузка...</div>
          ) : psFunctions.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Link to="/tasks" className="hyperlink">Выполняйте задания</Link> и <Link to="/tests" className="hyperlink">проходите тесты</Link>,<br/>связанные с трудовыми функциями, чтобы видеть их здесь<br/>и получать более качественные рекомендации.
            </div>
          ) : (
            <ClassifierTree
              items={psFunctions}
              selectedKey={null}
              isLoading={isFunctionsLoading}
              canEdit={false}
              onSelectProfStandard={() => undefined}
              onSelectGroup={() => undefined}
              onSelectFunction={() => undefined}
              onCreateProfStandard={() => undefined}
              onCreateGroup={() => undefined}
              onCreateFunction={() => undefined}
              renderProfStandardMeta={(standard) => {
                const progress = getStandardProgress(standard);
                return `${progress.collected}/${progress.total} ОТФ`;
              }}
              renderGroupMeta={(standard, group) => {
                const progress = getGroupProgress(standard, group);
                return `${progress.collected}/${progress.total} ТФ`;
              }}
              renderProfStandardActions={(standard) => {
                const missingFunctions = getMissingStandardFunctions(standard);
                const collectedFunctions = getCollectedStandardFunctions(standard);
                return (
                  <ActionMenu
                    items={[
                      {
                        label: "Найти задания по имеющимся ТФ",
                        disabled: collectedFunctions.length === 0,
                        onClick: () => navigateToTasksByFunctions(collectedFunctions),
                      },
                      {
                        label: "Найти тесты по имеющимся ТФ",
                        disabled: collectedFunctions.length === 0,
                        onClick: () => navigateToTestsByFunctions(collectedFunctions),
                      },
                      {
                        label: "Найти задания по недостающим ТФ",
                        disabled: missingFunctions.length === 0,
                        onClick: () => navigateToTasksByFunctions(missingFunctions),
                      },
                      {
                        label: "Найти тесты по недостающим ТФ",
                        disabled: missingFunctions.length === 0,
                        onClick: () => navigateToTestsByFunctions(missingFunctions),
                      },
                    ]}
                  />
                );
              }}
              renderGroupActions={(standard, group) => {
                const missingFunctions = getMissingGroupFunctions(standard, group);
                const collectedFunctions = getCollectedGroupFunctions(standard, group);
                return (
                  <ActionMenu
                    items={[
                      {
                        label: "Найти задания по имеющимся ТФ",
                        disabled: collectedFunctions.length === 0,
                        onClick: () => navigateToTasksByFunctions(collectedFunctions),
                      },
                      {
                        label: "Найти тесты по имеющимся ТФ",
                        disabled: collectedFunctions.length === 0,
                        onClick: () => navigateToTestsByFunctions(collectedFunctions),
                      },
                      {
                        label: "Найти задания по недостающим ТФ",
                        disabled: missingFunctions.length === 0,
                        onClick: () => navigateToTasksByFunctions(missingFunctions),
                      },
                      {
                        label: "Найти тесты по недостающим ТФ",
                        disabled: missingFunctions.length === 0,
                        onClick: () => navigateToTestsByFunctions(missingFunctions),
                      },
                    ]}
                  />
                );
              }}
              renderFunctionActions={(_, __, item) => (
                <ActionMenu
                  items={[
                    { label: "Найти задания", onClick: () => navigateToTasksByFunctions([item]) },
                    { label: "Найти тесты", onClick: () => navigateToTestsByFunctions([item]) },
                  ]}
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
