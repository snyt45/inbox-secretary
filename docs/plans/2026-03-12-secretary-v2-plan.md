# Inbox Secretary v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Inbox Secretaryを「全件要約」から「トリアージ + 個別深掘り提案 + メモリ蓄積」の2フェーズ構成に改修する

**Architecture:** GeminiClientに構造化出力対応を追加し、DigestGeneratorを廃止してTriageEngine（Phase 1）とInsightGenerator（Phase 2）に分割する。メモリとトリアージログをsettingsに追加し、DigestWriterの出力フォーマットを新設計に合わせる。main.tsのフローを7ステップに再構成する。

**Tech Stack:** TypeScript, Obsidian Plugin API, Gemini API (v1beta, structured output)

**Design doc:** `docs/plans/2026-03-12-secretary-v2-design.md`

---

### Task 1: 型定義の更新

**Files:**
- Modify: `src/types.ts`

**Step 1: types.tsを書き換える**

旧DigestEntryを廃止し、v2の型を定義する。

```typescript
export interface InboxItem {
  title: string;
  path: string;
  content: string;
  frontmatter: {
    tags?: string[];
    url?: string;
    author?: string[];
    published?: string;
    created?: string;
  };
  summary: string;
  body: string;
}

export interface TriageResult {
  userSummary: string;
  updatedMemory: string;
  items: TriageItem[];
}

export interface TriageItem {
  title: string;
  category: "high" | "low";
  reason: string;
}

export interface DigestEntry {
  title: string;
  insight: string;
  action: string;
  sourceUrl?: string;
}

export interface SecretaryMemory {
  content: string;
  lastUpdated: string;
}

export interface TriageLog {
  date: string;
  items: {
    title: string;
    tags: string[];
    category: "high" | "low";
    reason: string;
  }[];
}
```

**Step 2: ビルドして型エラーを確認**

Run: `npm run build`
Expected: DigestEntryの構造が変わったのでdigest-generator.tsとdigest-writer.tsでエラーが出る。これは後続タスクで修正するので、この時点ではエラーでOK。

**Step 3: コミット**

```bash
git add src/types.ts
git commit -m "v2の型定義を追加（TriageResult, SecretaryMemory, TriageLog）"
```

---

### Task 2: settings にメモリとトリアージログを追加

**Files:**
- Modify: `src/settings.ts`

**Step 1: InboxSecretarySettingsにメモリ関連フィールドを追加**

```typescript
// InboxSecretarySettings interfaceに追加
  memory: SecretaryMemory;
  triageLogs: TriageLog[];
```

importに `SecretaryMemory`, `TriageLog` を追加。

DEFAULT_SETTINGSに追加:
```typescript
  dailyNoteDays: 14,  // 7→14に変更
  memory: { content: "", lastUpdated: "" },
  triageLogs: [],
```

**Step 2: 設定画面にメモリセクションを追加**

display()の末尾（Archiveフォルダの後）に追加:

```typescript
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
      .setDesc("秘書の記憶をすべて消去する")
      .addButton((btn) =>
        btn.setButtonText("リセット").onClick(async () => {
          this.plugin.settings.memory = { content: "", lastUpdated: "" };
          this.plugin.settings.triageLogs = [];
          await this.plugin.saveSettings();
          this.display();
        })
      );
```

**Step 3: ビルドして確認**

Run: `npm run build`
Expected: settings.ts自体はエラーなし。他のファイルのエラーは後続で修正。

**Step 4: コミット**

```bash
git add src/settings.ts
git commit -m "設定にメモリとトリアージログを追加、デフォルト参照日数を14日に変更"
```

---

### Task 3: GeminiClientに構造化出力メソッドを追加

**Files:**
- Modify: `src/gemini-client.ts`

**Step 1: generateStructuredメソッドを追加**

既存のgenerateContentはそのまま残し、新メソッドを追加する。

