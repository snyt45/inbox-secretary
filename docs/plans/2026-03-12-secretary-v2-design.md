# Inbox Secretary v2 設計

## 背景

v1はInboxの全アイテムを一括要約するだけで、ユーザーに最適化された提案になっていなかった。
秘書として機能するには「選別 → 深掘り → 具体的提案」の流れと、ユーザー理解の蓄積が必要。

## 全体フロー

```
[ボタン押下]
  |
  [1/7] Inbox読み込み
  [2/7] Daily Note読み込み（14日分）
  [3/7] フィードバック・メモリ読み込み
  [4/7] Phase 1: トリアージ + メモリ更新  ← API呼び出し1回目
  [5/7] トリアージ結果通知（X件ピックアップ / Y件除外）
  [6/7] Phase 2: 深掘り提案              ← API呼び出し2回目
  [7/7] 書き出し + Inbox整理
```

API呼び出しは2回/実行。free tier（20回/日）でも1日10回実行可能。

## Phase 1: トリアージ + メモリ更新

入力:
- ユーザープロフィール（設定画面）
- 秘書メモリ（蓄積された自然言語テキスト）
- 直近5回分のトリアージログ
- Daily Note（14日分）
- 全Inboxアイテム

出力（構造化JSON）:
- userSummary: 今回のユーザー理解サマリー
- updatedMemory: 更新されたメモリ
- items: 各アイテムのhigh/low判定 + 判定理由

highの基準: 今の作業や関心に直結する、すぐ使える、知らないと損する
lowの基準: 一般的に良い記事でもこのユーザーには今関係ない

## Phase 2: 深掘り提案

入力:
- 更新済みメモリ
- Phase 1のuserSummary
- highアイテムの詳細のみ

出力（構造化JSON）:
- title: タイトル
- insight: なぜこのユーザーに関係あるか（具体的に）
- action: 何をすべきか（具体的に）
- sourceUrl: 元記事URL

「要約」ではなく「insight + action」。一般論禁止、「あなたの○○で△△できる」まで踏み込む。

## Gemini API構造化出力

GeminiClientにgenerateStructuredメソッドを追加。
responseMimeType: "application/json" と responseSchema を指定し、
APIレベルでJSON準拠を保証する。regexクリーニングは廃止。

Phase 1スキーマ:
```json
{
  "type": "OBJECT",
  "properties": {
    "userSummary": { "type": "STRING" },
    "updatedMemory": { "type": "STRING" },
    "items": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "title": { "type": "STRING" },
          "category": { "type": "STRING", "enum": ["high", "low"] },
          "reason": { "type": "STRING" }
        }
      }
    }
  }
}
```

Phase 2スキーマ:
```json
{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "title": { "type": "STRING" },
      "insight": { "type": "STRING" },
      "action": { "type": "STRING" },
      "sourceUrl": { "type": "STRING" }
    }
  }
}
```

## プロンプト設計

XMLタグで構造を明示、few-shot例で品質基準を示す、system instructionを分離。

Phase 1:
- system instruction: ユーザー専属の情報秘書として振る舞う
- <user_profile>, <secretary_memory>, <triage_history>, <daily_notes>, <inbox_items> で入力を構造化
- <examples> でhigh/low判定のサンプルを提示
- <instructions> でタスクを明確に3つ列挙（userSummary生成、メモリ更新、トリアージ）

Phase 2:
- system instruction: 一般論禁止、具体的活用提案に特化
- <secretary_memory>, <user_summary>, <selected_items> で入力を構造化
- <examples> でinsight + actionの具体度の基準を提示

## メモリシステム

保存場所: プラグインデータ（this.saveData）

```typescript
interface SecretaryMemory {
  content: string;       // LLMが書く自然言語テキスト
  lastUpdated: string;   // "2026-03-12"
}

interface TriageLog {
  date: string;
  items: {
    title: string;
    tags: string[];
    category: "high" | "low";
    reason: string;
  }[];
}
```

メモリ更新: 毎回。Phase 1の出力updatedMemoryをそのまま保存。APIコール追加なし。
トリアージログ: 毎回保存。直近5回分を保持、古いものから消す。

設定画面:
- 「秘書のメモリ」テキストエリア（8行、読み書き可能）
- 「メモリをリセット」ボタン
- 最終更新日表示

プログレッシブプロファイリング: userProfileが空でもDaily Noteとトリアージ蓄積から
メモリが育つ。userProfileは最初のブーストとして機能するが必須ではない。

## フィードバックシステム

ダイジェストは消される前提。チェックボックス方式は採用しない。

トリアージログをプラグインデータに自動蓄積する暗黙フィードバック方式。
ユーザー操作ゼロ。Phase 1のプロンプトに「過去のトリアージ傾向」として注入し、
LLMが判断の一貫性を保てるようにする。メモリ更新時にトリアージ傾向も反映。

## 透明性

実行中（Notice）:
- 各ステップの進捗を [n/7] で表示
- トリアージ結果（ピックアップ件数/除外件数）を通知
- Inbox整理は個別ノート名付きで表示

ダイジェスト出力:
- 「秘書メモ」セクション: LLMが何を読み取ったか、Daily Noteからどんな変化を検出したか
- ピックアップ: insight（なぜ関係あるか）+ action（何をすべきか）
- 除外アイテム: テーブルで理由付き一覧
- frontmatterにtriaged/picked数を記録

## ダイジェスト出力フォーマット

```markdown
---
created: 2026-03-12
tags:
  - digest
triaged: 12
picked: 4
---

# 2026-03-12 デイリーダイジェスト

## 秘書メモ

（LLMによるユーザー理解サマリー + Daily Noteからの変化検出）

## ピックアップ

### （タイトル）

（insight: なぜあなたに関係あるか）

→ （action: 具体的に何をすべきか）

Source: URL

### ...

---

## 除外したアイテム

| タイトル | 理由 |
|---------|------|
| ... | ... |

---

*N件中M件をピックアップ / メモリ更新済み*
```

## 設定項目の変更

追加:
- memory: SecretaryMemory（メモリテキストエリア + リセットボタン）
- triageLogs: TriageLog[]（内部データ、設定画面には非表示）

既存の変更:
- dailyNoteDays: デフォルトを7→14に引き上げ
- DigestEntry型を廃止し、TriageResult型 + DigestEntry型（insight/action）に分離
