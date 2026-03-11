# Inbox Secretary

Obsidian プラグイン。Inbox に溜まったノートを LLM が読んで「あなたにとってこう使える」まで噛み砕き、デイリーダイジェストとして出力する。

## 何をするか

1. Inbox 内の全ノートを読む
2. Daily Note から今の関心事・仕事の文脈を把握する
3. Gemini API で各アイテムを分析し、自分にとっての活用方法まで要約する
4. デイリーダイジェストとして 1 つの Markdown ノートにまとめて出力する
5. 消化済みアイテムを Inbox から削除する（設定で Archive 移動・そのまま残すも選択可）

## 出力イメージ

```markdown
# 2026-03-11 デイリーダイジェスト

## Claude Code research の待ち時間をゼロに
Skillとサブエージェントを組み合わせて待ち時間を消す構成。
→ superpowersスキルのサブエージェント設計の参考になる。

## Obsidian × Zettelkasten 運用カスタマイズ
THINO + LINE連携でモバイルキャプチャ。
→ モバイルからのキャプチャ方法は今の課題に合う。
```

## セットアップ

```bash
git clone https://github.com/snyt45/inbox-secretary.git
cd inbox-secretary
cp .env.example .env
# .env の OBSIDIAN_PLUGIN_DIR を自分の vault に合わせて編集
npm install
npm run dev
```

Obsidian の設定 → コミュニティプラグイン → Inbox Secretary を有効化。

## 設定項目

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| Inbox フォルダ | `Inbox` | 未処理ノートが入っているフォルダ |
| Daily Note フォルダ | `Journal/2026/Daily` | 関心事の把握に参照する |
| ダイジェスト出力先 | `Inbox` | 生成されたダイジェストの保存先 |
| Gemini API キー | - | Google AI Studio で取得 |
| 消化済みアイテムの処理 | 削除 | 削除 / Archive に移動 / そのまま残す |
| Archive フォルダ | `Archive` | Archive 移動時の保存先 |

## 使い方

コマンドパレット → 「デイリーダイジェスト生成」

## 開発

```bash
npm run dev    # watch モード（変更を検知して自動ビルド + vault にコピー）
npm run build  # プロダクションビルド
```

## 技術スタック

- TypeScript + Obsidian Plugin API
- Gemini API（REST 直叩き、SDK 不要）
- esbuild
