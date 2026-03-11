import { App, TFile } from "obsidian";
import { DigestEntry, TriageItem } from "./types";
import { ensureFolder } from "./utils";

export class DigestWriter {
  constructor(private app: App) {}

  async write(
    outputFolder: string,
    date: string,
    userSummary: string,
    entries: DigestEntry[],
    triageItems: TriageItem[],
    totalCount: number
  ): Promise<string> {
    await ensureFolder(this.app, outputFolder);
    const content = this.format(date, userSummary, entries, triageItems, totalCount);
    const path = `${outputFolder}/${date} デイリーダイジェスト.md`;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }

    return path;
  }

  private format(
    date: string,
    userSummary: string,
    entries: DigestEntry[],
    triageItems: TriageItem[],
    totalCount: number
  ): string {
    const pickedCount = entries.length;
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
      "## 秘書メモ",
      "",
      userSummary,
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

    const lowItems = triageItems.filter((i) => i.category === "low");
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
    lines.push(`*${totalCount}件中${pickedCount}件をピックアップ / メモリ更新済み*`);
    lines.push("");

    return lines.join("\n");
  }
}