```typescript
interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

export class GeminiClient {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor(
    private apiKey: string,
    private model: string = "gemini-2.5-flash-lite"
  ) {}

  async generateContent(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data: GeminiResponse = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  async generateStructured<T>(
    systemInstruction: string,
    prompt: string,
    schema: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data: GeminiResponse = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text) as T;
  }
}
```

**Step 2: ビルドして確認**

Run: `npm run build`
Expected: gemini-client.ts自体はエラーなし。

**Step 3: コミット**

```bash
git add src/gemini-client.ts
git commit -m "GeminiClientに構造化出力メソッドgenerateStructuredを追加"
```

---

### Task 4: TriageEngine（Phase 1）を作成

**Files:**
- Create: `src/triage-engine.ts`

**Step 1: triage-engine.tsを作成**

```typescript
import { GeminiClient } from "./gemini-client";
import { InboxItem, TriageResult, TriageLog, SecretaryMemory } from "./types";

const TRIAGE_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書です。ユーザーのことを深く理解し、本当に必要な情報だけを届けることが仕事です。`;

const TRIAGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    userSummary: {
      type: "STRING",
      description: "今回のユーザー理解サマリー。現在の状況・関心・進行中の作業を具体的に記述",
    },
    updatedMemory: {
      type: "STRING",
      description: "更新されたメモリ。新情報をマージし古い情報を更新。変化なければ既存のまま",
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "アイテムのタイトル" },
          category: {
            type: "STRING",
            enum: ["high", "low"],
            description: "high: 今の作業や関心に直結/すぐ使える/知らないと損する。low: このユーザーには今関係ない",
          },
          reason: { type: "STRING", description: "判定理由を1-2文で" },
        },
        required: ["title", "category", "reason"],
      },
    },
  },
  required: ["userSummary", "updatedMemory", "items"],
};

export class TriageEngine {
  constructor(private client: GeminiClient) {}

  async run(
    items: InboxItem[],
    dailyNoteContext: string,
    userProfile: string,
    memory: SecretaryMemory,
    triageLogs: TriageLog[]
  ): Promise<TriageResult> {
    const itemsSummary = items
      .map(
        (item, i) =>
          `<item index="${i + 1}">\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}\n</item>`
      )
      .join("\n\n");

    const triageHistorySummary = this.formatTriageLogs(triageLogs);

    const prompt = `<user_profile>
${userProfile || "（未設定）"}
</user_profile>

<secretary_memory>
${memory.content || "（まだメモリがありません。今回の情報から構築してください）"}
</secretary_memory>

<triage_history>
${triageHistorySummary || "（過去の履歴なし）"}
</triage_history>

<daily_notes>
${dailyNoteContext || "（Daily Noteなし）"}
</daily_notes>

<inbox_items>
${itemsSummary}
</inbox_items>

<instructions>
以下の3つを実行してください。

1. Daily Noteとメモリから、ユーザーの現在の状況・関心・進行中の作業を把握し、userSummaryとして出力する

2. secretaryMemoryを更新する。新しく読み取れた情報があればマージし、古くなった情報は更新する。変化がなければ既存のまま返す

3. 各Inboxアイテムについて、このユーザーに本当に関係あるかをhigh/lowで判定する
   highの基準: 今の作業や関心に直結する、すぐ使える、知らないと損する
   lowの基準: 一般的に良い記事でもこのユーザーには今関係ない
</instructions>

<examples>
<example>
ユーザー: Obsidianプラグインを開発中のTypeScriptエンジニア
アイテム: 「React Server Componentsの深掘り」
判定: high
理由: Reactを使っておりServer Componentsの知識が直接活きる

アイテム: 「Kubernetes 1.32のリリースノート」
判定: low
理由: インフラ運用は現在のスコープ外
</example>
</examples>`;

    return this.client.generateStructured<TriageResult>(
      TRIAGE_SYSTEM_INSTRUCTION,
      prompt,
      TRIAGE_SCHEMA
    );
  }

