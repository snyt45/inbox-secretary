import { Notice, Plugin } from "obsidian";
import {
  InboxSecretarySettings,
  DEFAULT_SETTINGS,
  InboxSecretarySettingTab,
} from "./settings";
import { InboxReader } from "./inbox-reader";
import { DailyNoteReader } from "./daily-note-reader";
import { GeminiClient } from "./gemini-client";
import { TriageEngine } from "./triage-engine";
import { InsightGenerator } from "./insight-generator";
import { DigestWriter } from "./digest-writer";
import { InboxCleaner } from "./inbox-cleaner";
import { TriageLog } from "./types";

const MAX_TRIAGE_LOGS = 5;

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
      // [1/7] Inbox読み込み
      notice.setMessage("[1/7] Inbox読み込み中...");
      const inboxReader = new InboxReader(this.app);
      const items = await inboxReader.readAll(this.settings.inboxFolder);

      if (items.length === 0) {
        notice.hide();
        new Notice("Inboxにアイテムがありません");
        return;
      }

      // [2/7] Daily Note読み込み
      notice.setMessage(`[2/7] Daily Note読み込み中...（${this.settings.dailyNoteDays}日分）`);
      const dailyNoteReader = new DailyNoteReader(this.app);
      const dailyContext = await dailyNoteReader.readRecent(
        this.settings.dailyNoteFolder,
        this.settings.dailyNoteDays
      );

      // [3/7] メモリ読み込み
      notice.setMessage("[3/7] メモリ・トリアージ履歴を読み込み中...");
      const { memory, triageLogs } = this.settings;

      // [4/7] Phase 1: トリアージ
      notice.setMessage(`[4/7] トリアージ中...（${items.length}件を選別）`);
      const client = new GeminiClient(this.settings.geminiApiKey, this.settings.geminiModel);
      const triageEngine = new TriageEngine(client);
      const triageResult = await triageEngine.run(
        items,
        dailyContext,
        this.settings.userProfile,
        memory,
        triageLogs
      );

      // メモリ更新
      this.settings.memory = {
        content: triageResult.updatedMemory,
        lastUpdated: new Date().toISOString().slice(0, 10),
      };

      // トリアージログ保存
      const today = new Date().toISOString().slice(0, 10);
      const newLog: TriageLog = {
        date: today,
        items: triageResult.items.map((ti) => ({
          title: ti.title,
          tags: items.find((item) => item.title === ti.title)?.frontmatter.tags ?? [],
          category: ti.category,
          reason: ti.reason,
        })),
      };
      this.settings.triageLogs = [...triageLogs, newLog].slice(-MAX_TRIAGE_LOGS);
      await this.saveSettings();

      // [5/7] トリアージ結果通知
      const highItems = triageResult.items.filter((i) => i.category === "high");
      const lowCount = triageResult.items.filter((i) => i.category === "low").length;
      notice.setMessage(`[5/7] トリアージ完了: ${highItems.length}件をピックアップ / ${lowCount}件を除外`);

      // highアイテムがない場合
      if (highItems.length === 0) {
        notice.hide();
        new Notice("今回ピックアップするアイテムはありませんでした");
        return;
      }

      // highのInboxItemを抽出
      const highTitles = new Set(highItems.map((i) => i.title));
      const selectedItems = items.filter((item) => highTitles.has(item.title));

      // 少し間を置いてユーザーが数字を認識できるようにする
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // [6/7] Phase 2: 深掘り提案
      notice.setMessage(`[6/7] ピックアップした記事の深掘り中...（${selectedItems.length}件）`);
      const insightGenerator = new InsightGenerator(client);
      const entries = await insightGenerator.generate(
        selectedItems,
        triageResult.updatedMemory,
        triageResult.userSummary
      );

      // [7/7] 書き出し + Inbox整理
      notice.setMessage("[7/7] ダイジェストを書き出し中...");
      const writer = new DigestWriter(this.app);
      const path = await writer.write(
        this.settings.digestOutputFolder,
        today,
        triageResult.userSummary,
        entries,
        triageResult.items,
        items.length
      );

      const cleaner = new InboxCleaner(this.app);
      await cleaner.cleanup(
        items,
        this.settings.cleanupMode,
        this.settings.archiveFolder,
        (current, total, name) => {
          notice.setMessage(`[7/7] Inboxを整理中...（${current}/${total}）${name}`);
        }
      );

      notice.hide();
      new Notice(`ダイジェスト生成完了（${entries.length}件ピックアップ / ${items.length}件中）: ${path}`);
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
