import { Notice, Plugin } from "obsidian";
import {
  InboxSecretarySettings,
  DEFAULT_SETTINGS,
  InboxSecretarySettingTab,
} from "./settings";
import { InboxReader } from "./inbox-reader";
import { DailyNoteReader } from "./daily-note-reader";
import { GeminiClient } from "./gemini-client";
import { DigestGenerator } from "./digest-generator";
import { DigestWriter } from "./digest-writer";
import { InboxCleaner } from "./inbox-cleaner";

export default class InboxSecretaryPlugin extends Plugin {
  settings: InboxSecretarySettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new InboxSecretarySettingTab(this.app, this));

    this.addRibbonIcon("inbox", "デイリーダイジェスト生成", () => {
      this.generateDigest();
    });

    this.addCommand({
      id: "generate-daily-digest",
      name: "デイリーダイジェスト生成",
      callback: () => this.generateDigest(),
    });
  }

  private async generateDigest() {
    if (!this.settings.geminiApiKey) {
      new Notice("Gemini APIキーが設定されていません");
      return;
    }

    new Notice("ダイジェスト生成中...");

    try {
      const inboxReader = new InboxReader(this.app);
      const items = await inboxReader.readAll(this.settings.inboxFolder);

      if (items.length === 0) {
        new Notice("Inboxにアイテムがありません");
        return;
      }

      const dailyNoteReader = new DailyNoteReader(this.app);
      const context = await dailyNoteReader.readRecent(
        this.settings.dailyNoteFolder,
        3
      );

      const client = new GeminiClient(this.settings.geminiApiKey);
      const generator = new DigestGenerator(client);
      const entries = await generator.generate(items, context);

      const writer = new DigestWriter(this.app);
      const today = new Date().toISOString().slice(0, 10);
      const path = await writer.write(
        this.settings.digestOutputFolder,
        today,
        entries
      );

      const cleaner = new InboxCleaner(this.app);
      await cleaner.cleanup(
        items,
        this.settings.cleanupMode,
        this.settings.archiveFolder
      );

      new Notice(`ダイジェスト生成完了（${entries.length}件）: ${path}`);
    } catch (error) {
      console.error("Inbox Secretary error:", error);
      new Notice(`エラー: ${error.message}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
