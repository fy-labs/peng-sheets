# PengSheets — Markdown スプレッドシートエディタ

<p align="center">
  <img src="./images/icon.png" alt="PengSheets Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Markdownテーブルを、パワフルなスプレッドシート体験に変える。</strong>
</p>

<p align="center">
  <a href="https://open-vsx.org/extension/f-y/peng-sheets">
    <img src="https://img.shields.io/open-vsx/v/f-y/peng-sheets?style=flat-square&label=version" alt="Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=f-y.peng-sheets">
    <img src="https://img.shields.io/visual-studio-marketplace/i/f-y.peng-sheets?style=flat-square&label=VS%20Marketplace" alt="VS Marketplace Installs">
  </a>
  <a href="https://open-vsx.org/extension/f-y/peng-sheets">
    <img src="https://img.shields.io/open-vsx/dt/f-y/peng-sheets?style=flat-square&label=Open%20VSX" alt="Open VSX Downloads">
  </a>
  <a href="https://github.com/f-y/peng-sheets/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="#-特徴">特徴</a> •
  <a href="#-クイックスタート">クイックスタート</a> •
  <a href="#-なぜpengsheets">PengSheetsの利点</a> •
  <a href="#️-設定">設定</a> •
  <a href="#️-ロードマップ">ロードマップ</a> •
  <a href="#-コントリビューション">コントリビューション</a>
</p>

---

<p align="center">
  <img src="./images/demo.gif" alt="PengSheets デモ" width="800">
</p>

**数式列**を使えば、VLOOKUPのようにキーを使って他のテーブルの値を参照できます。計算結果はMarkdownに直接書き込まれるため、どのエディタでも読むことができます。

<p align="center">
  <img src="./images/demo_computed-columns.gif" alt="Computed Columns Demo" width="800">
</p>

