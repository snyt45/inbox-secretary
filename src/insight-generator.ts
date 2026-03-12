import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry, TriageItem } from "./types";

const INSIGHT_SYSTEM_INSTRUCTION = `ユーザー専属の情報秘書。同僚に口頭で伝えるようなトーンで書く。

書き方:
- 記事の要約はしない。ユーザーは自分で読む
- 「なぜ今か」と「読んだ後に何をするか」だけ伝える
- 敬語は使わない。体言止めや命令形でいい`;

const INSIGHT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "アイテムのタイトル" },
      insight: { type: "STRING", description: "なぜ今読むべきか" },
      action: { type: "STRING", description: "読んだ後にやること" },
      sourceUrl: { type: "STRING", description: "SourceのURL" },
    },
    required: ["title", "insight", "action"],
  },
};

export class InsightGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    userProfile: string,
    userSummary: string,
    triageItems: TriageItem[]
  ): Promise<DigestEntry[]> {
    const triageReasonMap = new Map(
      triageItems.filter((i) => i.category === "high").map((i) => [i.title, i.reason])
    );

    const itemsBlock = items
      .map((item) => {
        const reason = triageReasonMap.get(item.title) ?? "";
        return `<item>\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\nトリアージ理由: ${reason}\n\n${item.body}\n</item>`;
      })
      .join("\n\n");

    const prompt = `<user_profile>
${userProfile || "（未設定）"}
</user_profile>

<user_summary>
${userSummary}
</user_summary>

<selected_items>
${itemsBlock}
</selected_items>

<instructions>
各アイテムにinsightとactionを書く。

insightのルール:
- 1-2文。ユーザーの今の作業と記事の接点だけ書く
- 「この記事は〜」「あなたは〜に関心が〜」で始めない
- トリアージ理由を手がかりに、具体的な接点を掘り下げる

actionのルール:
- 1文。読んだ後の具体的な行動。動詞で終わる
- 「検討する」「活用する」「参考にする」は使わない。もっと具体的に
</instructions>

<examples>
<example_bad>
アイテム: Claude Code 4.6のスキル機能
insight: この記事はClaude Codeの新しいスキル機能について解説しており、あなたのプラグイン開発に活用できる可能性があります。
action: スキル機能の導入を検討してください。
</example_bad>
<example_good>
アイテム: Claude Code 4.6のスキル機能
insight: main.tsのaddCommand部分が肥大化している問題に、スキルベースの動的ロード設計が使える。
action: main.tsのコマンド登録をスキル単位のモジュールに分離する。
</example_good>

<example_bad>
アイテム: Ruby 3.4のパターンマッチング改善
insight: Ruby 3.4のパターンマッチングが改善され、あなたのRailsプロジェクトのコード品質向上に貢献できるでしょう。
action: パターンマッチングの活用を検討してみてください。
</example_bad>
<example_good>
アイテム: Ruby 3.4のパターンマッチング改善
insight: 仕事のRailsプロジェクトで条件分岐が複雑になっているコントローラに、in演算子のパターンマッチが効く。
action: 複雑なcase文がある箇所をパターンマッチで書き直して可読性を比較する。
</example_good>
</examples>`;

    return this.client.generateStructured<DigestEntry[]>(
      INSIGHT_SYSTEM_INSTRUCTION,
      prompt,
      INSIGHT_SCHEMA
    );
  }
}
