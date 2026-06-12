import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { authFetch, authJson } from "../auth";
import { config } from "../config";

interface AttemptAnswer {
  id: number;
  answer_text: string;
}

interface AttemptQuestion {
  id: number;
  question_text: string;
  answers: AttemptAnswer[];
  multiple: boolean;
}

interface AttemptState {
  attempt_id: string;
  skill_level_id: number;
  skill_name: string;
  level_name: string;
  question: AttemptQuestion;
  question_number: number;
  question_count: number;
  remaining_seconds: number;
  total_score: number;
  threshold_score: number;
}

interface AttemptResult {
  score: number;
  total_score: number;
  threshold_score: number;
  passed: boolean;
  completed_at: string;
  cheated: boolean;
}

interface AnswerResponse {
  completed: boolean;
  next_state: AttemptState | null;
  result: AttemptResult | null;
}

const INITIAL_DOCUMENT_PATH = window.location.pathname;

function buildWebsocketUrl(attemptId: string): string {
  const baseUrl = config.apiBaseUrl.startsWith("http")
    ? config.apiBaseUrl
    : `${window.location.origin}${config.apiBaseUrl}`;
  return `${baseUrl.replace(/^http/, "ws")}/tests/attempts/${attemptId}/monitor`;
}

function formatRemaining(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const restSeconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${restSeconds}`;
}

function isReloadNavigation(): boolean {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === "reload" && INITIAL_DOCUMENT_PATH === window.location.pathname;
}

export default function TestAttempt() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    attempt?: AttemptState;
    skillId?: number;
    skillLevelId?: number;
  } | null;

  const [attemptState, setAttemptState] = useState<AttemptState | null>(locationState?.attempt ?? null);
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<number[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(locationState?.attempt?.remaining_seconds ?? 0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cheatDetected, setCheatDetected] = useState(false);
  const [attemptUnavailable, setAttemptUnavailable] = useState(false);
  const [loadError, setLoadError] = useState("");
  const finishedRef = useRef(false);
  const unloadingRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);

  const returnState = useMemo(() => ({
    skillId: locationState?.skillId,
    skillLevelId: locationState?.skillLevelId ?? attemptState?.skill_level_id,
  }), [attemptState?.skill_level_id, locationState?.skillId, locationState?.skillLevelId]);

  const finishAttempt = useCallback(async (cheated: boolean, reason = "manual") => {
    if (!attemptId || finishedRef.current) return null;
    finishedRef.current = true;
    try {
      return await authJson<AttemptResult>(`/tests/attempts/${attemptId}/finish`, {
        method: "POST",
        body: JSON.stringify({ cheated, reason }),
      });
    } catch (error) {
      console.error("Failed to finish test attempt", error);
      return null;
    }
  }, [attemptId]);

  const finishWithBeacon = useCallback((cheated: boolean, reason: string) => {
    if (!attemptId || finishedRef.current) return;
    finishedRef.current = true;
    fetch(`${config.apiBaseUrl}/tests/attempts/${attemptId}/finish`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cheated, reason }),
    }).catch(() => undefined);
  }, [attemptId]);

  const returnToTestsAfterFinish = useCallback(() => {
    navigate("/tests", { replace: true, state: { ...returnState, forceRefresh: true } });
  }, [navigate, returnState]);

  const markAttemptUnavailable = useCallback(() => {
    finishedRef.current = true;
    setAttemptUnavailable(true);
    setAttemptState(null);
    setSelectedAnswerIds([]);
    setRemainingSeconds(0);
  }, []);

  const interruptForCheating = useCallback(() => {
    if (finishedRef.current) return;
    setCheatDetected(true);
    finishAttempt(true, "cheating");
  }, [finishAttempt]);

  useEffect(() => {
    if (!attemptId) {
      markAttemptUnavailable();
      setIsLoading(false);
      return;
    }
    if (isReloadNavigation()) {
      setIsLoading(true);
      authFetch(`${config.apiBaseUrl}/tests/attempts/${attemptId}/finish`, {
        method: "POST",
        body: JSON.stringify({ cheated: false, reason: "reload" }),
      }).finally(returnToTestsAfterFinish);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    setAttemptUnavailable(false);
    authFetch(`${config.apiBaseUrl}/tests/attempts/${attemptId}`)
      .then(async (response) => {
        if (!mounted) return;
        if (!response.ok) {
          markAttemptUnavailable();
          return;
        }
        const data = await response.json() as AttemptState;
        finishedRef.current = false;
        setAttemptState(data);
        setRemainingSeconds(data.remaining_seconds);
      })
      .catch((error) => {
        console.error("Failed to load test attempt", error);
        if (mounted) {
          setLoadError("Не удалось проверить состояние попытки");
          markAttemptUnavailable();
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [attemptId, markAttemptUnavailable, returnToTestsAfterFinish]);

  useEffect(() => {
    if (!attemptState) return;
    deadlineRef.current = Date.now() + attemptState.remaining_seconds * 1000;
    setRemainingSeconds(attemptState.remaining_seconds);
    setSelectedAnswerIds([]);
  }, [attemptState]);

  useEffect(() => {
    if (!attemptState || cheatDetected || attemptUnavailable || isLoading) return;
    const timer = window.setInterval(() => {
      if (!deadlineRef.current) return;
      const nextRemaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);
      if (nextRemaining <= 0) {
        window.clearInterval(timer);
        finishAttempt(false, "timeout").then(returnToTestsAfterFinish);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attemptState, attemptUnavailable, cheatDetected, finishAttempt, isLoading, returnToTestsAfterFinish]);

  useEffect(() => {
    if (!attemptId || cheatDetected || attemptUnavailable || isLoading) return;
    const socket = new WebSocket(buildWebsocketUrl(attemptId));
    const pingTimer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 10000);
    return () => {
      window.clearInterval(pingTimer);
      socket.close();
    };
  }, [attemptId, attemptUnavailable, cheatDetected, isLoading]);

  useEffect(() => {
    if (!attemptState || attemptUnavailable || isLoading) return;
    const prevent = (event: Event) => {
      event.preventDefault();
      interruptForCheating();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked = (
        key === "f12" ||
        key === "printscreen" ||
        (event.ctrlKey && ["c", "s", "p", "u"].includes(key)) ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key))
      );
      if (blocked) {
        event.preventDefault();
        interruptForCheating();
      }
    };
    const handleVisibility = () => {
      if (document.hidden && !unloadingRef.current) interruptForCheating();
    };
    const handleBlur = () => {
      if (!unloadingRef.current) interruptForCheating();
    };
    const handleBeforeUnload = () => {
      unloadingRef.current = true;
      finishWithBeacon(false, "unload");
    };
    const handleOffline = () => finishWithBeacon(false, "offline");
    const handlePageHide = () => {
      unloadingRef.current = true;
      finishWithBeacon(false, "pagehide");
    };

    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("selectstart", prevent);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [attemptState, attemptUnavailable, finishWithBeacon, interruptForCheating, isLoading]);

  const toggleAnswer = (answerId: number) => {
    if (!attemptState) return;
    if (!attemptState.question.multiple) {
      setSelectedAnswerIds([answerId]);
      return;
    }
    setSelectedAnswerIds((current) => (
      current.includes(answerId)
        ? current.filter((id) => id !== answerId)
        : [...current, answerId]
    ));
  };

  const submitAnswer = async () => {
    if (!attemptState || selectedAnswerIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/tests/attempts/${attemptId}/answer`, {
        method: "POST",
        body: JSON.stringify({
          question_id: attemptState.question.id,
          answer_ids: selectedAnswerIds,
        }),
      });
      if (!response.ok) {
        markAttemptUnavailable();
        return;
      }
      const data = await response.json() as AnswerResponse;
      if (data.completed) {
        finishedRef.current = true;
        returnToTestsAfterFinish();
        return;
      }
      if (data.next_state) setAttemptState(data.next_state);
    } catch (error) {
      console.error("Failed to submit test answer", error);
      setLoadError("Не удалось отправить ответ");
      markAttemptUnavailable();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cheatDetected) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold text-gray-900">Попытка прервана</h1>
          <p className="mt-4 text-gray-700">
            Система зафиксировала в Вашем браузере действия, распознанные как попытка схитрить при прохождении теста. <br/><br/> К сожалению, мы не можем засчитать Вам его результаты.
          </p>
          <button onClick={returnToTestsAfterFinish} className="primary-button mt-8">
            Вернуться к тестам
          </button>
        </div>
      </div>
    );
  }

  if (attemptUnavailable) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold text-gray-900">Попытка уже завершена</h1>
          <p className="mt-4 text-gray-700">
            Эта попытка была завершена или прервана. Вернитесь в банк тестов, чтобы увидеть актуальный результат и доступность следующей попытки.
          </p>
          {loadError && <p className="mt-3 text-sm text-gray-500">{loadError}</p>}
          <button onClick={returnToTestsAfterFinish} className="primary-button mt-8">
            Вернуться к тестам
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !attemptState) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 text-gray-500">
        {loadError || "Загрузка..."}
      </div>
    );
  }

  const inputType = attemptState.question.multiple ? "checkbox" : "radio";

  return (
    <div className="test-secure-area flex min-h-screen flex-1 flex-col bg-gray-50">
      <div className="hor-nav-bar mb-0! justify-between px-8">
        <div className="py-4 text-lg font-semibold text-gray-900">
          {attemptState.skill_name} - {attemptState.level_name}
        </div>
        <button
          onClick={() => finishAttempt(false, "manual").then(returnToTestsAfterFinish)}
          className="my-2 rounded-xl border border-gray-300 px-5 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Завершить попытку
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 py-8">
        <section className="flex-1 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="whitespace-pre-line text-2xl font-bold leading-relaxed text-gray-900">
            {attemptState.question.question_text}
          </h1>
          <div className="mt-8 flex flex-col gap-3">
            {attemptState.question.answers.map((answer) => (
              <label
                key={answer.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:border-primary"
              >
                <input
                  type={inputType}
                  name="answer"
                  checked={selectedAnswerIds.includes(answer.id)}
                  onChange={() => toggleAnswer(answer.id)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="text-base leading-relaxed text-gray-800">{answer.answer_text}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold text-gray-800">
            Вопрос №{attemptState.question_number} из {attemptState.question_count}
          </div>
          <div className="text-lg font-semibold text-gray-800">
            Осталось времени: {formatRemaining(remainingSeconds)}
          </div>
          <button
            onClick={submitAnswer}
            disabled={selectedAnswerIds.length === 0 || isSubmitting}
            className="primary-button w-auto min-w-40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {attemptState.question_number === attemptState.question_count ? "Завершить" : "Дальше"}
          </button>
        </section>
      </div>
    </div>
  );
}
