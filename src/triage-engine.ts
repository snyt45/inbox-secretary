import { GeminiClient } from "./gemini-client";
import { InboxItem, TriageResult, TriageLog, SecretaryMemory } from "./types";

const TRIAGE_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書です。ユーザーのことを深く理解し、本当に必要な情報だけを届けることが仕事です。`;

const TRIAGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    userSummary: {
      type: "STRING",
      description: "今回のユーザー理解サマリー。現在の状況・関心・進行中の作業を具体的に記述",
    },
    updatedMemory: {
      type: "STRING",
      description: "更新されたメモリ。必ず以下の4セクションで構成: ## 今のフォーカス（今週取り組んでいる具体的な作業）/ ## 技術スタック / ## 追っているテーマ（3-5個）/ ## 今は追わないもの",
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "アイテムのタイトル" },
          category: {
            type: "STRING",
            enum: ["high", "low"],
            description: "high: 今の作業に直接使える/今週試す価値あり。low: 今すぐは不要",
          },
          reason: { type: "STRING", description: "判定理由を1-2文で" },
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
${memory.content || "（まだメモリがありません。以下の4セクションで構築してください: ## 今のフォーカス / ## 技術スタック / ## 追っているテーマ / ## 今は追わないもの）"}
</secretary_memory>
${excludeSection}

<triage_history>
${triageHistorySummary || "（過去の履歴なし）"}
</triage_history>

<daily_notes>
${dailyNoteContext || "（Daily Noteなし）"}
</daily_notes>

<inbox_items>
${itemsSummary}
</inbox_items>

<instructions>
以下の3つを実行してください。

1. Daily Noteとメモリから、ユーザーの現在の状況・関心・進行中の作業を把握し、userSummaryとして出力する

2. secretaryMemoryを更新する。必ず以下の4セクション構成で出力すること:
   ## 今のフォーカス（今週取り組んでいる具体的な作業。1-2行）
   ## 技術スタック（使っている言語・フレームワーク・ツール）
   ## 追っているテーマ（3-5個。具体的に）
   ## 今は追わないもの（興味はあるが今は優先しないトピック）
   新しく読み取れた情報があればマージし、古くなった情報は更新する

3. 各Inboxアイテムについて、このユーザーに関係あるかをhigh/lowで判定する
   highにできるのは最大でも全体の3割まで。10件あればhighは最大3件、30件なら最大9件。
   highの基準: 今まさに取り組んでいる作業に直接使える具体的な情報がある
   lowの基準: 良い記事でも今の具体的な作業に直結しない。「いつか役立つ」はlow
</instructions>

<examples>
<example>
ユーザー: Obsidianプラグインを開発中のTypeScriptエンジニア
アイテム: 「React Server Componentsの深掘り」
判定: high
理由: Reactを使っておりServer Componentsの知識が直接活きる

アイテム: 「Kubernetes 1.32のリリースノート」
判定: low
理由: インフラ運用は現在のスコープ外
</example>
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
