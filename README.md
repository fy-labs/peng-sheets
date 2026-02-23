# PengSheets — Markdown Spreadsheet Editor

<p align="center">
  <img src="./images/icon.png" alt="PengSheets Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Transform your Markdown tables into a powerful spreadsheet experience.</strong>
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
  <a href="#-highlights">Highlights</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-why-pengsheets">Why PengSheets</a> •
  <a href="#️-settings">Settings</a> •
  <a href="#-roadmap">Roadmap</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

<p align="center">
  <img src="./images/demo.gif" alt="PengSheets Demo" width="800">
</p>

With **Formula Columns**, you can reference values from other tables by key, just like VLOOKUP. Computed results are written directly to Markdown, so they're readable in any editor.

<p align="center">
  <img src="./images/demo_computed-columns.gif" alt="Computed Columns Demo" width="800">
</p>

**PengSheets** transforms your Markdown tables into a rich, interactive spreadsheet view. Powered by [md-spreadsheet-parser](https://github.com/f-y/md-spreadsheet-parser), it runs a robust Python parser directly in your editor via WebAssembly, offering superior parsing accuracy and seamless multi-sheet support.

> Read in Japanese: 日本語版はこちら（ <a href="https://github.com/f-y/peng-sheets/blob/main/README.ja.md">README</a> ）

## ✨ Highlights

| Feature | Description |
|:--------|:------------|
| 🎯 **Excel-like Editing** | Navigate and edit Markdown tables with familiar spreadsheet controls |
| 📑 **Multi-Sheet Workbooks** | Organize data across multiple sheets using Markdown headers |
| 🔢 **Formula Columns** | Auto-calculated columns with formulas and VLOOKUP-style cross-table references |
| ⚡ **Real-time Sync** | Changes in the spreadsheet instantly reflect in your Markdown source |
| 🐍 **Python-Powered Parsing** | Robust WebAssembly-based Python parser for reliable table handling |
| 🌍 **Multilingual UI** | English and Japanese interface support |
| 🎨 **Native VS Code Look** | Seamlessly integrates with your VS Code theme |
| 🛠️ **Python & Node.js Ready** | Instantly load your workbooks in Python and Node.js scripts |

## 🚀 Quick Start

1. **Install** the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=f-y.peng-sheets)

2. **Open** any Markdown file (`.md`)

3. **Launch** the spreadsheet editor:
   - Click the **table icon** in the editor title bar (fastest!)
   
     ![Table icon in title bar](./images/screenshot-title-bar-icon.png)
   
   - Or right-click a `.md` file in the Explorer and select **`Open with PengSheets`**
   - Or open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run: **`Markdown: Open with PengSheets`**

4. **Edit** your tables with the spreadsheet interface — changes sync automatically!

> **Tip:** Create a new workbook with `Markdown: Create New Spreadsheet File` command.

## 🤔 Why PengSheets?

| | PengSheets | Other Markdown Table Editors |
|:--|:--|:--|
| **Multi-Sheet Support** | ✅ Full workbook organization | ❌ Single table only |
| **Parsing Engine** | Python (WebAssembly) — battle-tested | JavaScript — limited edge case handling |
| **Real-time Sync** | ✅ Bidirectional | ⚠️ Often one-way |
| **Metadata Support** | ✅ Table descriptions, sheet organization | ❌ None |
| **Keyboard Shortcuts** | ✅ Excel-like navigation | ⚠️ Limited |


## ⚙️ Settings

PengSheets offers extensive customization to match your documentation style:

| Setting | Description | Default |
|:--------|:------------|:--------|
| `pengSheets.parsing.rootMarker` | Marker indicating the start of the data section | `null` (Auto-detect) |
| `pengSheets.parsing.sheetHeaderLevel` | Header level for sheet names (e.g., 2 for `##`) | `null` (Auto-detect) |
| `pengSheets.parsing.tableHeaderLevel` | Header level for table names (e.g., 3 for `###`) | `null` (Auto-detect) |
| `pengSheets.parsing.captureDescription` | Capture text between header and table as description | `true` |
| `pengSheets.parsing.columnSeparator` | Column separator character | `\|` |
| `pengSheets.parsing.headerSeparatorChar` | Header separator character | `-` |
| `pengSheets.parsing.requireOuterPipes` | Require outer pipes in generated tables | `true` |
| `pengSheets.parsing.stripWhitespace` | Strip whitespace from cell values | `true` |
| `pengSheets.language` | UI language (`auto`, `en`, `ja`) | `auto` |
| `pengSheets.validation.dateFormat` | Date format for validation cells | `YYYY-MM-DD` |
## 🐍 Use with Python

Files created with PengSheets can be easily read in your Python scripts using [md-spreadsheet-parser](https://github.com/f-y/md-spreadsheet-parser). The Lookup API lets you access specific sheets and tables by name:

```python
from md_spreadsheet_parser import parse_workbook_from_file

# Load your PengSheets workbook
workbook = parse_workbook_from_file("data.md")

# Access sheet and table by name
sheet = workbook.get_sheet("Sales Data")
table = sheet.get_table("Q1 Results")

# Use your data
print(table.headers)  # ['Year', 'Revenue']
print(table.rows)     # [['2024', '1000'], ['2025', '1500']]
```

Install the parser:
```bash
pip install md-spreadsheet-parser
```

📚 See the [Cookbook](https://github.com/f-y/md-spreadsheet-parser/blob/main/COOKBOOK.md) for more recipes (Pandas, Excel, type-safe validation, and more).

## 📦 Use with Node.js

The `md-spreadsheet-parser` is also available as an NPM package, allowing you to parse and manipulate Markdown spreadsheets in Node.js environments with the same reliability as the Python core.

```javascript
import { parseWorkbookFromFile } from 'md-spreadsheet-parser';

// Load your PengSheets workbook
const workbook = parseWorkbookFromFile("data.md");

// Access sheet and table by name
const sheet = workbook.getSheet("Sales Data");
const table = sheet.getTable("Q1 Results");

// Use your data
console.log(table.headers); // ['Year', 'Revenue']
console.log(table.rows);    // [['2024', '1000'], ['2025', '1500']]
```

Install the package:
```bash
npm install md-spreadsheet-parser
```

## 🗺️ Roadmap

We're actively developing PengSheets! Planned features include:

- **Performance Improvements**: Optimization for handling large tables smoothly
- **Advanced Document Editing**: Image insertion, list completion, and richer Markdown support for document tabs
- **Search & Replace**: Functionality to find and replace text within the grid
- **Visual Enhancements**: Conditional formatting for data visualization

## 🤝 Contributing

We welcome your feedback and ideas! If you encounter a bug or have a feature request:

1. Check existing [Issues](https://github.com/f-y/peng-sheets/issues) to avoid duplicates
2. Open a new [Issue](https://github.com/f-y/peng-sheets/issues/new) with a clear description
3. Include steps to reproduce (for bugs) or use cases (for features)

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ by the PengSheets team
</p>
