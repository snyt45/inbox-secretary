import { Modal, Notice, Plugin, TFile } from "obsidian";
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
import { DigestWriter, DigestWriteParams } from "./digest-writer";
import { InboxCleaner } from "./inbox-cleaner";
import { TriageLog } from "./types";
import { digestPath, legacyDigestPath, MAX_TRIAGE_LOGS } from "./constants";

class ConfirmModal extends Modal {
  private resolved = false;
  private resolve: (value: boolean) => void;

  constructor(app: import("obsidian").App, private message: string, private promise: { resolve: (value: boolean) => void }) {
    super(app);
    this.resolve = promise.resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    buttonContainer.createEl("button", { text: "上書き実行", cls: "mod-warning" }).addEventListener("click", () => {
      this.resolved = true;
      this.resolve(true);
      this.close();
    });
    buttonContainer.createEl("button", { text: "キャンセル" }).addEventListener("click", () => {
      this.resolved = true;
      this.resolve(false);
      this.close();
    });
  }

  onClose() {
    if (!this.resolved) this.resolve(false);
  }
}

export default class InboxSecretaryPlugin extends Plugin {
  settings: InboxSecretarySettings;
  private running = false;

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

    if (this.running) {
      new Notice("ダイジェスト生成中です。完了までお待ちください");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentPath = digestPath(this.settings.digestOutputFolder, today);
    const legacy = legacyDigestPath(this.settings.digestOutputFolder, today);
    const existing = this.app.vault.getAbstractFileByPath(currentPath) ?? this.app.vault.getAbstractFileByPath(legacy);
    if (existing instanceof TFile) {
      const confirmed = await new Promise<boolean>((resolve) => {
        new ConfirmModal(this.app, `${today} のダイジェストは既に存在します。上書きしますか？`, { resolve }).open();
      });
      if (!confirmed) return;
    }

    this.running = true;
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
      const { content: dailyContext, fileCount: dailyNoteCount } = await dailyNoteReader.readRecent(
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
        triageLogs,
        this.settings.excludeTopics
      );

      // メモリ更新
      this.settings.memory = {
        content: triageResult.updatedMemory,
        lastUpdated: new Date().toISOString().slice(0, 10),
      };

      // トリアージログ保存
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
      const rawEntries = await insightGenerator.generate(
        selectedItems,
        triageResult.updatedMemory,
        triageResult.userSummary,
        triageResult.items,
        dailyContext,
        this.settings.userProfile
      );

      // LLMに頼らず元データからURLをマッピング
      const entries = rawEntries.map((entry) => {
        const original = selectedItems.find((item) => item.title === entry.title);
        return {
          ...entry,
          sourceUrl: entry.sourceUrl || original?.frontmatter.url,
        };
      });

      // [7/7] 書き出し + Inbox整理
      notice.setMessage("[7/7] ダイジェストを書き出し中...");
      const writer = new DigestWriter(this.app);
      const writeParams: DigestWriteParams = {
        outputFolder: this.settings.digestOutputFolder,
        date: today,
        userSummary: triageResult.userSummary,
        entries,
        triageItems: triageResult.items,
        totalCount: items.length,
        dailyNoteDays: this.settings.dailyNoteDays,
        dailyNoteCount,
        memoryExists: !!memory.content,
        triageLogCount: triageLogs.length,
        model: this.settings.geminiModel,
      };
      const path = await writer.write(writeParams);

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
    } finally {
      this.running = false;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
