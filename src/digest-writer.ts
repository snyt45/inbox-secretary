import { App, TFile, TFolder } from "obsidian";
import { DigestEntry } from "./types";
import { digestPath, DIGEST_FILENAME_SUFFIX } from "./constants";

export interface DigestWriteParams {
  outputFolder: string;
  date: string;
  entries: DigestEntry[];
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
    const { date, entries, totalCount } = params;
    const pickedCount = entries.length;

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
      `${pickedCount}件ピックアップ / ${totalCount}件中`,
      "",
    ];

    for (const entry of entries) {
      lines.push(`> [!example] ${entry.title}`);
      lines.push(`> **Try:** ${entry.action}`);
      lines.push(`>`);
      const sourcePart = entry.sourceUrl ? ` [Read →](${entry.sourceUrl})` : "";
      lines.push(`> ${entry.insight}${sourcePart}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
