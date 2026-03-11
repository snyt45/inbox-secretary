import { App, TFile } from "obsidian";
import { InboxItem } from "./types";
import { ensureFolder } from "./utils";

export class InboxCleaner {
  constructor(private app: App) {}

  async cleanup(
    items: InboxItem[],
    mode: "delete" | "archive" | "keep",
    archiveFolder: string,
    onProgress?: (current: number, total: number, name: string) => void
  ): Promise<void> {
    if (mode === "keep") return;
    if (mode === "archive") {
      await ensureFolder(this.app, archiveFolder);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) continue;

      onProgress?.(i + 1, items.length, file.basename);

      if (mode === "delete") {
        await this.app.vault.trash(file, true);
      } else if (mode === "archive") {
        const newPath = `${archiveFolder}/${file.name}`;
        await this.app.vault.rename(file, newPath);
      }
    }
  }
}
