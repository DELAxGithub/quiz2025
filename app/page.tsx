"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/scoring";

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    // 既存のユーザー情報があればプレイ画面へ
    const userId = localStorage.getItem("quiz_user_id");
    const savedNickname = localStorage.getItem("quiz_nickname");
    if (userId && savedNickname) {
      router.push("/play");
    }
  }, [router]);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError("ニックネームを入力してください");
      return;
    }
    if (nickname.length > 20) {
      setError("ニックネームは20文字以内で入力してください");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const userId = generateUserId();

      // プレイヤーをDBに登録
      const { error: dbError } = await supabase.from("players").insert({
        user_id: userId,
        nickname: nickname.trim(),
        total_score: 0,
      });

      if (dbError) throw dbError;

      // ローカルストレージに保存
      localStorage.setItem("quiz_user_id", userId);
      localStorage.setItem("quiz_nickname", nickname.trim());

      router.push("/play");
    } catch (err) {
      console.error(err);
      setError("参加に失敗しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* タイトル */}
        <div className="text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-yellow-400 mb-2">
            たっちレディオクイズ
          </h1>
          <p className="text-xl md:text-2xl text-yellow-300">「名言の殿堂」</p>
        </div>

        {/* 入力フォーム */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 space-y-6">
          <div>
            <label
              htmlFor="nickname"
              className="block text-lg font-medium mb-2"
            >
              ニックネーム
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="あなたの名前を入力"
              maxLength={20}
              className="w-full px-4 py-3 text-xl rounded-lg bg-white/20 border border-white/30 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 placeholder-white/50"
            />
          </div>

          {error && (
            <p className="text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full py-4 text-2xl font-bold rounded-xl bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "参加中..." : "参加する"}
          </button>
        </div>

        {/* フッター */}
        <p className="text-center text-white/50 text-sm">
          スマホを横にしてプレイすると見やすいです
        </p>
      </div>
    </main>
  );
}