  private formatTriageLogs(logs: TriageLog[]): string {
    if (logs.length === 0) return "";
    return logs
      .map((log) => {
        const highs = log.items.filter((i) => i.category === "high").map((i) => i.title);
        const lows = log.items.filter((i) => i.category === "low").map((i) => i.title);
        return `${log.date}: high=[${highs.join(", ")}] low=[${lows.join(", ")}]`;
      })
      .join("\n");
  }
}
```

**Step 2: ビルドして確認**

Run: `npm run build`
Expected: triage-engine.ts自体はエラーなし。

**Step 3: コミット**

```bash
git add src/triage-engine.ts
git commit -m "TriageEngine（Phase 1: トリアージ + メモリ更新）を追加"
```

---

### Task 5: InsightGenerator（Phase 2）を作成

**Files:**
- Create: `src/insight-generator.ts`

**Step 1: insight-generator.tsを作成**

```typescript
import { GeminiClient } from "./gemini-client";
import { InboxItem, DigestEntry } from "./types";

const INSIGHT_SYSTEM_INSTRUCTION = `あなたはユーザー専属の情報秘書です。
選別済みの記事について、このユーザーが具体的にどう活用できるかを提案してください。
「参考になるでしょう」「役立つかもしれません」のような一般論は禁止。
「あなたの○○で△△できる」「今やっている○○に直接使える」まで踏み込むこと。`;

const INSIGHT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "アイテムのタイトル（短く）" },
      insight: {
        type: "STRING",
        description: "なぜこのユーザーに関係あるか。具体的な文脈と結びつけて説明",
      },
      action: {
        type: "STRING",
        description: "具体的に何をすべきか。ファイル名やツール名まで踏み込む",
      },
      sourceUrl: { type: "STRING", description: "元記事のURL（あれば）" },
    },
    required: ["title", "insight", "action"],
  },
};

export class InsightGenerator {
  constructor(private client: GeminiClient) {}

  async generate(
    items: InboxItem[],
    memory: string,
    userSummary: string
  ): Promise<DigestEntry[]> {
    const itemsBlock = items
      .map(
        (item) =>
          `<item>\nタイトル: ${item.title}\nURL: ${item.frontmatter.url ?? "なし"}\nタグ: ${(item.frontmatter.tags ?? []).join(", ")}\n\n${item.body}\n</item>`
      )
      .join("\n\n");

    const prompt = `<secretary_memory>
${memory}
</secretary_memory>

<user_summary>
${userSummary}
</user_summary>

<selected_items>
${itemsBlock}
</selected_items>

<examples>
<example>
アイテム: Claude Code 4.6のスキル機能
insight: 今開発中のObsidianプラグインで、コマンド追加のたびにmain.tsが肥大化している。スキルの仕組みを参考に、各機能を独立モジュールとして動的ロードする設計にできる。
action: src/main.tsのaddCommand部分を見直し、DigestGeneratorのように機能単位でクラス分離するリファクタリングを検討する。
</example>
</examples>

<instructions>
各アイテムについて、このユーザーが具体的にどう活用できるかをinsightとactionで提案してください。
一般的な要約は不要。このユーザーの今の状況にどう刺さるかだけを書いてください。
</instructions>`;

    return this.client.generateStructured<DigestEntry[]>(
      INSIGHT_SYSTEM_INSTRUCTION,
      prompt,
      INSIGHT_SCHEMA
    );
  }
}
```

**Step 2: ビルドして確認**

Run: `npm run build`
Expected: insight-generator.ts自体はエラーなし。

**Step 3: コミット**

```bash
git add src/insight-generator.ts
git commit -m "InsightGenerator（Phase 2: 深掘り提案）を追加"
```

---

### Task 6: DigestWriterをv2フォーマットに書き換え

**Files:**
- Modify: `src/digest-writer.ts`

**Step 1: DigestWriterを新フォーマットに対応させる**

```typescript
import { App, TFile } from "obsidian";
import { DigestEntry, TriageItem } from "./types";
import { ensureFolder } from "./utils";

