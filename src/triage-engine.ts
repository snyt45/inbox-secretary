import { GeminiClient } from "./gemini-client";
import { InboxItem, TriageResult, TriageLog, SecretaryMemory } from "./types";

const TRIAGE_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書。週に数回、ユーザーのInboxを整理して本当に今必要な情報だけを選り分ける。

振る舞い:
- ユーザーの「今やっていること」に直結するかどうかだけで判断する
- 良い記事かどうかは関係ない。ユーザーが今週手を動かす作業に使えるかだけ見る
- 迷ったらlowにする。highは確信があるものだけ`;

const TRIAGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    userSummary: {
      type: "STRING",
      description: "ユーザーの現在の状況と今週の作業内容",
    },
    updatedMemory: {
      type: "STRING",
      description: "4セクション構成のメモリ全文",
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "元のアイテムタイトル" },
          category: {
            type: "STRING",
            enum: ["high", "low"],
            description: "判定結果",
          },
          reason: { type: "STRING", description: "判定理由" },
        },
        required: ["title", "category", "reason"],
      },
    },
  },
  required: ["userSummary", "updatedMemory", "items"],
};

export class TriageEngine {
  constructor(private client: GeminiClient) {}

  async run(
    items: InboxItem[],
    dailyNoteContext: string,
    userProfile: string,
    memory: SecretaryMemory,
    triageLogs: TriageLog[],
    excludeTopics: string
  ): Promise<TriageResult> {
    const itemsSummary = items
      .map(
        (item, i) =>
          `<item index="${i + 1}">\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}\n</item>`
      )
      .join("\n\n");

    const triageHistorySummary = this.formatTriageLogs(triageLogs);

    const excludeSection = excludeTopics.trim()
      ? `\n<exclude_topics>\n以下のトピックに該当するアイテムは必ずlowにすること:\n${excludeTopics}\n</exclude_topics>\n`
      : "";

    const prompt = `<user_profile>
${userProfile || "（未設定）"}
</user_profile>

<secretary_memory>
${memory.content || "（初回実行。以下の4セクションで構築すること: ## 今のフォーカス / ## 技術スタック / ## 追っているテーマ / ## 今は追わないもの）"}
</secretary_memory>

<daily_notes>
${dailyNoteContext || "（Daily Noteなし）"}
</daily_notes>
${excludeSection}

<triage_history>
${triageHistorySummary || "（過去の履歴なし）"}
</triage_history>

<inbox_items>
${itemsSummary}
</inbox_items>

<instructions>
ステップ1: ユーザー理解
Daily Noteとメモリを読み、ユーザーが今週何に手を動かしているか把握する。userSummaryに書く。

ステップ2: メモリ更新
以下の4セクション構成で出力する。前回のメモリに新しく読み取れた情報をマージし、古い情報は上書きする。
## 今のフォーカス
今週取り組んでいる具体的な作業。1-2行。
## 技術スタック
使っている言語・フレームワーク・ツール。
## 追っているテーマ
3-5個。具体的に。
## 今は追わないもの
興味はあるが今は手を出さないトピック。

ステップ3: トリアージ
各アイテムをhigh/lowに分類する。

highの条件（すべて満たすこと）:
- ユーザーが今週やっている作業に直接使える
- 読んだ後に具体的なアクションが取れる
- highは全体の3割以下に収める

以下は必ずlow:
- 「知っておくと良い」程度の情報
- ユーザーの技術スタックと無関係
- 今の作業でなく将来役立ちそうなもの
</instructions>

<examples>
<example_high>
ユーザーの状況: ObsidianプラグインをTypeScriptで開発中。esbuildでビルドしている。
アイテム: 「esbuild 0.25の破壊的変更まとめ」
判定: high
理由: 今使っているesbuildのメジャーアップデート。ビルド設定の変更が必要か確認できる。
</example_high>

<example_low>
ユーザーの状況: ObsidianプラグインをTypeScriptで開発中。
アイテム: 「TypeScript 5.8の新機能まとめ」
判定: low
理由: TypeScriptは使っているが、新機能を今の作業に適用する具体的な場面がない。
</example_low>

<example_low_borderline>
ユーザーの状況: ObsidianプラグインをTypeScriptで開発中。Gemini APIを使っている。
アイテム: 「LLMプロンプトエンジニアリング最新テクニック10選」
判定: low
理由: 関連はあるが、汎用的なテクニック集で今の実装に直接使える情報かわからない。
</example_low_borderline>
</examples>`;

    return this.client.generateStructured<TriageResult>(
      TRIAGE_SYSTEM_INSTRUCTION,
      prompt,
      TRIAGE_SCHEMA
    );
  }

  private formatTriageLogs(logs: TriageLog[]): string {
    if (logs.length === 0) return "";
    return logs
      .map((log) => {
        const highs = log.items.filter((i) => i.category === "high").map((i) => i.title);
        const lows = log.items.filter((i) => i.category === "low").map((i) => i.title);
        return `${log.date}: high=[${highs.join(", ")}] low=[${lows.join(", ")}]`;
      })
      .join("\n");
  }
}
