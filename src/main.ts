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

    const notice = new Notice("ダイジェスト生成中...", 0);

    try {
      notice.setMessage("[1/5] Inboxを読み込み中...");
      const inboxReader = new InboxReader(this.app);
      const items = await inboxReader.readAll(this.settings.inboxFolder);

      if (items.length === 0) {
        notice.hide();
        new Notice("Inboxにアイテムがありません");
        return;
      }

      notice.setMessage(`[2/5] デイリーノートを読み込み中...（Inbox: ${items.length}件）`);
      const dailyNoteReader = new DailyNoteReader(this.app);
      const context = await dailyNoteReader.readRecent(
        this.settings.dailyNoteFolder,
        this.settings.dailyNoteDays
      );

      notice.setMessage(`[3/5] LLMでダイジェスト生成中...（${items.length}件）`);
      const client = new GeminiClient(this.settings.geminiApiKey, this.settings.geminiModel);
      const generator = new DigestGenerator(client);
      const entries = await generator.generate(items, context, this.settings.userProfile);

      notice.setMessage("[4/5] ダイジェストを書き出し中...");
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
        this.settings.archiveFolder,
        (current, total, name) => {
          notice.setMessage(`[5/5] Inboxを整理中...（${current}/${total}）${name}`);
        }
      );

      notice.hide();
      new Notice(`ダイジェスト生成完了（${entries.length}件）: ${path}`);
    } catch (error) {
      console.error("Inbox Secretary error:", error);
      notice.hide();
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
