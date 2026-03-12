import { Modal, Notice, Plugin, TFile } from "obsidian";
import {
  InboxSecretarySettings,
  DEFAULT_SETTINGS,
  InboxSecretarySettingTab,
} from "./settings";
import { InboxReader } from "./inbox-reader";
import { GeminiClient } from "./gemini-client";
import { TriageEngine } from "./triage-engine";
import { InsightGenerator } from "./insight-generator";
import { DigestWriter, DigestWriteParams } from "./digest-writer";
import { InboxCleaner } from "./inbox-cleaner";
import { digestPath, legacyDigestPath } from "./constants";

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

function withTimer<T>(notice: Notice, message: string, task: Promise<T>): Promise<T> {
  let seconds = 0;
  const timer = window.setInterval(() => {
    seconds++;
    notice.setMessage(`${message}（${seconds}秒）`);
  }, 1000);
  return task.finally(() => clearInterval(timer));
}

export default class InboxSecretaryPlugin extends Plugin {
  settings: InboxSecretarySettings;
  private running = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new InboxSecretarySettingTab(this.app, this));

    this.addRibbonIcon("inbox", "ダイジェスト生成", () => {
      this.generateDigest();
    });

    this.addCommand({
      id: "generate-daily-digest",
      name: "ダイジェスト生成",
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
      // Inbox読み込み
      const inboxReader = new InboxReader(this.app);
      const items = await inboxReader.readAll(this.settings.inboxFolder);

      if (items.length === 0) {
        notice.hide();
        new Notice("Inboxにアイテムがありません");
        return;
      }

      // トリアージ
      const client = new GeminiClient(this.settings.geminiApiKey, this.settings.geminiModel);
      const triageEngine = new TriageEngine(client);
      const triageResult = await withTimer(notice, `分析中...${items.length}件`, triageEngine.run(items, this.settings.userProfile));

      const highItems = triageResult.items.filter((i) => i.category === "high");

      if (highItems.length === 0) {
        notice.hide();
        new Notice(`ピックアップなし（${items.length}件すべて除外）`);
        return;
      }

      // 深掘り
      const highTitles = new Set(highItems.map((i) => i.title));
      const selectedItems = items.filter((item) => highTitles.has(item.title));

      const insightGenerator = new InsightGenerator(client);
      const rawEntries = await withTimer(notice, `深掘り中...${selectedItems.length}件`, insightGenerator.generate(
        selectedItems,
        this.settings.userProfile,
        triageResult.userSummary,
        triageResult.items
      ));

      // 元データからURLをマッピング
      const entries = rawEntries.map((entry) => {
        const original = selectedItems.find((item) => item.title === entry.title);
        return {
          ...entry,
          sourceUrl: entry.sourceUrl || original?.frontmatter.url,
        };
      });

      // 書き出し
      const writer = new DigestWriter(this.app);
      const writeParams: DigestWriteParams = {
        outputFolder: this.settings.digestOutputFolder,
        date: today,
        userSummary: triageResult.userSummary,
        entries,
        triageItems: triageResult.items,
        totalCount: items.length,
      };
      const path = await writer.write(writeParams);

      // Inbox整理
      const cleaner = new InboxCleaner(this.app);
      await cleaner.cleanup(
        items,
        this.settings.cleanupMode,
        this.settings.archiveFolder,
        (current, total, name) => {
          notice.setMessage(`整理中...（${current}/${total}）${name}`);
        }
      );

      notice.hide();
      new Notice(`完了（${entries.length}件ピックアップ / ${items.length}件中）`);

      // ダイジェストを開く
      const digestFile = this.app.vault.getAbstractFileByPath(path);
      if (digestFile instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(digestFile);
      }
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
