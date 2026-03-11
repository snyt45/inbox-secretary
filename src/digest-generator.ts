import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

export class DigestGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    dailyNoteContext: string,
    userProfile: string,
    onProgress?: (current: number, total: number, name: string) => void
  ): Promise<DigestEntry[]> {
    const profileSection = userProfile
      ? `## ユーザープロフィール\n${userProfile}`
      : "";

    const contextBlock = `あなたはユーザーの秘書です。${profileSection}

## ユーザーの最近の関心事（Daily Noteより）
${dailyNoteContext || "（Daily Noteなし）"}`;

    const entries: DigestEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      onProgress?.(i + 1, items.length, item.title);

      const itemBlock = `タイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}`;

      const prompt = `${contextBlock}

## Inboxのアイテム
${itemBlock}

## タスク
このアイテムについて、以下のJSONオブジェクトを生成してください。

- title: アイテムのタイトル（短く）
- summary: 内容の要約（2-3文）
- recommendation: 「ユーザーにとってこう使える」という具体的な提案（1-2文）。ユーザーの現在の関心事や進行中のプロジェクトと結びつけて提案する。
- sourceUrl: 元記事のURL（あれば）

JSONのみ出力してください。マークダウンのコードブロックで囲わないでください。`;

      const response = await this.client.generateContent(prompt);
      const cleaned = response.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
      const parsed = JSON.parse(cleaned);
      const entry = Array.isArray(parsed) ? parsed[0] : parsed;
      entries.push(entry as DigestEntry);
    }

    return entries;
  }
}
