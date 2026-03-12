import { App, PluginSettingTab, Setting } from "obsidian";
import type InboxSecretaryPlugin from "./main";
import type { SecretaryMemory, TriageLog } from "./types";

export interface InboxSecretarySettings {
  inboxFolder: string;
  dailyNoteFolder: string;
  digestOutputFolder: string;
  geminiApiKey: string;
  geminiModel: string;
  dailyNoteDays: number;
  userProfile: string;
  excludeTopics: string;
  cleanupMode: "delete" | "archive" | "keep";
  archiveFolder: string;
  memory: SecretaryMemory;
  triageLogs: TriageLog[];
}

export const DEFAULT_SETTINGS: InboxSecretarySettings = {
  inboxFolder: "Inbox",
  dailyNoteFolder: "Daily",
  digestOutputFolder: "Inbox/Digest",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  dailyNoteDays: 14,
  userProfile: "",
  excludeTopics: "",
  cleanupMode: "delete",
  archiveFolder: "Archive",
  memory: { content: "", lastUpdated: "" },
  triageLogs: [],
};

export class InboxSecretarySettingTab extends PluginSettingTab {
  plugin: InboxSecretaryPlugin;

  constructor(app: App, plugin: InboxSecretaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Inboxフォルダ")
      .setDesc("未処理ノートが入っているフォルダ")
      .addText((text) =>
        text
          .setPlaceholder("Inbox")
          .setValue(this.plugin.settings.inboxFolder)
          .onChange(async (value) => {
            this.plugin.settings.inboxFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily Noteフォルダ")
      .setDesc("今日の関心事を把握するために参照する")
      .addText((text) =>
        text
          .setPlaceholder("Daily")
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("ダイジェスト出力先")
      .setDesc("生成されたダイジェストの保存先")
      .addText((text) =>
        text
          .setPlaceholder("Inbox")
          .setValue(this.plugin.settings.digestOutputFolder)
          .onChange(async (value) => {
            this.plugin.settings.digestOutputFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily Note参照日数")
      .setDesc("今日を含めて何日分のDaily Noteを参照するか")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.dailyNoteDays))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.dailyNoteDays = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("ユーザープロフィール")
      .setDesc("あなたの職種・スキル・興味をLLMに伝える自己紹介文")
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.inputEl.style.width = "100%";
        text
          .setPlaceholder("例: フルスタックエンジニア。TypeScript, React, Rubyが主な技術スタック。AI活用や個人開発に興味がある。")
          .setValue(this.plugin.settings.userProfile)
          .onChange(async (value) => {
            this.plugin.settings.userProfile = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("除外トピック")
      .setDesc("秘書に無視させたいトピックやジャンル（改行区切り）")
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
        text
          .setPlaceholder("例:\nAI動画・収益化系\nAIイラスト生成\nモバイルアプリ開発")
          .setValue(this.plugin.settings.excludeTopics)
          .onChange(async (value) => {
            this.plugin.settings.excludeTopics = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Gemini APIキー")
      .setDesc("Google AI StudioでAPIキーを取得")
      .addText((text) =>
        text
          .setPlaceholder("AIza...")
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Geminiモデル")
      .setDesc("使用するGeminiモデル名")
      .addText((text) =>
        text
          .setPlaceholder("gemini-2.5-flash-lite")
          .setValue(this.plugin.settings.geminiModel)
          .onChange(async (value) => {
            this.plugin.settings.geminiModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("消化済みアイテムの処理")
      .setDesc("ダイジェスト生成後の元ノートの扱い")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("delete", "削除")
          .addOption("archive", "Archiveに移動")
          .addOption("keep", "そのまま残す")
          .setValue(this.plugin.settings.cleanupMode)
          .onChange(async (value) => {
            this.plugin.settings.cleanupMode =
              value as InboxSecretarySettings["cleanupMode"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Archiveフォルダ")
      .setDesc("Archive移動時の保存先")
      .addText((text) =>
        text
          .setPlaceholder("Archive")
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            this.plugin.settings.archiveFolder = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "秘書のメモリ" });

    const memoryDesc = this.plugin.settings.memory.lastUpdated
      ? `最終更新: ${this.plugin.settings.memory.lastUpdated}`
      : "まだメモリがありません";

    new Setting(containerEl)
      .setName("メモリ内容")
      .setDesc(memoryDesc)
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.inputEl.style.width = "100%";
        text
          .setValue(this.plugin.settings.memory.content)
          .onChange(async (value) => {
            this.plugin.settings.memory.content = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("メモリをリセット")
      .setDesc("メモリ内容と過去のトリアージ履歴をすべて消去する")
      .addButton((btn) =>
        btn.setButtonText("リセット").onClick(async () => {
          this.plugin.settings.memory = { content: "", lastUpdated: "" };
          this.plugin.settings.triageLogs = [];
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }
}
