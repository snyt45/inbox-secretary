import { App, TFile } from "obsidian";
import { DigestEntry, TriageItem } from "./types";
import { ensureFolder } from "./utils";
import { digestPath, DIGEST_FILENAME_SUFFIX } from "./constants";

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
    const path = digestPath(params.outputFolder, params.date);

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
      `# ${date} ${DIGEST_FILENAME_SUFFIX}`,
      "",
      userSummary,
      "",
    ];

    for (const entry of entries) {
      lines.push(`> [!tip] ${entry.title}`);
      lines.push(`> ${entry.insight}`);
      lines.push(`> **Next:** ${entry.action}`);
      if (entry.sourceUrl) {
        lines.push(`> [元記事](${entry.sourceUrl})`);
      }
      lines.push("");
    }

    if (lowItems.length > 0) {
      lines.push(`> [!note]- 除外アイテム（${lowItems.length}件）`);
      for (const item of lowItems) {
        lines.push(`> - **${item.title}** -- ${item.reason}`);
      }
      lines.push("");
    }

    lines.push("> [!abstract]- プロセス情報");
    lines.push(`> - モデル: ${model}`);
    lines.push(`> - Daily Note: ${dailyNoteDays}日分（${dailyNoteCount}件ヒット）`);
    lines.push(`> - メモリ: ${memoryExists ? "蓄積済み" : "初回実行"}`);
    lines.push(`> - トリアージ履歴: ${triageLogCount}回分`);
    lines.push(`> - 結果: ${totalCount}件 → ${pickedCount}件ピックアップ / ${lowItems.length}件除外`);
    lines.push("");

    return lines.join("\n");
  }
}
