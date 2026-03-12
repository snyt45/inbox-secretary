import { App, TFile, TFolder } from "obsidian";
import { DigestEntry, TriageItem } from "./types";
import { digestPath, DIGEST_FILENAME_SUFFIX } from "./constants";

export interface DigestWriteParams {
  outputFolder: string;
  date: string;
  userSummary: string;
  entries: DigestEntry[];
  triageItems: TriageItem[];
  totalCount: number;
}

export class DigestWriter {
  constructor(private app: App) {}

  async write(params: DigestWriteParams): Promise<string> {
    const folder = params.outputFolder;
    if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
      await this.app.vault.createFolder(folder);
    }

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
    const { date, userSummary, entries, triageItems, totalCount } = params;
    const pickedCount = entries.length;
    const lowCount = triageItems.filter((i) => i.category === "low").length;

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
        lines.push(`> [Source](${entry.sourceUrl})`);
      }
      lines.push("");
    }

    if (lowCount > 0) {
      lines.push(`*${lowCount}件を除外*`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
