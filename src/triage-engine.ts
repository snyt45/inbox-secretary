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
      description: "更新されたメモリ。新情報をマージし古い情報を更新。変化なければ既存のまま",
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
    triageLogs: TriageLog[]
  ): Promise<TriageResult> {
    const itemsSummary = items
      .map(
        (item, i) =>
          `<item index="${i + 1}">\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}\n</item>`
      )
      .join("\n\n");

    const triageHistorySummary = this.formatTriageLogs(triageLogs);

    const prompt = `<user_profile>
${userProfile || "（未設定）"}
</user_profile>

<secretary_memory>
${memory.content || "（まだメモリがありません。今回の情報から構築してください）"}
</secretary_memory>

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

2. secretaryMemoryを更新する。新しく読み取れた情報があればマージし、古くなった情報は更新する。変化がなければ既存のまま返す

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
