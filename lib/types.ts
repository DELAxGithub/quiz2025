export interface Quiz {
  id: number;
  question: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer_index: number;
  order_num: number;
  created_at: string;
}

export interface GameState {
  id: number;
  current_quiz_id: number | null;
  status: "waiting" | "voting" | "result" | "ranking";
  start_time: string | null;
  updated_at: string;
}

export interface Response {
  id: number;
  user_id: string;
  nickname: string;
  quiz_id: number;
  selected_option: number;
  response_time_ms: number;
  is_correct: boolean;
  points: number;
  created_at: string;
}

export interface Player {
  user_id: string;
  nickname: string;
  total_score: number;
  joined_at: string;
}

export interface RankingEntry {
  nickname: string;
  total_score: number;
  rank: number;
}
