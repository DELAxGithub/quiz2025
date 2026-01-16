# たっちレディオクイズ「名言の殿堂」

リアルタイム参加型クイズアプリケーション

## 技術スタック

- **フロントエンド**: Next.js 15 + React 19 + TypeScript
- **スタイリング**: Tailwind CSS
- **バックエンド/DB**: Supabase (PostgreSQL + Realtime)
- **デプロイ**: Vercel

## プロジェクト構造

```
quiz2025/
├── app/
│   ├── page.tsx          # 参加画面（ニックネーム入力）
│   ├── host/page.tsx     # ホスト管理画面
│   ├── play/page.tsx     # プレイヤー画面（クイズ回答）
│   ├── layout.tsx        # ルートレイアウト
│   └── globals.css       # グローバルスタイル
├── lib/
│   ├── supabase.ts       # Supabaseクライアント
│   ├── types.ts          # TypeScript型定義
│   └── scoring.ts        # スコア計算ロジック
├── supabase/
│   ├── schema.sql        # データベーススキーマ
│   └── seed.sql          # サンプルクイズデータ
└── .env.local.example    # 環境変数テンプレート
```

---

## Supabaseプロジェクトの復元手順

### 1. Supabaseプロジェクトを作成

1. [Supabase](https://supabase.com) にログイン
2. "New Project" をクリック
3. プロジェクト名とパスワードを設定
4. リージョンを選択（日本からなら Tokyo を推奨）

### 2. データベーススキーマを作成

1. Supabase Dashboard → **SQL Editor** を開く
2. `supabase/schema.sql` の内容をコピー＆ペースト
3. **Run** をクリックして実行

これにより以下が作成されます：
- `quizzes` テーブル（クイズ問題）
- `game_state` テーブル（ゲーム状態）
- `responses` テーブル（回答記録）
- `players` テーブル（参加者）
- RLSポリシー（セキュリティ設定）
- Realtimeの有効化

### 3. サンプルデータを投入（任意）

1. SQL Editor で `supabase/seed.sql` を実行
2. 5問のサンプルクイズが追加されます

### 4. 環境変数を取得

1. Supabase Dashboard → **Settings** → **API**
2. 以下をコピー：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 5. アプリケーションの環境変数を設定

#### ローカル開発の場合

```bash
cp .env.local.example .env.local
```

`.env.local` を編集：
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Vercelデプロイの場合

1. Vercel Dashboard → プロジェクト → **Settings** → **Environment Variables**
2. 上記2つの環境変数を追加

---

## ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev
```

http://localhost:3000 でアクセス

---

## 使い方

### ホスト（司会者）

1. `/host` にアクセス
2. 「投票開始」でクイズ開始
3. 「投票締切」で回答を締め切り
4. 「正解発表」で結果表示
5. 「次の問題」で次へ進む

### プレイヤー（参加者）

1. `/` にアクセスしてニックネーム入力
2. クイズ画面で4択から回答
3. 早く正解するほど高得点

---

## データベーススキーマ

### quizzes（クイズ問題）
| カラム | 型 | 説明 |
|--------|------|------|
| id | SERIAL | 主キー |
| question | TEXT | 問題文 |
| option_1〜4 | TEXT | 選択肢 |
| correct_answer_index | INT | 正解（1〜4） |
| order_num | INT | 出題順 |

### game_state（ゲーム状態）
| カラム | 型 | 説明 |
|--------|------|------|
| id | INT | 常に1（シングルトン） |
| current_quiz_id | INT | 現在の問題ID |
| status | TEXT | waiting/voting/result/ranking |
| start_time | TIMESTAMPTZ | 投票開始時刻 |

### responses（回答）
| カラム | 型 | 説明 |
|--------|------|------|
| user_id | TEXT | ユーザーID |
| nickname | TEXT | ニックネーム |
| quiz_id | INT | 問題ID |
| selected_option | INT | 選択した回答 |
| response_time_ms | INT | 回答時間（ミリ秒） |
| is_correct | BOOLEAN | 正解かどうか |
| points | INT | 獲得ポイント |

### players（参加者）
| カラム | 型 | 説明 |
|--------|------|------|
| user_id | TEXT | 主キー |
| nickname | TEXT | ニックネーム |
| total_score | INT | 合計スコア |

---

## スコア計算

- 正解時のみポイント付与
- 基本点: 1000pt
- 時間ボーナス: (10秒 - 回答時間) × 100
- 最速(0秒): 約2000pt
- 10秒: 1000pt

---

## Realtime機能

- `game_state` の変更を全クライアントに即時反映
- Broadcast機能で回答を効率的に送信
- `responses`, `players` の変更もリアルタイム同期

---

## 注意事項

- 現在のRLSポリシーは全ユーザーにアクセスを許可
- 本番運用では認証機能の追加を推奨
- 環境変数は `.env.local` に設定（Gitには含まれない）
