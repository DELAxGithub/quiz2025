-- クイズ感謝祭2025 データベーススキーマ
-- Supabase SQL Editorで実行してください

-- クイズ問題テーブル
CREATE TABLE quizzes (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  option_1 TEXT NOT NULL,
  option_2 TEXT NOT NULL,
  option_3 TEXT NOT NULL,
  option_4 TEXT NOT NULL,
  correct_answer_index INT NOT NULL CHECK (correct_answer_index BETWEEN 1 AND 4),
  order_num INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ゲーム状態テーブル（シングルトン）
CREATE TABLE game_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_quiz_id INT REFERENCES quizzes(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'voting', 'result', 'ranking')),
  start_time TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 回答テーブル
CREATE TABLE responses (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  quiz_id INT REFERENCES quizzes(id),
  selected_option INT NOT NULL CHECK (selected_option BETWEEN 1 AND 4),
  response_time_ms INT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, quiz_id)
);

-- 参加者テーブル
CREATE TABLE players (
  user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  total_score INT DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期ゲーム状態を挿入
INSERT INTO game_state (id, status) VALUES (1, 'waiting');

-- RLS (Row Level Security) を有効化
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 全員が読み取り可能なポリシー
CREATE POLICY "quizzes_read" ON quizzes FOR SELECT USING (true);
CREATE POLICY "game_state_read" ON game_state FOR SELECT USING (true);
CREATE POLICY "responses_read" ON responses FOR SELECT USING (true);
CREATE POLICY "players_read" ON players FOR SELECT USING (true);

-- 全員が挿入・更新可能なポリシー（本番では認証を追加推奨）
CREATE POLICY "game_state_update" ON game_state FOR UPDATE USING (true);
CREATE POLICY "responses_insert" ON responses FOR INSERT WITH CHECK (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update" ON players FOR UPDATE USING (true);

-- Realtimeを有効化
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE responses;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
