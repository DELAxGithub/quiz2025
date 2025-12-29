"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculateScore } from "@/lib/scoring";
import type { GameState, Quiz, RankingEntry } from "@/lib/types";

export default function PlayPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const startTimeRef = useRef<number | null>(null);

  // 初期化
  useEffect(() => {
    const storedUserId = localStorage.getItem("quiz_user_id");
    const storedNickname = localStorage.getItem("quiz_nickname");

    if (!storedUserId || !storedNickname) {
      router.push("/");
      return;
    }

    setUserId(storedUserId);
    setNickname(storedNickname);
  }, [router]);

  // ゲーム状態の取得とリアルタイム購読
  useEffect(() => {
    if (!userId) return;

    const fetchGameState = async () => {
      const { data } = await supabase
        .from("game_state")
        .select("*")
        .eq("id", 1)
        .single();

      if (data) {
        setGameState(data);
      }
    };

    fetchGameState();

    // Realtimeサブスクリプション
    const channel = supabase
      .channel("game_state_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_state",
        },
        (payload) => {
          setGameState(payload.new as GameState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ゲーム状態変更時の処理
  useEffect(() => {
    if (!gameState) return;

    if (gameState.status === "voting" && gameState.current_quiz_id) {
      // 新しいクイズ開始
      setHasAnswered(false);
      setSelectedOption(null);
      setEarnedPoints(null);
      setIsCorrect(null);
      setTimeLeft(10);
      startTimeRef.current = Date.now();

      // クイズ情報を取得
      supabase
        .from("quizzes")
        .select("*")
        .eq("id", gameState.current_quiz_id)
        .single()
        .then(({ data }) => {
          if (data) setCurrentQuiz(data);
        });
    } else if (gameState.status === "ranking") {
      // ランキング取得
      fetchRanking();
    }
  }, [gameState]);

  // カウントダウンタイマー
  useEffect(() => {
    if (gameState?.status !== "voting" || hasAnswered) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState?.status, hasAnswered]);

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

  const handleAnswer = useCallback(
    async (option: number) => {
      if (!userId || !nickname || !currentQuiz || hasAnswered || !startTimeRef.current) return;

      setHasAnswered(true);
      setSelectedOption(option);

      const responseTimeMs = Date.now() - startTimeRef.current;
      const correct = option === currentQuiz.correct_answer_index;
      const points = calculateScore(correct, responseTimeMs);

      setIsCorrect(correct);
      setEarnedPoints(points);

      // Broadcast経由で回答を送信（DB負荷軽減）
      const channel = supabase.channel("quiz_answers");
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "answer",
        payload: {
          user_id: userId,
          nickname: nickname,
          quiz_id: currentQuiz.id,
          selected_option: option,
          response_time_ms: responseTimeMs,
          is_correct: correct,
          points: points,
        },
      });
      supabase.removeChannel(channel);
    },
    [userId, nickname, currentQuiz, hasAnswered]
  );

  // 待機画面
  if (gameState?.status === "waiting") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold text-yellow-400">
            クイズ感謝祭
          </h1>
          <div className="animate-pulse">
            <p className="text-2xl md:text-3xl text-white/80">
              まもなく開始...
            </p>
          </div>
          <p className="text-xl text-white/60">
            ようこそ、{nickname}さん！
          </p>
        </div>
      </main>
    );
  }

  // 投票中（クイズ回答）画面
  if (gameState?.status === "voting" && currentQuiz) {
    return (
      <main className="min-h-screen flex flex-col p-4">
        {/* タイマー */}
        <div className="text-center py-4">
          <span
            className={`countdown-timer ${
              timeLeft <= 3 ? "text-red-500" : "text-yellow-400"
            }`}
          >
            {timeLeft}
          </span>
        </div>

        {/* 問題文 */}
        <div className="text-center py-4 flex-shrink-0">
          <p className="text-xl md:text-3xl font-bold px-4">
            {currentQuiz.question}
          </p>
        </div>

        {/* 選択肢ボタン */}
        {!hasAnswered ? (
          <div className="flex-1 grid grid-cols-2 gap-3 md:gap-4 p-2 md:p-4">
            <button
              onClick={() => handleAnswer(1)}
              disabled={timeLeft === 0}
              className="quiz-button quiz-button-a disabled:opacity-50"
            >
              <span className="block text-lg md:text-xl mb-1">A</span>
              <span className="block text-base md:text-2xl">{currentQuiz.option_1}</span>
            </button>
            <button
              onClick={() => handleAnswer(2)}
              disabled={timeLeft === 0}
              className="quiz-button quiz-button-b disabled:opacity-50"
            >
              <span className="block text-lg md:text-xl mb-1">B</span>
              <span className="block text-base md:text-2xl">{currentQuiz.option_2}</span>
            </button>
            <button
              onClick={() => handleAnswer(3)}
              disabled={timeLeft === 0}
              className="quiz-button quiz-button-c disabled:opacity-50"
            >
              <span className="block text-lg md:text-xl mb-1">C</span>
              <span className="block text-base md:text-2xl">{currentQuiz.option_3}</span>
            </button>
            <button
              onClick={() => handleAnswer(4)}
              disabled={timeLeft === 0}
              className="quiz-button quiz-button-d disabled:opacity-50"
            >
              <span className="block text-lg md:text-xl mb-1">D</span>
              <span className="block text-base md:text-2xl">{currentQuiz.option_4}</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl md:text-4xl font-bold mb-4">
                回答済み
              </p>
              <p className="text-xl text-white/70">
                結果発表をお待ちください...
              </p>
            </div>
          </div>
        )}
      </main>
    );
  }

  // 結果発表画面
  if (gameState?.status === "result" && currentQuiz) {
    const correctOption = currentQuiz[`option_${currentQuiz.correct_answer_index}` as keyof Quiz];

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-8 max-w-lg w-full">
          {/* 正解表示 */}
          <div>
            <p className="text-xl text-white/70 mb-2">正解は...</p>
            <p className="text-4xl md:text-6xl font-bold text-yellow-400">
              {correctOption}
            </p>
          </div>

          {/* 自分の結果 */}
          {selectedOption !== null && (
            <div
              className={`p-6 rounded-2xl ${
                isCorrect
                  ? "bg-green-500/30 border-2 border-green-400"
                  : "bg-red-500/30 border-2 border-red-400"
              }`}
            >
              <p className="text-3xl md:text-5xl font-bold mb-2">
                {isCorrect ? "正解！" : "不正解..."}
              </p>
              <p className="text-2xl md:text-4xl">
                +{earnedPoints?.toLocaleString() || 0} pt
              </p>
            </div>
          )}

          {selectedOption === null && (
            <div className="p-6 rounded-2xl bg-gray-500/30 border-2 border-gray-400">
              <p className="text-3xl font-bold">未回答</p>
              <p className="text-xl">+0 pt</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ランキング画面
  if (gameState?.status === "ranking") {
    return (
      <main className="min-h-screen flex flex-col items-center p-4">
        <h2 className="text-3xl md:text-5xl font-bold text-yellow-400 py-6">
          ランキング
        </h2>

        <div className="w-full max-w-lg space-y-2">
          {ranking.map((entry) => (
            <div
              key={entry.rank}
              className={`ranking-item ${
                entry.rank <= 3 ? `ranking-top3 ranking-${entry.rank}` : ""
              } ${entry.nickname === nickname ? "ring-2 ring-yellow-400" : ""}`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`text-2xl md:text-3xl font-bold ${
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
                <span className="text-lg md:text-2xl font-medium">
                  {entry.nickname}
                </span>
              </div>
              <span className="text-xl md:text-2xl font-bold text-yellow-300">
                {entry.total_score.toLocaleString()} pt
              </span>
            </div>
          ))}
        </div>
      </main>
    );
  }

  // ローディング
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-yellow-400"></div>
    </main>
  );
}
