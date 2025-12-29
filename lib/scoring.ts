/**
 * スコア計算ロジック
 * 正解のみポイント付与
 * 基本点(1000pt) + (10000ms - 回答時間ms) * 0.1
 * 最速(0ms)で約2000pt、10秒で1000pt
 */
export function calculateScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;

  const basePoints = 1000;
  const maxTimeMs = 10000; // 10秒
  const timeBonus = Math.max(0, maxTimeMs - responseTimeMs) * 0.1;

  return Math.floor(basePoints + timeBonus);
}

/**
 * ユーザーIDを生成（ブラウザごとにユニーク）
 */
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