export class DigestWriter {
  constructor(private app: App) {}

  async write(
    outputFolder: string,
    date: string,
    userSummary: string,
    entries: DigestEntry[],
    triageItems: TriageItem[],
    totalCount: number
  ): Promise<string> {
    await ensureFolder(this.app, outputFolder);
    const content = this.format(date, userSummary, entries, triageItems, totalCount);
    const path = `${outputFolder}/${date} デイリーダイジェスト.md`;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }

    return path;
  }

  private format(
    date: string,
    userSummary: string,
    entries: DigestEntry[],
    triageItems: TriageItem[],
    totalCount: number
  ): string {
    const pickedCount = entries.length;
    const lines: string[] = [
      "---",
      `created: ${date}`,
      "tags:",
      "  - digest",
      `triaged: ${totalCount}`,
      `picked: ${pickedCount}`,
      "---",
      `# ${date} デイリーダイジェスト`,
      "",
      "## 秘書メモ",
      "",
      userSummary,
      "",
      "## ピックアップ",
      "",
    ];

    for (const entry of entries) {
      lines.push(`### ${entry.title}`);
      lines.push("");
      lines.push(entry.insight);
      lines.push("");
      lines.push(`→ ${entry.action}`);
      if (entry.sourceUrl) {
        lines.push("");
        lines.push(`Source: ${entry.sourceUrl}`);
      }
      lines.push("");
    }

    const lowItems = triageItems.filter((i) => i.category === "low");
    if (lowItems.length > 0) {
      lines.push("---");
      lines.push("");
      lines.push("## 除外したアイテム");
      lines.push("");
      lines.push("| タイトル | 理由 |");
      lines.push("|---------|------|");
      for (const item of lowItems) {
        lines.push(`| ${item.title} | ${item.reason} |`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push(`*${totalCount}件中${pickedCount}件をピックアップ / メモリ更新済み*`);
    lines.push("");

    return lines.join("\n");
  }
}
```

**Step 2: ビルドして確認**

Run: `npm run build`
Expected: digest-writer.ts自体はOK。main.tsで呼び出しシグネチャが変わったのでエラーが出るが、Task 8で修正する。

**Step 3: コミット**

```bash
git add src/digest-writer.ts
git commit -m "DigestWriterをv2フォーマットに書き換え（秘書メモ、ピックアップ、除外一覧）"
```

---

### Task 7: 旧DigestGeneratorを削除

**Files:**
- Delete: `src/digest-generator.ts`

**Step 1: digest-generator.tsを削除**

```bash
git rm src/digest-generator.ts
```

**Step 2: コミット**

```bash
git commit -m "旧DigestGenerator（v1の一括要約）を削除"
```

---

### Task 8: main.tsをv2フローに書き換え

**Files:**
- Modify: `src/main.ts`

**Step 1: main.tsを全面書き換え**

```typescript
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
```

**Step 2: ビルドして全体の整合性を確認**

Run: `npm run build`
Expected: PASS（全ファイルの型が一致）

**Step 3: コミット**

```bash
git add src/main.ts
git commit -m "main.tsをv2の7ステップフロー（トリアージ→深掘り→メモリ蓄積）に書き換え"
```

---

### Task 9: ビルド・動作確認

**Files:**
- None (確認のみ)

**Step 1: クリーンビルド**

Run: `npm run build`
Expected: PASS、エラーなし

**Step 2: 不要なimportや未使用コードがないか確認**

digest-generator.tsは削除済み。main.tsからのimportが残っていないことを確認する。

**Step 3: 最終コミット**

全てのビルドが通り、不要コードがなければ最終コミット:

```bash
git add -A
git commit -m "Inbox Secretary v2: トリアージ + 深掘り提案 + メモリ蓄積の実装完了"
```
