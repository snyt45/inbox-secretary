import { App, TFolder } from "obsidian";

export async function ensureFolder(app: App, path: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(path) instanceof TFolder) return;
  await app.vault.createFolder(path);
}
