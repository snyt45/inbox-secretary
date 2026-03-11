import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

export class DigestGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    dailyNoteContext: string,
    userProfile: string
  ): Promise<DigestEntry[]> {
    const itemsSummary = items
      .map(
        (item, i) =>
          `### アイテム${i + 1}: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}`
      )
      .join("\n\n---\n\n");

    const profileSection = userProfile
      ? `## ユーザープロフィール\n${userProfile}`
      : "";

    const prompt = `あなたはユーザーの秘書です。${profileSection}

## ユーザーの最近の関心事（Daily Noteより）
${dailyNoteContext || "（Daily Noteなし）"}

## Inboxにあるアイテム
${itemsSummary}

## タスク
各アイテムについて、以下のJSON配列を生成してください。

各エントリ:
- title: アイテムのタイトル（短く）
- summary: 内容の要約（2-3文）
- recommendation: 「ユーザーにとってこう使える」という具体的な提案（1-2文）。ユーザーの現在の関心事や進行中のプロジェクトと結びつけて提案する。
- sourceUrl: 元記事のURL（あれば）

JSONのみ出力してください。マークダウンのコードブロックで囲わないでください。`;

    const response = await this.client.generateContent(prompt);
    return JSON.parse(response) as DigestEntry[];
  }
}
