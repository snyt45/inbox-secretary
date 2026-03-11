import { App, TFile } from "obsidian";

export class DailyNoteReader {
  constructor(private app: App) {}

  async readRecent(
    dailyNoteFolder: string,
    days: number = 3
  ): Promise<string> {
    const notes: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const fileName = this.formatDate(date);
      const path = `${dailyNoteFolder}/${fileName}.md`;

      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        notes.push(`## ${fileName}\n${content}`);
      }
    }

    return notes.join("\n\n");
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