**PengSheets**は、Markdownテーブルをリッチなスプレッドシートビューに変換します。[md-spreadsheet-parser](https://github.com/f-y/md-spreadsheet-parser)を活用し、堅牢なPythonパーサーをWebAssembly経由でエディタ内で直接実行することで、優れた解析精度とシームレスなマルチシートサポートを提供します。

## ✨ 特徴

| 機能 | 説明 |
|:--------|:------------|
| 🎯 **Excel風の編集** | 馴染みのあるスプレッドシート操作でMarkdownテーブルをナビゲート・編集 |
| 📑 **マルチシートワークブック** | Markdownヘッダーを使って複数のシートでデータを整理 |
| 🔢 **数式列** | 数式による自動計算列や、VLOOKUPスタイルのクロスシート参照 |
| ⚡ **リアルタイム同期** | スプレッドシートでの変更が即座にMarkdownソースに反映 |
| 🐍 **Python駆動の解析** | 信頼性の高いWebAssemblyベースのPythonパーサー |
| 🌍 **多言語対応UI** | 英語と日本語のインターフェースをサポート |
| 🎨 **ネイティブなVS Codeルック** | VS Codeテーマとシームレスに統合 |
| 🛠️ **Python & Node.js 対応** | 作成したワークブックを Python や Node.js スクリプトですぐに読込可能 |

## 🚀 クイックスタート

1. **インストール** - [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=f-y.peng-sheets)から拡張機能をインストール

2. **開く** - Markdownファイル（`.md`）を開く

3. **起動** - スプレッドシートエディタを起動:
   - エディタのタイトルバーにある**テーブルアイコン**をクリック
   
     ![タイトルバーのテーブルアイコン](./images/screenshot-title-bar-icon.png)
   
   - または、エクスプローラーで`.md`ファイルを右クリックし、**`PengSheetsで開く`**を選択
   - または、コマンドパレット（`Cmd+Shift+P` / `Ctrl+Shift+P`）を開いて実行: **`Markdown: PengSheetsで開く`**

4. **編集** - スプレッドシートインターフェースでテーブルを編集 — 変更は自動的に同期されます！

> **ヒント:** `Markdown: 新規に表計算ファイルを作成`コマンドで新しいワークブックを作成できます。

## 🤔 なぜPengSheets？

| | PengSheets | 他のMarkdownテーブルエディタ |
|:--|:--|:--|
| **マルチシート対応** | ✅ 完全なワークブック構成 | ❌ 単一テーブルのみ |
| **解析エンジン** | Python（WebAssembly）— 実戦で検証済み | JavaScript — エッジケース処理が限定的 |
| **リアルタイム同期** | ✅ 双方向 | ⚠️ 一方向が多い |
| **メタデータ対応** | ✅ テーブル説明、シート構成 | ❌ なし |
| **キーボードショートカット** | ✅ Excel風のナビゲーション | ⚠️ 限定的 |


## ⚙️ 設定

PengeSheets はドキュメントスタイルに合わせて幅広くカスタマイズできます：

| 設定 | 説明 | デフォルト |
|:--------|:------------|:--------|
| `pengSheets.parsing.rootMarker` | データセクションの開始を示すマーカー | `null` (自動検出) |
| `pengSheets.parsing.sheetHeaderLevel` | シート名のヘッダーレベル（例: 2 で `##`）| `null` (自動検出) |
| `pengSheets.parsing.tableHeaderLevel` | テーブル名のヘッダーレベル（例: 3 で `###`）| `null` (自動検出) |
| `pengSheets.parsing.captureDescription` | ヘッダーとテーブル間のテキストを説明として取得 | `true` |
| `pengSheets.parsing.columnSeparator` | 列の区切り文字 | `\|` |
| `pengSheets.parsing.headerSeparatorChar` | ヘッダー区切り文字 | `-` |
| `pengSheets.parsing.requireOuterPipes` | 生成されるテーブルに外側のパイプを必須とする | `true` |
| `pengSheets.parsing.stripWhitespace` | セル値から空白を除去 | `true` |
| `pengSheets.language` | UI言語（`auto`, `en`, `ja`） | `auto` |
| `pengSheets.validation.dateFormat` | バリデーションセルの日付形式 | `YYYY-MM-DD` |
## 🐍 Pythonで利用

PengSheetsで作成したファイルは、[md-spreadsheet-parser](https://github.com/f-y/md-spreadsheet-parser)を使ってPythonスクリプトから簡単に読み込めます。Lookup APIで特定のシートとテーブルに名前でアクセスできます：

```python
from md_spreadsheet_parser import parse_workbook_from_file

# PengSheetsワークブックを読み込み
workbook = parse_workbook_from_file("data.md")

# シートとテーブルに名前でアクセス
sheet = workbook.get_sheet("売上データ")
table = sheet.get_table("Q1実績")

# データを利用
print(table.headers)  # ['年度', '売上']
print(table.rows)     # [['2024', '1000'], ['2025', '1500']]
```

パーサーのインストール：
```bash
pip install md-spreadsheet-parser
```

📚 詳しいレシピは[Cookbook（日本語）](https://github.com/f-y/md-spreadsheet-parser/blob/main/COOKBOOK.ja.md)をご覧ください（Pandas連携、Excel変換、型安全なバリデーションなど）。

## 📦 Node.js で使う

`md-spreadsheet-parser` は NPM パッケージとしても提供されており、Python 版と同様の信頼性で、Node.js 環境でも Markdown スプレッドシートのパースや操作が可能です。

```javascript
import { parseWorkbookFromFile } from 'md-spreadsheet-parser';

// PengSheets ワークブックを読み込み
const workbook = parseWorkbookFromFile("data.md");

// シートとテーブルに名前でアクセス
const sheet = workbook.getSheet("売上データ");
const table = sheet.getTable("Q1実績");

// データを利用
console.log(table.headers); // ['年度', '売上']
console.log(table.rows);    // [['2024', '1000'], ['2025', '1500']]
```

パッケージのインストール：
```bash
npm install md-spreadsheet-parser
```

## 🗺️ ロードマップ

PengSheetsを積極的に開発中です！予定している機能：

- **大規模テーブルのパフォーマンス改善**: 仮想化技術などを用いた、大量のデータを含むテーブルの高速化
- **ドキュメント編集機能の高度化**: ドキュメントタブにおける画像挿入やリスト入力補完など、テキスト編集機能の強化
- **検索・置換**: テーブル内のテキスト検索および置換機能の実装
- **ビジュアル強化**: 条件付き書式など、データの視覚化機能

## 🤝 コントリビューション

フィードバックやアイデアをお待ちしています！バグや機能リクエストがある場合：

1. 重複を避けるため、既存の[Issues](https://github.com/f-y/peng-sheets/issues)を確認
2. 明確な説明とともに新しい[Issue](https://github.com/f-y/peng-sheets/issues/new)を作成
3. 再現手順（バグの場合）またはユースケース（機能リクエストの場合）を含める

## 📄 ライセンス

このプロジェクトは[MITライセンス](LICENSE)の下でライセンスされています。

---

<p align="center">
  Made with ❤️ by the PengSheets team
</p>
