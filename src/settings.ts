import { App, PluginSettingTab, Setting } from "obsidian";
import type InboxSecretaryPlugin from "./main";

export interface InboxSecretarySettings {
  inboxFolder: string;
  digestOutputFolder: string;
  geminiApiKey: string;
  geminiModel: string;
  userProfile: string;
  cleanupMode: "delete" | "archive" | "keep";
  archiveFolder: string;
}

export const DEFAULT_SETTINGS: InboxSecretarySettings = {
  inboxFolder: "Inbox",
  digestOutputFolder: "Inbox/Digest",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  userProfile: "",
  cleanupMode: "delete",
  archiveFolder: "Inbox/Archive",
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

    containerEl.createEl("h3", { text: "API設定" });

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
          .setPlaceholder("gemini-2.5-flash")
          .setValue(this.plugin.settings.geminiModel)
          .onChange(async (value) => {
            this.plugin.settings.geminiModel = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "基本設定" });

    new Setting(containerEl)
      .setName("ユーザープロフィール")
      .setDesc("職種・スキル・今やっていることをLLMに伝える。具体的なほどトリアージ精度が上がる")
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.inputEl.style.width = "100%";
        text
          .setPlaceholder("例: フルスタックエンジニア。TypeScript, React, Rubyが主な技術スタック。今週はObsidianプラグインのプロンプト改善に集中している。AI動画・収益化系の記事は興味なし。")
          .setValue(this.plugin.settings.userProfile)
          .onChange(async (value) => {
            this.plugin.settings.userProfile = value;
            await this.plugin.saveSettings();
          });
      });

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
      .setName("ダイジェスト出力先")
      .setDesc("生成されたダイジェストの保存先")
      .addText((text) =>
        text
          .setPlaceholder("Inbox/Digest")
          .setValue(this.plugin.settings.digestOutputFolder)
          .onChange(async (value) => {
            this.plugin.settings.digestOutputFolder = value;
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
          .setPlaceholder("Inbox/Archive")
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            this.plugin.settings.archiveFolder = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
