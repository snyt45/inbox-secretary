# Inbox Secretary

Obsidian プラグイン。Inbox に溜まったノートを LLM が読んで「あなたにとってこう使える」まで噛み砕き、ダイジェストとして出力する。

## 何をするか

1. Inbox 内の全ノートを読む
2. ユーザープロフィールを参照して、今の作業に関係あるかトリアージする
3. ピックアップしたアイテムに insight（なぜ今読むべきか）と action（何をすべきか）を生成する
4. ダイジェストとして 1 つの Markdown ノートにまとめて出力する
5. 消化済みアイテムを Inbox から削除する（設定で Archive 移動・そのまま残すも選択可）

## 出力イメージ

```markdown
# 2026-03-11 ダイジェスト

3件ピックアップ / 15件中

> [!example] Claude Code research の待ち時間をゼロに
> **Try:** superpowersスキルのサブエージェント設計に、この分離パターンを試す
>
> Skillとサブエージェントを組み合わせて待ち時間を消す構成。 [Read →](https://example.com/article)

> [!example] Obsidian × Zettelkasten 運用カスタマイズ
> **Try:** モバイルキャプチャの導線を自分の環境で組んでみる
>
> THINO + LINE連携でモバイルキャプチャを実現している事例。 [Read →](https://example.com/article2)
```

## インストール

1. [Releases](https://github.com/snyt45/inbox-secretary/releases) から最新の `main.js`、`manifest.json` をダウンロード
2. Vault の `.obsidian/plugins/inbox-secretary/` フォルダを作成し、2ファイルを配置
3. Obsidian を再起動して「設定 > コミュニティプラグイン」から Inbox Secretary を有効化

## 使い方

コマンドパレット → 「ダイジェスト生成」

## 設定項目

### 基本設定

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| Inbox フォルダ | `Inbox` | 未処理ノートが入っているフォルダ |
| ダイジェスト出力先 | `Inbox/Digest` | 生成されたダイジェストの保存先 |
| Archive フォルダ | `Inbox/Archive` | Archive 移動時の保存先 |
| 消化済みアイテムの処理 | 削除 | 削除 / Archive に移動 / そのまま残す |
| ユーザープロフィール | - | 職種・スキル・今やっていること・興味のないもの |

### API設定

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| Gemini API キー | - | Google AI Studio で取得 |
| Gemini モデル | `gemini-2.5-flash` | 使用する Gemini モデル名 |

## 開発

Fork して手元で開発する場合の手順。

```bash
npm install
cp .env.example .env
```

`.env` の `OBSIDIAN_PLUGIN_DIR` を自分の Vault のプラグインディレクトリに書き換える。

```
OBSIDIAN_PLUGIN_DIR=/path/to/vault/.obsidian/plugins/inbox-secretary
```

設定後、`npm run dev` でビルド＆ファイル監視が起動し、変更のたびにプラグインディレクトリへ自動コピーされる。

```bash
npm run dev    # 開発モード（ファイル監視 + 自動コピー）
npm run build  # 本番ビルド
```
