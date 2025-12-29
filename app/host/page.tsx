"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { GameState, Quiz, RankingEntry } from "@/lib/types";

const QUIZ_TIME_LIMIT = 10; // 制限時間（秒）

interface AnswerDistribution {
  option1: number;
  option2: number;
  option3: number;
  option4: number;
}

interface PendingAnswer {
  user_id: string;
  nickname: string;
  quiz_id: number;
  selected_option: number;
  response_time_ms: number;
  is_correct: boolean;
  points: number;
}

export default function HostPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [responseCount, setResponseCount] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [showAnswerCheck, setShowAnswerCheck] = useState(false);
  const [answerDistribution, setAnswerDistribution] = useState<AnswerDistribution>({ option1: 0, option2: 0, option3: 0, option4: 0 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAnswersRef = useRef<PendingAnswer[]>([]);

  // 初期データ取得
  useEffect(() => {
    fetchGameState();
    fetchQuizzes();
    fetchPlayerCount();
    fetchRanking();

    // Realtimeサブスクリプション
    const gameStateChannel = supabase
      .channel("host_game_state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state" },
        (payload) => setGameState(payload.new as GameState)
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("host_responses")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "responses" },
        () => fetchResponseCount()
      )
      .subscribe();

    const playersChannel = supabase
      .channel("host_players")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players" },
        () => fetchPlayerCount()
      )
      .subscribe();

    // Broadcast経由の回答を受信
    const answersChannel = supabase
      .channel("quiz_answers")
      .on("broadcast", { event: "answer" }, ({ payload }) => {
        const answer = payload as PendingAnswer;
        // 重複チェック
        const exists = pendingAnswersRef.current.some(
          (a) => a.user_id === answer.user_id && a.quiz_id === answer.quiz_id
        );
        if (!exists) {
          pendingAnswersRef.current.push(answer);
          setResponseCount((prev) => prev + 1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(gameStateChannel);
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(answersChannel);
    };
  }, []);

  // 回答をDBに保存（バッチ処理）
  const saveAnswersToDb = useCallback(async () => {
    const answers = pendingAnswersRef.current;
    if (answers.length === 0) return;

    // 回答を保存
    const { error: insertError } = await supabase.from("responses").upsert(
      answers.map((a) => ({
        user_id: a.user_id,
        nickname: a.nickname,
        quiz_id: a.quiz_id,
        selected_option: a.selected_option,
        response_time_ms: a.response_time_ms,
        is_correct: a.is_correct,
        points: a.points,
      })),
      { onConflict: "user_id,quiz_id" }
    );

    if (insertError) {
      console.error("Failed to save responses:", insertError);
    }

    // プレイヤーのスコアを更新（正解者のみ）
    const correctAnswers = answers.filter((a) => a.points > 0);
    for (const answer of correctAnswers) {
      const { data: player } = await supabase
        .from("players")
        .select("total_score")
        .eq("user_id", answer.user_id)
        .single();

      if (player) {
        await supabase
          .from("players")
          .update({ total_score: player.total_score + answer.points })
          .eq("user_id", answer.user_id);
      }
    }

    // 保存済みの回答をクリア
    pendingAnswersRef.current = [];
  }, []);

  // 正解発表（useCallbackでメモ化）
  const showResult = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsLoading(true);

    // まず回答をDBに保存
    await saveAnswersToDb();

    // 状態を更新
    await supabase
      .from("game_state")
      .update({
        status: "result",
        start_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // ランキング更新
    fetchRanking();

    setIsLoading(false);
  }, [saveAnswersToDb]);

  // ゲーム状態変更時
  useEffect(() => {
    if (gameState?.current_quiz_id) {
      const quiz = quizzes.find((q) => q.id === gameState.current_quiz_id);
      setCurrentQuiz(quiz || null);
      fetchResponseCount();
    }
    if (gameState?.status === "ranking") {
      fetchRanking();
    }
    // voting開始時にタイマーをリセット
    if (gameState?.status === "voting") {
      setTimeLeft(QUIZ_TIME_LIMIT);
    }
  }, [gameState, quizzes]);

  // カウントダウンタイマー
  useEffect(() => {
    if (gameState?.status !== "voting") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // 時間切れ
          if (autoAdvance) {
            showResult();
          }
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState?.status, autoAdvance, showResult]);

  const fetchGameState = async () => {
    const { data } = await supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();
    if (data) setGameState(data);
  };

  const fetchQuizzes = async () => {
    const { data } = await supabase
      .from("quizzes")
      .select("*")
      .order("order_num");
    if (data) setQuizzes(data);
  };

  const fetchPlayerCount = async () => {
    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true });
    setPlayerCount(count || 0);
  };

  const fetchResponseCount = async () => {
    if (!gameState?.current_quiz_id) return;
    const { count } = await supabase
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("quiz_id", gameState.current_quiz_id);
    setResponseCount(count || 0);
  };

  const fetchRanking = async () => {
    const { data } = await supabase
      .from("players")
      .select("nickname, total_score")
      .order("total_score", { ascending: false })
      .limit(10);

    if (data) {
      setRanking(
        data.map((p, i) => ({
          nickname: p.nickname,
          total_score: p.total_score,
          rank: i + 1,
        }))
      );
    }
  };

  const updateGameState = async (
    status: GameState["status"],
    quizId?: number
  ) => {
    setIsLoading(true);
    await supabase
      .from("game_state")
      .update({
        status,
        current_quiz_id: quizId ?? gameState?.current_quiz_id,
        start_time: status === "voting" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setIsLoading(false);
  };

  const startQuiz = async (quizId: number) => {
    console.log("startQuiz called with ID:", quizId);
    if (!quizId) {
      console.error("Invalid quizId:", quizId);
      return;
    }
    setResponseCount(0);
    setTimeLeft(QUIZ_TIME_LIMIT);
    setShowAnswerCheck(false);
    setAnswerDistribution({ option1: 0, option2: 0, option3: 0, option4: 0 });
    pendingAnswersRef.current = []; // 回答キューをクリア
    try {
      await updateGameState("voting", quizId);
      console.log("startQuiz completed");
    } catch (error) {
      console.error("startQuiz error:", error);
    }
  };

  const showRanking = async () => {
    await updateGameState("ranking");
  };

  // 回答分布を計算
  const calculateAnswerDistribution = () => {
    const distribution: AnswerDistribution = { option1: 0, option2: 0, option3: 0, option4: 0 };
    for (const answer of pendingAnswersRef.current) {
      if (answer.selected_option === 1) distribution.option1++;
      else if (answer.selected_option === 2) distribution.option2++;
      else if (answer.selected_option === 3) distribution.option3++;
      else if (answer.selected_option === 4) distribution.option4++;
    }
    setAnswerDistribution(distribution);
    setShowAnswerCheck(true);
  };

  // ローカル状態を完全リセット
  const resetLocalState = () => {
    setCurrentQuiz(null);
    setResponseCount(0);
    setTimeLeft(QUIZ_TIME_LIMIT);
    setShowAnswerCheck(false);
    setAnswerDistribution({ option1: 0, option2: 0, option3: 0, option4: 0 });
    pendingAnswersRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetGame = async () => {
    if (!confirm("ゲームをリセットしますか？全ての回答とスコアが削除されます。")) return;

    setIsLoading(true);

    // 回答を削除
    await supabase.from("responses").delete().neq("id", 0);

    // プレイヤーのスコアをリセット
    await supabase.from("players").update({ total_score: 0 }).neq("user_id", "");

    // ゲーム状態をリセット
    await supabase
      .from("game_state")
      .update({
        status: "waiting",
        current_quiz_id: null,
        start_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // ローカル状態をリセット
    resetLocalState();
    setGameState({ id: 1, current_quiz_id: null, status: "waiting", start_time: null, updated_at: new Date().toISOString() });

    setIsLoading(false);
    fetchRanking();
    fetchPlayerCount();
  };

  const kickAllPlayers = async () => {
    if (!confirm("全参加者を退出させますか？参加者は再度ニックネーム入力が必要になります。")) return;

    setIsLoading(true);

    // 回答を削除
    await supabase.from("responses").delete().neq("id", 0);

    // 全プレイヤーを削除
    await supabase.from("players").delete().neq("user_id", "");

    // ゲーム状態をリセット
    await supabase
      .from("game_state")
      .update({
        status: "waiting",
        current_quiz_id: null,
        start_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // ローカル状態をリセット
    resetLocalState();
    setGameState({ id: 1, current_quiz_id: null, status: "waiting", start_time: null, updated_at: new Date().toISOString() });

    setIsLoading(false);
    setPlayerCount(0);
    setRanking([]);
  };

  const getCurrentQuizIndex = () => {
    if (!currentQuiz) return -1;
    return quizzes.findIndex((q) => q.id === currentQuiz.id);
  };

  const getNextQuiz = () => {
    const currentIndex = getCurrentQuizIndex();
    if (currentIndex >= 0 && currentIndex < quizzes.length - 1) {
      return quizzes[currentIndex + 1];
    }
    return null;
  };

  // 次のクイズを事前に計算
  const nextQuiz = getNextQuiz();

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl md:text-4xl font-bold text-yellow-400">
            ホスト画面
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-lg">
              参加者: <strong className="text-yellow-300">{playerCount}人</strong>
            </span>
            <button
              onClick={resetGame}
              disabled={isLoading}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              スコアリセット
            </button>
            <button
              onClick={kickAllPlayers}
              disabled={isLoading}
              className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              全員退出
            </button>
          </div>
        </div>

        {/* ステータス表示 */}
        <div className="bg-white/10 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-lg">現在のステータス:</span>
            <span
              className={`px-4 py-2 rounded-full font-bold ${
                gameState?.status === "waiting"
                  ? "bg-gray-600"
                  : gameState?.status === "voting"
                  ? "bg-green-600"
                  : gameState?.status === "result"
                  ? "bg-blue-600"
                  : "bg-yellow-600"
              }`}
            >
              {gameState?.status === "waiting" && "待機中"}
              {gameState?.status === "voting" && "回答受付中"}
              {gameState?.status === "result" && "結果発表"}
              {gameState?.status === "ranking" && "ランキング"}
            </span>
            {gameState?.status === "voting" && (
              <>
                <span className="text-lg">
                  回答数: <strong className="text-yellow-300">{responseCount}/{playerCount}</strong>
                </span>
                <span className={`text-3xl font-bold ${timeLeft <= 3 ? "text-red-500 animate-pulse" : "text-yellow-400"}`}>
                  残り {timeLeft}秒
                </span>
              </>
            )}
          </div>
          {/* 自動進行トグル */}
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm">時間切れで自動的に正解発表</span>
            </label>
            {gameState?.status === "voting" && (
              <button
                onClick={calculateAnswerDistribution}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold"
              >
                アンサーチェック
              </button>
            )}
          </div>
          {/* 回答分布表示 */}
          {showAnswerCheck && gameState?.status === "voting" && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="bg-red-600/50 p-3 rounded-lg text-center">
                <p className="text-sm">A</p>
                <p className="text-2xl font-bold">{answerDistribution.option1}人</p>
              </div>
              <div className="bg-blue-600/50 p-3 rounded-lg text-center">
                <p className="text-sm">B</p>
                <p className="text-2xl font-bold">{answerDistribution.option2}人</p>
              </div>
              <div className="bg-yellow-600/50 p-3 rounded-lg text-center">
                <p className="text-sm">C</p>
                <p className="text-2xl font-bold">{answerDistribution.option3}人</p>
              </div>
              <div className="bg-green-600/50 p-3 rounded-lg text-center">
                <p className="text-sm">D</p>
                <p className="text-2xl font-bold">{answerDistribution.option4}人</p>
              </div>
            </div>
          )}
        </div>

        {/* 現在の問題 */}
        {currentQuiz && (
          <div className="bg-white/10 rounded-xl p-6">
            <p className="text-sm text-white/60 mb-2">
              第{getCurrentQuizIndex() + 1}問 / {quizzes.length}問
            </p>
            <p className="text-2xl font-bold mb-4">{currentQuiz.question}</p>
            <div className="grid grid-cols-2 gap-2 text-lg">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${
                    i === currentQuiz.correct_answer_index
                      ? "bg-green-600/50 border-2 border-green-400"
                      : "bg-white/10"
                  }`}
                >
                  <span className="font-bold mr-2">
                    {["A", "B", "C", "D"][i - 1]}:
                  </span>
                  {currentQuiz[`option_${i}` as keyof Quiz]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* コントロールボタン - 常に全て表示 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 正解を発表 */}
          <button
            onClick={showResult}
            disabled={isLoading || gameState?.status !== "voting"}
            className={`col-span-2 py-4 text-xl font-bold rounded-xl ${
              gameState?.status === "voting"
                ? "bg-blue-600 hover:bg-blue-500"
                : "bg-gray-600 opacity-50"
            } disabled:cursor-not-allowed`}
          >
            正解を発表
          </button>

          {/* ランキング表示 */}
          <button
            onClick={showRanking}
            disabled={isLoading}
            className="col-span-2 py-4 text-xl font-bold rounded-xl bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50"
          >
            ランキング表示
          </button>

          {/* デバッグ情報 */}
          <div className="col-span-2 md:col-span-4 text-sm text-white/50 bg-black/30 p-2 rounded">
            Status: {gameState?.status} | Quiz ID: {gameState?.current_quiz_id} | Current Index: {getCurrentQuizIndex()}
          </div>

          {/* 待機に戻す */}
          <button
            onClick={async () => {
              await supabase.from("game_state").update({ status: "waiting", updated_at: new Date().toISOString() }).eq("id", 1);
            }}
            className="col-span-2 py-3 text-lg font-bold rounded-xl bg-gray-600 hover:bg-gray-500"
          >
            待機画面に戻す
          </button>

          {/* 次の問題へ（結果発表後） */}
          {gameState?.status === "result" && nextQuiz && (
            <button
              onClick={() => {
                console.log("Next quiz:", nextQuiz);
                startQuiz(nextQuiz.id);
              }}
              disabled={isLoading}
              className="col-span-2 py-4 text-xl font-bold rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50"
            >
              次の問題へ (第{getCurrentQuizIndex() + 2}問)
            </button>
          )}

          {/* 結果表示時の終了メッセージ */}
          {gameState?.status === "result" && !nextQuiz && (
            <div className="col-span-2 md:col-span-4 py-4 text-center text-xl text-yellow-400 bg-yellow-600/20 rounded-xl border-2 border-yellow-400">
              全問終了！お疲れ様でした！
            </div>
          )}
        </div>

        {/* ランキング */}
        <div className="bg-white/10 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-yellow-400 mb-4">
            現在のランキング
          </h2>
          <div className="space-y-2">
            {ranking.length === 0 ? (
              <p className="text-white/50">まだ回答がありません</p>
            ) : (
              ranking.map((entry) => (
                <div
                  key={entry.rank}
                  className={`ranking-item ${
                    entry.rank <= 3 ? `ranking-top3 ranking-${entry.rank}` : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xl font-bold ${
                        entry.rank === 1
                          ? "text-yellow-400"
                          : entry.rank === 2
                          ? "text-gray-300"
                          : entry.rank === 3
                          ? "text-orange-400"
                          : "text-white/70"
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <span className="text-lg font-medium">{entry.nickname}</span>
                  </div>
                  <span className="text-lg font-bold text-yellow-300">
                    {entry.total_score.toLocaleString()} pt
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 問題一覧 */}
        <div className="bg-white/10 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-yellow-400 mb-4">問題一覧</h2>
          <div className="space-y-2">
            {quizzes.map((quiz, index) => (
              <div
                key={quiz.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  currentQuiz?.id === quiz.id
                    ? "bg-yellow-600/30 border border-yellow-400"
                    : "bg-white/5"
                }`}
              >
                <div>
                  <span className="text-sm text-white/60 mr-2">
                    第{index + 1}問
                  </span>
                  <span>{quiz.question}</span>
                </div>
                <button
                  onClick={() => startQuiz(quiz.id)}
                  disabled={isLoading}
                  className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 rounded disabled:opacity-50"
                >
                  開始
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
