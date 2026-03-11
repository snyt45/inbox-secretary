import { App, TFile } from "obsidian";
import { InboxItem } from "./types";

export class InboxCleaner {
  constructor(private app: App) {}

  async cleanup(
    items: InboxItem[],
    mode: "delete" | "archive" | "keep",
    archiveFolder: string
  ): Promise<void> {
    if (mode === "keep") return;

    for (const item of items) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) continue;

      if (mode === "delete") {
        await this.app.vault.trash(file, true);
      } else if (mode === "archive") {
        const newPath = `${archiveFolder}/${file.name}`;
        await this.app.vault.rename(file, newPath);
      }
    }
  }
}
