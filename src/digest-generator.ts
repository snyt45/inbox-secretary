import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

export class DigestGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    dailyNoteContext: string
  ): Promise<DigestEntry[]> {
    const itemsSummary = items
      .map(
        (item, i) =>
          `### アイテム${i + 1}: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}`
      )
      .join("\n\n---\n\n");

    const prompt = `あなたは「ゆうた」の秘書です。ゆうたはフルスタックエンジニア（Ruby, TypeScript, React）で、AI/LLM活用、開発ツール改善、Obsidian/PKM、個人開発に興味があります。

## ゆうたの最近の関心事（Daily Noteより）
${dailyNoteContext || "（Daily Noteなし）"}

## Inboxにあるアイテム
${itemsSummary}

## タスク
各アイテムについて、以下のJSON配列を生成してください。

各エントリ:
- title: アイテムのタイトル（短く）
- summary: 内容の要約（2-3文）
- recommendation: 「ゆうたにとってこう使える」という具体的な提案（1-2文）。ゆうたの現在の関心事や進行中のプロジェクトと結びつけて提案する。
- sourceUrl: 元記事のURL（あれば）

JSONのみ出力してください。マークダウンのコードブロックで囲わないでください。`;

    const response = await this.client.generateContent(prompt);
    return JSON.parse(response) as DigestEntry[];
  }
}
