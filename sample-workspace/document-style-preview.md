# Document Style Preview

<p align="center">
  <img src="./images/icon.png" alt="PengSheets Logo" width="128" height="128">
</p>

<p align="center">
  <strong>This file exercises every common Markdown style to verify visual consistency.</strong>
</p>

<p align="center">
  <a href="https://open-vsx.org/extension/f-y/peng-sheets">
    <img src="https://img.shields.io/open-vsx/v/f-y/peng-sheets?style=flat-square&label=version" alt="Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=f-y.peng-sheets">
    <img src="https://img.shields.io/visual-studio-marketplace/i/f-y.peng-sheets?style=flat-square&label=VS%20Marketplace" alt="VS Marketplace Installs">
  </a>
  <a href="https://github.com/f-y/peng-sheets/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License">
  </a>
</p>

Here is a paragraph with **bold**, *italic*, `code`, and a [link](https://example.com) all together. Below is a list followed by a table:

1. **Install** the extension from VS Code Marketplace
2. **Open** any Markdown file (`.md`)
3. **Launch** the editor:
   - Click the **table icon** in the title bar
   - Or use Command Palette: **`Markdown: Open with PengSheets`**

| Step | Action | Shortcut |
|------|--------|----------|
| 1 | Bold | `Ctrl+B` |
| 2 | Italic | `Ctrl+I` |
| 3 | Link | `Ctrl+K` |
| 4 | Save | `Ctrl+S` |

> **Note:** All shortcuts follow standard Markdown editor conventions.

```python
# Everything works together!
for step in ["install", "open", "edit"]:
    print(f"Step: {step}")
```

- [x] Implement basic table rendering
- [x] Add multi-sheet support
- [ ] Search & Replace
- [ ] Conditional formatting

> This is a simple blockquote.

> **Tip:** Create a new workbook with `Markdown: Create New Spreadsheet File` command.

> Multi-line blockquote:
>
> PengSheets transforms your Markdown tables into a rich, interactive spreadsheet view.
> Powered by md-spreadsheet-parser, it runs a robust Python parser directly in your editor via WebAssembly.

---

## Headings

### H3: Third Level

#### H4: Fourth Level

##### H5: Fifth Level

###### H6: Sixth Level

---

## Code

### Code Block (Python)

Use `parse_workbook_from_file()` to load your data. The `--format json` flag enables JSON output.


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

### Code Block (JavaScript)

```javascript
import { parseWorkbookFromFile } from 'md-spreadsheet-parser';

const workbook = parseWorkbookFromFile("data.md");
const sheet = workbook.getSheet("Sales Data");
const table = sheet.getTable("Q1 Results");

console.log(table.headers); // ['Year', 'Revenue']
console.log(table.rows);    // [['2024', '1000'], ['2025', '1500']]
```

### Code Block (Bash)

```bash
pip install md-spreadsheet-parser
npm install md-spreadsheet-parser
```

---

## Tables

### Simple Table

| Feature | Description |
|:--------|:------------|
| 🎯 **Excel-like Editing** | Navigate and edit Markdown tables with familiar spreadsheet controls |
| 📑 **Multi-Sheet Workbooks** | Organize data across multiple sheets using Markdown headers |
| 🔢 **Formula Columns** | Auto-calculated columns with formulas and VLOOKUP-style cross-table references |
| ⚡ **Real-time Sync** | Changes in the spreadsheet instantly reflect in your Markdown source |

### Comparison Table

| | PengSheets | Other Editors |
|:--|:--|:--|
| **Multi-Sheet Support** | ✅ Full workbook | ❌ Single table |
| **Parsing Engine** | Python (WASM) | JavaScript |
| **Real-time Sync** | ✅ Bidirectional | ⚠️ One-way |
| **Metadata Support** | ✅ Full | ❌ None |

### Data Table

| Year | Q1 | Q2 | Q3 | Q4 | Total |
|------|-----:|-----:|-----:|-----:|------:|
| 2022 | 1200 | 1350 | 1180 | 1420 | 5150 |
| 2023 | 1500 | 1680 | 1550 | 1790 | 6520 |
| 2024 | 1800 | 2010 | 1920 | 2150 | 7880 |

---

## Horizontal Rules

The three syntaxes all produce the same result:

---

***

___
