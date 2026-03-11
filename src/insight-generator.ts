import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

const INSIGHT_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書です。

出力ルール:
- insightは1-2文。「あなたは○○に関心があります」のような前置きは書くな。記事の何がユーザーの今の作業にどう刺さるかだけ書け
- actionは1文。「検討してください」「活用してください」は禁止。「○○を試す」「○○に適用する」のように具体的な動詞で終わらせろ
- 記事の要約は書くな。ユーザーは記事を自分で読める。秘書の仕事は「なぜ今読むべきか」と「読んだ後に何をすべきか」だけ伝えること
- 冗長な敬語は使うな。簡潔に、同僚に話すように書け`;

const INSIGHT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "アイテムのタイトル（短く）" },
      insight: {
        type: "STRING",
        description: "1-2文。なぜ今の作業に刺さるか。前置き不要、核心だけ",
      },
      action: {
        type: "STRING",
        description: "1文。読んだ後に何をすべきか。具体的な動詞で終わる",
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
insight: 今のinbox-secretaryのmain.tsがコマンド追加のたびに肥大化する問題を、スキルベースの動的ロード設計で解決できる。
action: main.tsのaddCommand部分をスキル単位のモジュールに分離する。
</example>
<example>
アイテム: Ruby 3.4のパターンマッチング改善
insight: 仕事のRailsプロジェクトで条件分岐が複雑になっているコントローラに、in演算子のパターンマッチが効く。
action: 複雑なcase文がある箇所をパターンマッチで書き直して可読性を比較する。
</example>
</examples>

<instructions>
各アイテムについて、insightとactionを書け。
insightは「なぜ今読むべきか」、actionは「読んだ後に何をすべきか」。それ以外は書くな。
</instructions>`;

    return this.client.generateStructured<DigestEntry[]>(
      INSIGHT_SYSTEM_INSTRUCTION,
      prompt,
      INSIGHT_SCHEMA
    );
  }
}
