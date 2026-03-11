import { App, TFile } from "obsidian";
import { DigestEntry, TriageItem } from "./types";
import { ensureFolder } from "./utils";

export interface DigestWriteParams {
  outputFolder: string;
  date: string;
  userSummary: string;
  entries: DigestEntry[];
  triageItems: TriageItem[];
  totalCount: number;
  dailyNoteDays: number;
  dailyNoteCount: number;
  memoryExists: boolean;
  triageLogCount: number;
  model: string;
}

export class DigestWriter {
  constructor(private app: App) {}

  async write(params: DigestWriteParams): Promise<string> {
    await ensureFolder(this.app, params.outputFolder);
    const content = this.format(params);
    const path = `${params.outputFolder}/${params.date} デイリーダイジェスト.md`;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }

    return path;
  }

  private format(params: DigestWriteParams): string {
    const {
      date, userSummary, entries, triageItems, totalCount,
      dailyNoteDays, dailyNoteCount, memoryExists, triageLogCount, model,
    } = params;
    const pickedCount = entries.length;
    const lowItems = triageItems.filter((i) => i.category === "low");

    const lines: string[] = [
      "---",
      `created: ${date}`,
      "tags:",
      "  - digest",
      `triaged: ${totalCount}`,
      `picked: ${pickedCount}`,
      "---",
      `# ${date} デイリーダイジェスト`,
      "",
      "## ピックアップ",
      "",
    ];

    for (const entry of entries) {
      lines.push(`### ${entry.title}`);
      lines.push("");
      lines.push(entry.insight);
      lines.push("");
      lines.push(`→ ${entry.action}`);
      if (entry.sourceUrl) {
        lines.push("");
        lines.push(`Source: ${entry.sourceUrl}`);
      }
      lines.push("");
    }

    if (lowItems.length > 0) {
      lines.push("---");
      lines.push("");
      lines.push("## 除外したアイテム");
      lines.push("");
      lines.push("| タイトル | 理由 |");
      lines.push("|---------|------|");
      for (const item of lowItems) {
        lines.push(`| ${item.title} | ${item.reason} |`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push("## プロセス");
    lines.push("");
    lines.push(`- モデル: ${model}`);
    lines.push(`- Daily Note: ${dailyNoteDays}日分を参照（${dailyNoteCount}件見つかった）`);
    lines.push(`- メモリ: ${memoryExists ? "あり（蓄積済み）" : "なし（初回実行）"}`);
    lines.push(`- トリアージ履歴: ${triageLogCount}回分`);
    lines.push(`- 結果: ${totalCount}件中${pickedCount}件をピックアップ / ${lowItems.length}件を除外`);
    lines.push("");

    lines.push("## 秘書メモ");
    lines.push("");
    const summaryLines = userSummary.split("\n");
    for (const line of summaryLines) {
      lines.push(`> ${line}`);
    }
    lines.push("");

    return lines.join("\n");
  }
}
