import { App, TFile } from "obsidian";
import { DigestEntry } from "./types";
import { ensureFolder } from "./utils";

export class DigestWriter {
  constructor(private app: App) {}

  async write(
    outputFolder: string,
    date: string,
    entries: DigestEntry[]
  ): Promise<string> {
    await ensureFolder(this.app, outputFolder);
    const content = this.format(date, entries);
    const path = `${outputFolder}/${date} デイリーダイジェスト.md`;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }

    return path;
  }

  private format(date: string, entries: DigestEntry[]): string {
    const lines: string[] = [
      "---",
      `created: ${date}`,
      "tags:",
      "  - digest",
      "---",
      `# ${date} デイリーダイジェスト`,
      "",
    ];

    for (const entry of entries) {
      lines.push(`## ${entry.title}`);
      lines.push("");
      lines.push(entry.summary);
      lines.push("");
      lines.push(`→ ${entry.recommendation}`);
      if (entry.sourceUrl) {
        lines.push("");
        lines.push(`Source: ${entry.sourceUrl}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
