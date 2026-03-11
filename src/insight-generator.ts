import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

const INSIGHT_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書です。
選別済みの記事について、このユーザーが具体的にどう活用できるかを提案してください。
「参考になるでしょう」「役立つかもしれません」のような一般論は禁止。
「あなたの○○で△△できる」「今やっている○○に直接使える」まで踏み込むこと。`;

const INSIGHT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "アイテムのタイトル（短く）" },
      insight: {
        type: "STRING",
        description: "なぜこのユーザーに関係あるか。具体的な文脈と結びつけて説明",
      },
      action: {
        type: "STRING",
        description: "具体的に何をすべきか。ファイル名やツール名まで踏み込む",
      },
      sourceUrl: { type: "STRING", description: "元記事のURL（あれば）" },
    },
    required: ["title", "insight", "action"],
  },
};

export class InsightGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    memory: string,
    userSummary: string
  ): Promise<DigestEntry[]> {
    const itemsBlock = items
      .map(
        (item) =>
          `<item>\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}\n</item>`
      )
      .join("\n\n");

    const prompt = `<secretary_memory>
${memory}
</secretary_memory>

<user_summary>
${userSummary}
</user_summary>

<selected_items>
${itemsBlock}
</selected_items>

<examples>
<example>
アイテム: Claude Code 4.6のスキル機能
insight: 今開発中のObsidianプラグインで、コマンド追加のたびにmain.tsが肥大化している。スキルの仕組みを参考に、各機能を独立モジュールとして動的ロードする設計にできる。
action: src/main.tsのaddCommand部分を見直し、DigestGeneratorのように機能単位でクラス分離するリファクタリングを検討する。
</example>
</examples>

<instructions>
各アイテムについて、このユーザーが具体的にどう活用できるかをinsightとactionで提案してください。
一般的な要約は不要。このユーザーの今の状況にどう刺さるかだけを書いてください。
</instructions>`;

    return this.client.generateStructured<DigestEntry[]>(
      INSIGHT_SYSTEM_INSTRUCTION,
      prompt,
      INSIGHT_SCHEMA
    );
  }
}
