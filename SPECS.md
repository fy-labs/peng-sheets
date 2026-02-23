# Excel-like UI/UX Specification

This document defines the "Excel-like" user experience targeted for `PengSheets`. The goal is to provide a seamless, keyboard-centric, and intuitive interface that matches the mental model of users familiar with spreadsheet software (Excel, Google Sheets), while respecting the constraints and features of Markdown.

## 1. Core Philosophy
*   **Keyboard First**: Every action must be performable via keyboard shortcuts.
*   **Mode-Based Editing**: Clear distinction between "Navigation Mode" (selecting cells) and "Edit Mode" (modifying content).
*   **Instant Feedback**: Operations like selection, editing, and resizing must feel instantaneous.
*   **Safe**: Undo/Redo must be robust and reliable.

## 0. Implementation Status Key
This specification follows the [GitHub Task List](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists) standard for tracking feature implementation status.

- [x] **Implemented**: Feature is fully functional and merged.
- [ ] **Pending**: Feature is specified but not yet implemented.
- [-] **Out of Scope**: Feature is considered but explicitly delayed or rejected for MVP.

## 2. Grid Visualization
### 2.1. Basic Layout
*   **Headers**:
    - [x] **Column Headers**: A, B, C... (Fixed/Sticky at top).
    - [x] **Row Headers**: 1, 2, 3... (Fixed/Sticky at left).
    - [x] **Highlighting**: Active row/column headers should be highlighted to indicate cursor position.
- [x] **Grid Lines**: Subtle but clear separation between cells.
*   **Cell Styling**:
    - [x] **Padding**: Comfortable whitespace within cells.
    - [x] **Text Alignment**: Respect Markdown alignment (Left/Center/Right).
    - [x] **Overflow**: Text should wrap or be truncated with an ellipsis (configurable), expanding on focus.

### 2.2. Visual Feedback
- [x] **Focus Ring**: A distinct border (usually blue/green) around the currently active cell.
- [x] **Selection Overlay**: A semi-transparent overlay indicating the selected range(s).
- [ ] **Fill Handle**: A small square at the bottom-right of the active cell/range for drag-to-fill operations.

## 3. Navigation & Selection
### 3.1. Navigation (Navigation Mode)
- [x] `Arrow Keys`: Move focus one cell in the direction.
- [x] `Tab`: Move right. If at end of row, move to start of next row (optional).
- [x] `Shift + Tab`: Move left.
- [x] `Enter`: Move down.
- [x] `Shift + Enter`: Move up.
- [x] `Home`: Move to the first column of the current row.
- [x] `End`: Move to the last column of the current row (or last data cell).
- [x] `Ctrl/Cmd + Home`: Move to A1.
- [x] `Ctrl/Cmd + End`: Move to the last used cell in the sheet.
- [x] `Ctrl/Cmd + Arrow`: Jump to the edge of the data region.
- [x] `Page Up / Page Down`: Scroll up/down by one screen height.
- [x] `Alt + Page Up / Page Down`: Scroll left/right by one screen width.

### 3.2. Selection
- [x] **Click**: Select single cell.
- [x] **Shift + Click**: Extend selection from active cell to clicked cell (Range Selection).
- [x] **Click Row Header**: Select entire row.
- [x] **Click Column Header**: Select entire column.
- [ ] **Ctrl/Cmd + Click**: Add non-contiguous cells/ranges to selection (Multi-selection).
- [x] **Shift + Arrow Keys**: Extend selection range by one cell.
- [x] **Ctrl/Cmd + Shift + Arrow**: Extend selection to edge of data.
- [x] **Ctrl/Cmd + A**: Select all data. Press again to select entire grid.

## 4. Editing Experience
### 4.1. Modes
- [x] **Navigation Mode**: Default. Typing replaces cell content immediately.
- [x] **Edit Mode**: Entered via `Enter`, `F2`, or `Double Click`. Typing inserts at cursor position.

### 4.2. Entering Edit Mode
- [x] `Typing (Nav Mode)`: **Excel-like Behavior**: Immediately enters Edit Mode and *overwrites* existing cell content with the typed character.
- [x] `F2`: Enters Edit Mode, cursor at end of text.
- [x] `Double Click`: Enters Edit Mode, cursor at clicked position (or select word).
- [x] `Enter`: Moves focus down (Navigation). *Standard Excel behavior.*

### 4.3. While in Edit Mode
- [x] `Arrow Keys`: Move cursor within text.
- [x] `Home/End`: Move cursor to start/end of text.
- [x] `Enter`: Commit changes and move down.
- [x] `Tab`: Commit changes and move right.
- [x] `Esc`: Cancel changes and revert to Navigation Mode.
- [x] `Alt + Enter`: Insert newline.
    - [x] **Persistence**: Converted to `<br>` tag in Markdown table cells to preserve structure.
    - [x] **Display**: Rendered as a line break within the cell.

## 5. Undo / Redo
*   **Global History**:
    - [x] `Ctrl/Cmd + Z`: Undo last action (edit, structure change, paste, etc.).
    - [x] `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y`: Redo.
- [x] **Granularity**: Each "commit" (Enter, Tab, Paste) is one undo step. Typing characters in Edit Mode is *not* separate steps.

## 6. Clipboard Operations
### 6.1. Standard Copy (`Ctrl/Cmd + C`)
*   **Source**:
    - [x] **Range**: Copies TSV data of selected cells.
    - [x] **Row/Column**: If Headers are selected, copies the entire row/column data.
- [x] **Format**: Text/Plain (TSV) for maximum compatibility.

### 6.2. Standard Paste (`Ctrl/Cmd + V`)
- [x] **Behavior**: Overwrites existing content starting from the active cell (Top-Left of selection).
*   **Scenarios**:
    - [x] **Single Cell Source -> Single Cell Target**: Overwrites target.
    - [x] **Single Cell Source -> Range Target**: Fills the entire target range with the source value.
    - [x] **Range Source (NxM) -> Single Cell Target**: Pastes the NxM grid starting at Target. Overwrites existing data. **Expands Selection** to match the pasted range.
    *   **Range Source -> Range Target**:
        - [x] If Source Size same as Target: 1:1 Paste.
        - [x] If Source is smaller: Tiles/Repeats source to fill target? (Excel behavior). *MVP: Just paste top-left.*
    - [x] **Row Source -> Row Target**: Overwrites the target row(s).
    - [x] **External Table (Excel/Web)**: Parsed as TSV.
*   **Grid Expansion**:
    - [x] **Rows**: If pasting N rows exceeds current table height, **automatically add new rows**.
    - [x] **Columns**: If pasting M columns exceeds current table width:
        - [x] **Automatically add new columns**.
        - [x] **Header Generation**: New columns need headers. Auto-generate (e.g., `Column 4`, `Column 5` or empty).
        - [x] **Constraint**: Cannot paste if it breaks valid table structure (rare in Markdown, mostly just expansion).

### 6.3. Insert Paste ("Insert Copied Cells")
- [ ] **Concept**: Analogous to Excel's `Ctrl/Cmd + +` (Insert) when clipboard has content.
- [ ] **Trigger**: Context Menu -> "Insert Copied Cells" or Shortcut (if implemented).
*   **Behavior**:
    - [ ] **Row Mode** (Clipboard is full rows): Inserts N rows *at* the current selection index. Existing rows shift down. Pastes data into new rows.
    - [ ] **Column Mode** (Clipboard is full cols): Inserts N cols *at* current selection. Shift right.
    *   **Range Mode**:
        - [ ] Shift Cells Right vs Shift Cells Down (Dialog or default based on shape).
        - [ ] *MVP*: Only support "Insert Copied Rows" default if full rows copied.

### 6.4. Special Cases
*   **Pasting Full Table into Editor**:
    *   If user copies an entire table (headers + data) from Excel:
    - [x] **Action**: Paste at cursor.
    *   **Handling**:
        - [x] If pasted inside existing table: Treat headers as just another data row? Or try to "smart match"?
        - [x] **Rule**: `Ctrl+V` is raw data paste. If source has headers, they become data in the destination.
    - [ ] **Future**: "Paste as New Table" command (creates new Markdown table structure).

## 7. Table Management
*   **Explicit Creation**:
    - [x] Tables are not infinite. They are distinct entities.
    - [x] **UI**: "Add Table" button (e.g., in a toolbar or below the last table).
    *   **Constraints**:
        - [x] **Header Row Mandatory**: Every table MUST have a header row.
        - [x] **Strict Boundaries**: Empty lines in the grid do not split the table. The table size is explicit.
        - [x] **No "Magic" Splitting**: We do not infer multiple tables from a single grid based on empty rows.

## 8. App & File Structure Integration
### 8.1. Hybrid Document Model (Sheets + Docs)
The application treats a Markdown file as a collection of "Tabs".
- [x] **Workbook Section**: A specific top-level header (default auto-detected, e.g. `# Workbook`) acts as the container for Spreadsheet Sheets.
    - [x] Sub-headers (default `## SheetName`) within this section are parsed as individual **Sheet Tabs**.
- [x] **Document Sections**: All *other* top-level headers (e.g., `# Introduction`, `# Appendix`) are treated as **Document Tabs**.
    - [x] These tabs display the Markdown text content effectively as a "Text Sheet".
    - [x] Users can switch between Sheet Tabs and Document Tabs seamlessly in the same bottom tab bar.
    - [x] **Visual Distinction**: Tabs have icons indicating their type (e.g., Grid icon for Sheets, Document icon for Text).

### 8.2. Empty State (Onboarding)
- [x] **Condition**: If the Markdown file does not contain the Workbook Section (e.g., `# Workbook`).
- [x] **UI**: specific "Home" view is displayed instead of a blank grid.
*   **Actions**:
    - [x] "Create Spreadsheet": Appends the Workbook Section (`# Workbook`) and an initial Sheet (`## Sheet 1`) to the file.

### 8.3. Flexible Persistence
- [x] **Reading**: The parser identifies tables regardless of their location in the file (scanning for Workbook Section).
*   **Writing**:
    - [x] **In-Place Update**: If a table already exists, edits update the corresponding lines in the file, preserving the table's location relative to other content.
    - [x] **Append**: New tables are typically appended to the Workbook Section.
*   **Content Preservation**:
    - [x] When deleting sheets, content before and after the Workbook Section MUST be preserved.
    - [x] The Workbook Section boundary is determined by the next top-level header (same level as root marker) or end of file.
    - [x] Example: In a document with `# Workbook` followed by `# Appendix`, deleting all sheets removes only the content between these headers.

### 8.4. Tab Reordering Rules
Documents and Sheets are different types of tabs that can be mixed in the UI tab bar.

*   **Markdown Structure**:
    - [x] **Workbook**: A Workbook (collection of Sheets) always exists as a contiguous unit in the Markdown file.
    - [x] **Documents**: Documents can appear before, or after Workbooks (e.g., `# Intro`, `# Workbook`, `# Appendix`).

*   **UI Tab Order**:
    - [x] UI tab order can mix Sheets and Documents freely (e.g., `[Sheet1, Doc1, Sheet2, Doc2]`).
    - [x] The display order is managed by Workbook Metadata (`tab_order` array).

*   **Reordering Scenarios**:
    | From | To | Behavior |
    |------|-----|----------|
    | Document A | Document B (same level) | **Physical Move**: Move Document A's text across Document B in Markdown. |
    | Sheet A | Sheet B (same Workbook) | **Physical Move**: Move Sheet A's text across Sheet B within the Workbook. |
    | Document | Workbook boundary | **Physical Move**: Move Document's text to before/after the Workbook section in Markdown. |
    | Document | Between Sheet A and Sheet B | **Metadata Only**: Update `tab_order` in Workbook Metadata. No Markdown text change. |
    | Sheet | Document position | **Metadata Only**: Update `tab_order` in Workbook Metadata. No Markdown text change. |

*   **Key Principle**:
    - Documents and Workbooks are **same-level entities** in Markdown structure.
    - Moving between same-level entities = **Physical Markdown edit**.
    - Moving Sheet ↔ Document (cross-type within UI) = **Metadata-only update** (Workbook position unchanged).

### 8.5. Document/Sheet Insertion Rules
When adding new Documents or Sheets via context menu or "+" button, the physical file placement follows these rules:

*   **Adding Document between Sheets (cross-type position)**:
    - [x] **Physical Placement**: Always inserted **after the Workbook section** in the Markdown file.
    - [x] **Relative Order**: If other Documents exist after Workbook AND appear before the target position in `tab_order`, the new Document is inserted **after the last such Document**.
    - [x] **Example**: `tab_order = [Doc0, Sheet0, Sheet1, Doc1]`, adding Doc at index 2 (between Sheet0 and Sheet1):
        - No Docs after Workbook that are before index 2 → Insert at first position after Workbook.
    - [x] **Example**: `tab_order = [Doc0, Sheet0, Doc1, Sheet1, Doc2]`, adding Doc at index 3 (between Doc1 and Sheet1):
        - Doc1 is after Workbook and before index 3 → Insert after Doc1 in file.

*   **Adding Sheet**:
    - [x] Sheets are always inserted within the Workbook section.
    - [x] Position determined by the Sheet index within the Workbook.

### 8.6. Tab Reorder Test Matrix (Quality Assurance)

This matrix defines the expected behavior for all tab drag-and-drop scenarios. Each row represents a distinct test case.

**Legend:**
- **Physical**: Markdown content is moved in file
- **Metadata**: Only `tab_order` is updated (no file content change)
- **WB**: Workbook section (contains Sheets)

**Fundamental Principles:**

1. **Sheets are inseparable from Workbook**: Sheets (`## SheetName`) can only exist within the Workbook section (`# Workbook`). Moving a Sheet outside the Workbook means moving the entire Workbook.

2. **Cross-type tab order placement**: When the UI tab order shows a Document between Sheets (e.g., `[S1, D1, S2]`), that Document is **always physically placed after the Workbook** in the Markdown file. The file structure would be `[WB(S1,S2), D1]`.

3. **Tab order ≠ Physical order**: The `tab_order` metadata can represent any display order, but the physical Markdown structure follows these constraints:
   - All Sheets are contiguous within Workbook
   - Documents before first Sheet in tab_order → physically before WB
   - Documents after last Sheet in tab_order → physically after WB
   - Documents between Sheets in tab_order → physically after WB

4. **Physical structure derivation**: The classifier must distinguish between:
   - **Visual order** (tabs array): Order displayed in UI, affected by `tab_order` metadata
   - **Physical order**: Order in Markdown file, derived from `sheetIndex`/`docIndex` values
   
   When reordering with existing metadata:
   - **Sheet physical order**: `sheetIndex` 0, 1, 2, ... (always contiguous in WB)
   - **Doc physical order**: `docIndex` 0, 1, 2, ... (always after WB unless metadata says before)

#### 8.6.1. Sheet → Sheet (Within Workbook)

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| S1 | Sheet to adjacent Sheet | `[WB(S1,S2)]` | Drag S1 after S2 | S2, S1 in WB | Physical |
| S2 | Sheet over Sheet (with Docs) | `[D1, WB(S1,S2), D2]` | Drag S1 after S2 | S2, S1 in WB | Physical |

#### 8.6.2. Sheet → Document Position

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| S3 | Single Sheet to before Doc | `[D1, WB(S1)]` | Drag S1 before D1 | `[WB(S1), D1]` | Physical (move WB) |
| S4 | Single Sheet to after Doc | `[WB(S1), D1]` | Drag S1 after D1 | `[D1, WB(S1)]` | Physical (move WB) |
| S5 | Multi-Sheet: Sheet to before Doc | `[D1, WB(S1,S2), D2]` | Drag S1 before D1 | File: `[WB(S1,S2), D1, D2]`, tab: [S1,D1,S2,D2] | Physical + Metadata |
| S6 | Multi-Sheet: Sheet to after Doc | `[D1, WB(S1,S2), D2]` | Drag S2 after D2 | File: `[D1, D2, WB(S1,S2)]`, tab: [D1,D2,S1,S2] | Physical + Metadata |
| C8 | Sheet to inside doc range | `[WB(S1,S2), D1, D2]` | Drag S1 after D1 | File: `[WB(S2,S1), D1, D2]`, tab: [S2,D1,S1,D2] | Physical (sheet reorder) + Metadata |
| C8v | Last sheet to inside doc range | `[WB(S1,S2), D1]` | Drag S2 after D1 | File unchanged, tab: [S1,D1,S2] | Metadata only |

**Key principle for C8**: When a sheet moves to a position after documents (inside doc range), the sheet must be physically reordered to be last in the workbook so that metadata can correctly display it after the documents. If the sheet is already last in the workbook, only metadata update is needed.

#### 8.6.3. Document → Document

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| D1 | Doc to Doc (both before WB) | `[D1, D2, WB]` | Drag D1 after D2 | `[D2, D1, WB]` | Physical |
| D2 | Doc to Doc (both after WB) | `[WB, D1, D2]` | Drag D1 after D2 | `[WB, D2, D1]` | Physical |
| D3 | Doc to Doc (cross WB) | `[D1, WB, D2]` | Drag D1 after D2 | `[WB, D2, D1]` | Physical |

#### 8.6.4. Document → Workbook Boundary

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| D4 | Doc before WB to after WB | `[D1, WB, D2]` | Drag D1 after last Sheet | `[WB, D1, D2]` | Physical |
| D5 | Doc after WB to before WB | `[D1, WB, D2]` | Drag D2 before first Sheet | `[D1, D2, WB]` | Physical |

#### 8.6.5. Document → Between Sheets (Cross-Type)

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| D6 | Doc before WB to between Sheets | `[D1, WB(S1,S2), D2]` | Drag D1 between S1 & S2 | File: `[WB(S1,S2), D1, D2]`, tab: [S1,D1,S2,D2] | Physical + Metadata |
| D7 | Doc after WB to between Sheets | `[D1, WB(S1,S2), D2]` | Drag D2 between S1 & S2 | File unchanged, tab: [D1,S1,D2,S2] | Metadata only |
| D8 | Doc after WB to between Sheets (reorder) | `[WB(S1,S2), D1, D2]` | Drag D2 between S1 & S2 | File: `[WB(S1,S2), D2, D1]`, tab: [S1,D2,S2,D1] | Physical + Metadata |

**Key principle for D8**: When tab order for docs-after-WB differs from physical order, the physical order should be updated to match. This ensures the first displayed doc is also first in the file.

#### 8.6.6. Finite Pattern Edge Cases (Multi-Doc & No-Op)

| # | Scenario | Initial File | Action | Expected Behavior | Physical/Metadata |
|---|----------|--------------|--------|-------------------|-------------------|
| E1 | Drop on Self (Start) | `[D1, WB]` | Drag D1 to 0 | No Change | No-Op |
| E2 | Drop on Self (End) | `[WB, D1]` | Drag D1 to last | No Change | No-Op |
| E3 | Same Side No-Op | `[D1, D2, WB]` | Drag D1 before WB | `[D1, D2, WB]` (Index matches self) | No-Op |
| E4 | Leapfrog Docs | `[D1, D2, D3, WB]` | Drag D1 after D3 | `[D2, D3, D1, WB]` | Physical |
| E5 | Reverse Leapfrog | `[D1, D2, D3, WB]` | Drag D3 before D1 | `[D3, D1, D2, WB]` | Physical |
| E6 | Interleaved Stability | `[D1, WB, D2]` | Drag D1 after D2 | `[WB, D2, D1]` | Physical + Metadata |

#### 8.6.7. Hazard Scenarios (Bug Reproduction)

These scenarios target specific reported bugs where outcome types are misidentified.

| # | Scenario | Initial State | Action | Expected Behavior | Physical/Metadata |
|---|----------|---------------|--------|-------------------|-------------------|
| H1 | Restore Natural Order (Stale Metadata failure) | File: `[WB(S1,S2), D1]`, Tab: `[S1, D1, S2]` | Drag D1 after S2 | Tab: `[S1, S2, D1]` (Matches File) | Metadata (Remove) |
| H2 | Force Physical Normalization (Missing Physical failure) | File: `[D1, WB(S1,S2)]`, Tab: `[D1, S1, S2]` | Drag D1 between S1/S2 | File: `[WB, D1]`, Tab: `[S1, D1, S2]` | Physical + Metadata |
| H8 | Interleaved Doc -> Doc (Group Internal Reorder) | File: `[S1, D1, S2, D2]`, Tab: `[S1, D1, S2, D2]` | Drag D2 before D1 | File: `[S1, D2, D1, S2]`, Tab: `[S1, D2, D1, S2]` | Physical |
| H9 | Sheet across interleaved Doc (Physical Normalization) | File: `[WB(S1,S2), D1]`, Tab: `[S1, D1, S2]` | Drag S1 between D1/S2 | File: `[D1, WB(S1,S2)]`, Tab: `[D1, S1, S2]` | Physical (move WB) + Metadata (remove) |
| H10 | Sheet to end across docs (Interleaved Metadata) | File: `[WB(S1,S2), D1, D2]`, Tab: `[S1, D1, S2, D2]` | Drag S1 to end | File: `[WB(S2,S1)]`, Tab: `[D1, S2, D2, S1]` | Physical (move sheet) + Metadata |
| H11 | Sheet to between S2/D2 (Sheet order differs) | File: `[WB(S1,S2), D1, D2]`, Tab: `[S1, D1, S2, D2]` | Drag S1 between S2/D2 | File: `[D1, WB(S1,S2), D2]`, Tab: `[D1, S2, S1, D2]` | Physical (move WB) + Metadata (order differs) |
| H12 | Interleaved Sheet Reorder (Visual != Physical) | File: `[WB(S1,S2), D1, D2]`, Tab: `[S1, D1, S2, D2]` | Drag S1 after D1 | File: `[WB(S2,S1), D1, D2]`, Tab: `[D1, S2, S1, D2]` | Physical (move sheet) + Metadata |
| H13 | Interleaved Doc Reorder (Visual != Physical) | File: `[WB(S1,S2), D1, D2]`, Tab: `[S1, D1, S2, D2]` | Drag D2 after S1 | File: `[WB(S1,S2), D2, D1]`, Tab: `[S1, D2, D1, S2]` | Physical (move doc) + Metadata |

**Key Rules:**
1. Sheet→Sheet: Physical reorder within Workbook section only
2. Sheet→Doc position: **Workbook moves** to place Sheet at target position + tab_order updates
3. Doc→Sheet position: Physical move if Doc changes sides of WB; Metadata-only if stays same side
4. Doc→Doc: Always physical move
5. Doc between sheets reorder: If display order of docs-after-WB differs from file order, **physical reorder** needed
6. **Physical Normalization Principle (H9)**: When a Sheet move causes a Document to become visually first (before all Sheets), the Workbook MUST be physically moved after that Document. The resulting file structure should match the visual order, eliminating the need for metadata.
7. **Sheet Order Check (H11)**: After Physical Normalization, if the visual sheet order differs from the physical sheet order, metadata IS required to express the display order.
8. **Interleaved Reorder (H12/H13)**: When visual order differs from physical order due to existing metadata, the classifier MUST compare visual positions with physical indices to determine if physical reorder is needed.

**Metadata Necessity:**

The `tab_order` metadata is **only required** when the display order differs from the natural physical order. In most cases, tab order can be derived from file structure.

| Condition | Metadata Required? |
|-----------|-------------------|
| Tab order = Physical order | **No** - derivable from file |
| Doc displayed between Sheets | **Yes** - not expressible in physical order |
| Sheet display order ≠ physical order | **Yes** - override needed |

**Default tab order** (derivable from file):
```
[Docs physically before WB] → [Sheets in physical order] → [Docs physically after WB]
```

**Implementation guideline:**
1. After physical move, recalculate expected tab_order from new file structure
2. If expected tab_order matches desired display order → **remove metadata** (keep file clean)
3. If expected tab_order differs from desired display order → **save metadata**

#### 8.6.8. Finite Pattern Classification Matrix

All tab reorder scenarios classified by explicit pattern for implementation:

**Sheet → Sheet (In-Workbook)**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| SS1 | Adjacent swap (no docs) | S1↔S2, no docs present | move-sheet | None |
| SS2 | Adjacent swap (docs present) | S1↔S2, docs exist | move-sheet | Remove if matches |
| SS3 | Non-adjacent swap | S1→S3 position | move-sheet | Remove if matches |

**Sheet → Before Document**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| SBD1 | Single sheet before doc | 1 sheet, move before doc | move-workbook (before-doc) | None |
| SBD2 | Multi-sheet, one before doc | 2+ sheets, 1 before doc | move-workbook (before-doc) | Required |

**Sheet → After Document**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| SAD1 | Single sheet after doc | 1 sheet, move after doc | move-workbook (after-doc) | None |
| SAD2 | Multi-sheet after doc (no reorder) | 2+ sheets, last sheet after doc | move-workbook | Required |
| SAD3 | Doc becomes first, sheets contiguous, order same | D first in visual, sheet order unchanged | move-workbook | None (H9) |
| SAD4 | Doc becomes first, sheets contiguous, order differs | D first in visual, sheet order changed | move-workbook | Required (H11) |
| SAD5 | Sheet to end across multiple docs | Sheet past docs | move-sheet | Required (H10) |

**Sheet → Inside Doc Range (C8)**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| SIDR1 | Sheet inside doc range (not last) | Non-last sheet to doc range | move-sheet (to end) | Required |
| SIDR2 | Sheet inside doc range (already last) | Last sheet to doc range | None | Required |
| SIDR3 | Interleaved sheet reorder (H12) | Visual sheet order ≠ physical (sheetIndex) order | move-sheet | Required |

**Document → Document**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| DD1 | Both before WB | D1↔D2, both before WB | move-document | Remove if matches |
| DD2 | Both after WB | D1↔D2, both after WB | move-document | Remove if matches |
| DD3 | Cross WB (before→after) | D moves from before to after WB | move-document | Remove if matches |
| DD4 | Cross WB (after→before) | D moves from after to before WB | move-document | Remove if matches |
| DD5 | Interleaved docs reorder | Docs interleaved with sheets, reorder | move-document | Required |

**Document → Between Sheets**

| Pattern ID | Name | Trigger | Physical | Metadata |
|------------|------|---------|----------|----------|
| DBS1 | Doc before WB to between sheets | D before WB → between S1/S2 | move-document | Required |
| DBS2 | Doc after WB to between sheets (no move) | D after WB already in position | None | Required |
| DBS3 | Doc after WB to between sheets (reorder) | D after WB needs reorder | move-document | Required |
| DBS4 | Interleaved doc reorder (H13) | Visual doc order ≠ physical (docIndex) order | move-document | Required |

**Metadata Removal Patterns**

| Pattern ID | Name | Trigger | Action |
|------------|------|---------|--------|
| MR1 | Restore natural order | Visual matches physical after move | Remove metadata |
| MR2 | Physical normalization complete | After move-workbook, visual = physical | Remove metadata |




## 9. Markdown Specific Features
These features are specific to the Markdown context but should be integrated into the UI.

*   **Alignment Control**:
    - [x] Toolbar buttons or Context menu to set Column Alignment (Left, Center, Right).
    - [ ] Visual indicator in Column Header (e.g., icon).
*   **Formatting Shortcuts**:
    - [x] `Ctrl/Cmd + B`: Bold (`**text**`).
    - [x] `Ctrl/Cmd + I`: Italic (`*text*`).
    - [ ] `Ctrl/Cmd + K`: Insert Link (`[text](url)`).
*   **Escaping**:
    - [x] Automatically handle pipe `|` characters in text (escape as `\|`).
    - [x] Handle newlines (escape or `<br>`).

## 10. Markdown-Specific Data Structures
Unlike Excel, our data model includes metadata specific to the Markdown context.

*   **Table Name**:
    - [x] **Concept**: A title for the table (parsed from preceding Header).
    - [ ] **UI**: An editable input field prominently displayed above the grid.
    - [x] **Behavior**: Optional. If empty, the header is removed from Markdown.
*   **Description**:
    - [x] **Concept**: Text describing the table (parsed from text between Header and Table).
    - [x] **UI**: An editable text area or input field between the Table Name and the Grid.
    - [x] **Behavior**: Optional.

## 11. Structural Manipulation
### 11.1. Rows & Columns
*   **Insert**:
    - [x] Right-click context menu: "Insert Row Above/Below", "Insert Column Left/Right".
    - [x] Shortcuts: `Ctrl/Cmd + +` (with row/col selected).
*   **Delete**:
    - [x] Right-click context menu: "Delete Row", "Delete Column".
    - [x] Shortcuts: `Ctrl/Cmd + -` (with row/col selected).
*   **Resize**:
    - [x] Drag boundaries between column headers to resize width.
    - [x] Double-click boundary to "Auto-fit" width to content.
*   **Move**:
    - [x] **Drag & Drop rows/columns by grabbing the header**. (High Priority)

### 11.2. Sorting
- [x] Clicking a sort icon in the column header (Toggle: Asc -> Desc -> Off).

## 12. Auto Fill (Fill Handle)
The "Fill Handle" is the small square at the bottom-right of the active cell or selection. Dragging it allows for rapid data entry and pattern extension.

### 12.1. Basic Behavior (Drag)
- [ ] **Trigger**: Click and drag the Fill Handle over adjacent cells (Down/Right for typical use, Up/Left for removing/reverse).
*   **Logic**:
    - [ ] **Single Number** (`1`): **Copy** (1, 1, 1). *(Excel Default)*.
        - [ ] *Modifier*: Hold `Ctrl/Alt` (platform dependent) to **Fill Series** (1, 2, 3).
    - [ ] **Single Number-String** (`Day 1`): **Fill Series** (Day 2, Day 3).
    - [ ] **Date/Time** (`2024-01-01`): **Fill Series** (2024-01-02, ...).
    - [ ] **Single String** (`Apple`): **Copy**.
    *   **Multi-Cell Selection (Pattern)**:
        - [ ] If `1, 2` selected: Detect linear trend -> **3, 4, 5**.
        - [ ] If `Jan, Mar` selected: Detect interval -> **May, Jul**.
        - [ ] If no clear pattern: **Repeat Sequence** (A, B, A, B).

### 12.2. Advanced Behavior
*   **Double Click**:
    - [ ] If the Fill Handle is double-clicked from a cell (or range) with data in the *adjacent left column*.
    - [ ] **Action**: Automatically fill down to match the height of the adjacent column's data.
*   **Flash Fill (Future)**:
    - [ ] Detect string manipulation patterns (e.g., extracting "John" from "John Doe") - *Out of Scope for MVP*.

### 12.3. Implementation Nuances
- [ ] **Markdown Persistence**: All filled data is written as plain text. No formulae or dynamic links.
- [ ] **Undo**: The entire fill operation is a single undo step.

## 13. Data Validation (Input Rules)
- [ ] **Goal**: Restrict input to maintain data integrity, similar to Excel's Data Validation.
*   **Excel Features vs Extension**:
    - [ ] **List (Dropdown)**:
        - *Excel*: Defined comma-separated list or cell range.
        - *Extension*: Defined in metadata (e.g., `["Open", "Closed"]`). Renders as a dropdown in edit mode.
    - [x] **Data Type validation**:
        - *Excel*: Whole Number, Decimal, Date, Time, Text Length.
        - *Extension*: Schema-based validation. If a column is defined as `int`, warn or block non-integer input.
    - [x] **Error Alert**:
        - *Excel*: Popup blocking execution.
        - *Extension*: Toast notification or red cell border (non-blocking preferred).
    - [x] **Input Message**:
        - *Excel*: Tooltip when cell is selected.
        - *Extension*: Tooltip or Status Bar message.
- [x] **Metadata Persistence**: Validation rules must be stored in the table metadata (JSON/YAML in comments) to persist across sessions.

## 14. Visual Formatting & Excel Compatibility Roadmap
Excel has a vast array of formatting options. Since Markdown is plain text, we cannot support everything natively. We will implement support in phases, potentially using metadata (HTML comments or YAML frontmatter) to persist non-standard attributes.

### 14.1. Excel Formatting Features (Reference)
*   **Number Formats**: General, Number, Currency, Accounting, Date, Time, Percentage, Fraction, Scientific, Text, Custom.
*   **Font**: Family, Size, Bold, Italic, Underline, Strikethrough, Color, Sub/Superscript.
*   **Fill**: Background Color, Pattern Style/Color, Gradients.
*   **Borders**: Top, Bottom, Left, Right, All, Outside, Thick, Double, Dotted, Dashed, Colors.
*   **Alignment**:
    *   Horizontal: Left, Center, Right, Justify, Fill.
    *   Vertical: Top, Middle, Bottom, Justify.
    *   Control: Wrap Text, Shrink to Fit, Merge Cells.
    *   Orientation: Rotation angles.
    *   Indentation.
*   **Conditional Formatting**: Data Bars, Color Scales, Icon Sets, Rules.
*   **Protection**: Locked, Hidden.

### 14.2. Implementation Roadmap

#### Phase 1: Core Editing & Native Markdown - [Completed]
*   [x] **Hybrid Structure**: Support for Document Tabs (read-only text views) alongside Sheet Tabs.
*   [x] **Onboarding**: Home Screen for creating the initial Workbook structure.
*   [x] **Basic Editing**: Cell value editing with real-time Markdown updates (In-place persistence).
*   [x] **Navigation**: Arrow keys, Tab/Enter navigation.
*   [x] **Line Breaks**: Support for in-cell newlines (persisted as `<br>`).
*   [x] **Native Formatting UI**:
    *   **Alignment**: Column alignment (Left/Center/Right).
    *   **Text Style**: Bold, Italic, Strikethrough, Links.

#### Phase 2 (MVP): Structural Operations & Excel Feel (Current Focus)
*   **Editing**:
    *   **Excel-like Typing**: Overwrite on type.
*   **Row/Column Management**:
    *   **Selection**: Click headers to select entire row/col.
    *   **Insert/Delete**: Context menu AND shortcuts. Support inserting multiple rows if multiple selected.
    *   **Move**: Drag and drop rows/columns.
*   **Clipboard Operations**:
    *   Copy/Paste ranges (TSV).
    *   **Paste to Add**: Pasting data that overflows grid adds new rows/cols.

#### Phase 3: Layout & Metadata Persistence
*   **Table Metadata**: UI for Table Name and Description.
*   **Column Widths**: Resizable columns, persisted via metadata (e.g., HTML comments or YAML).
*   **Wrap Text**: Toggle wrapping per column/cell.

#### Phase 4: Advanced Visuals & Logic (Conditional Formatting)
*   **Conditional Formatting**:
    *   **Goal**: Visually distinguish rows based on data (e.g., "Status" = "Inactive" -> Gray background).
    *   **Implementation**: Define rules in metadata. Renderer applies styles dynamically.
    *   **Supported Styles**: Background color, Text color, Strikethrough.
*   **Validation**: Visual indicators for invalid data types (if schema is defined).

#### Phase 5: Extended Data Types
*   **Number Formats**: Display masks (e.g., `$1,000`) while keeping raw data (`1000`).
*   **Date/Time**: Date pickers and formatters.

#### Out of Scope
*   **Merge Cells**: Fundamentally incompatible with Markdown tables.
*   **Arbitrary Cell Styling**: Ad-hoc background colors (cell-by-cell painting) are discouraged in favor of rule-based Conditional Formatting to keep Markdown clean.

## 15. Conditional Formatting
We support rule-based formatting to visually distinguish rows or cells based on their values.

### 15.1. Supported Scenarios (MVP)
- [ ] **Row Highlighting based on Column Value**:
    - **Rule**: `IF [ColumnName] == "Value" THEN RowBackground = Color`
    - **Use Case**: "If Status is 'N/A', make the row gray."
    - **Persistence**: Rules are stored in Table Metadata.

### 15.2. Usage
- [ ] **UI**: "Conditional Formatting" button in Toolbar.
- [ ] **Dialog**: Simple builder: "Where [Column] is [Value] set row color [Color]".

## 16. Advanced / Future
- [ ] **Search & Replace (`Ctrl/Cmd + F`)**: Search within the grid.
- [x] **Context Menu**: Comprehensive right-click menu.

## 17. Formula Columns (Computed Columns / 算出列)
This feature implements calculated columns similar to Pivot Table calculated fields or simplified Excel Formulas, but with a unique approach to data persistence suited for Markdown.

### 17.1. Concept & Data Model
- [ ] **Philosophy**: "**Markdown holds current data; Metadata holds the logic.**"
*   **Behavior**:
    - [ ] The spreadsheet does *not* store formulas (e.g., `=A1+B1`) in the cell text content. The Markdown table remains pure static data.
    - [ ] **Persistence**: The calculation definition/logic is stored in the **Table Metadata** (hidden from the rendered Markdown).
    - [ ] **Runtime**: The Editor maintains a "Dependency Graph" in memory.
    - [ ] **Reactivity**: When a "Source" value changes, the Editor automatically calculates the result and updates the *text content* of the "Target" (Formula) column in the Markdown buffer immediately.
    - [ ] **Benefit**: The Markdown file remains a valid, readable, and portable static table for any other Markdown viewer (GitHub, Obsidian, etc.), while the Editor provides the "smart" behavior.

### 17.2. User Interface
*   **Entry Points**:
    - [ ] **Context Menu**: Right-click a Column Header -> **"Set as Formula Column"** (算出列に設定).
    - [ ] **Toolbar**: **"Add Formula Column"** button (Adds a new column on the right and opens config).
*   **Configuration Dialog (Modal)**:
    - [ ] A dedicated modal for defining the column logic.
    *   **Formula Type Selector**:
        1.  [ ] **Arithmetic / Expression**: `[Quantity] * [Unit Price]`.
        2.  [ ] **Lookup (VLOOKUP-style)**: Reference another table.
        3.  [ ] **Aggregation**: Running totals, etc. (Future).
    *   **Inputs (Dynamic based on Type)**:
        - [ ] *Expression*: Simple text input with autocomplete for column names `[Column]`.
        - [ ] *Lookup*:
            - [ ] **Master Table**: Dropdown of other tables in the Project.
            - [ ] **Join Key (Local)**: Column in current table (e.g., `Product ID`).
            - [ ] **Join Key (Remote)**: Column in Master Table to match (e.g., `ID`).
            - [ ] **Target Field**: Column in Master Table to retrieve (e.g., `Price`).
*   **Visual Indication**:
    - [ ] Formula Columns have a distinct visual style in the header (e.g., a function `fx` icon).
    - [ ] Cells in Formula Columns are **Read-Only** (or show a warning if user tries to manually edit, as manual edits would be overwritten by the formula).

### 17.3. Execution Logic
1.  [ ] **Linkage**: On load, the Editor parses metadata and establishes listeners on "Source Columns" (e.g., "Quantity", "Price").
2.  [ ] **Trigger**: User edits a cell in a Source Column.
3.  [ ] **Process**:
    - [ ] The `FormulaController` identifies dependent columns.
    - [ ] It executes the logic (e.g., `row.Quantity * row.Price`).
    - [ ] It updates the value of the Formula Column cell in the **same row**.
    - [ ] **Master Table Changes**: If a record in a linked Master Table is updated, the Editor scans all tables referencing it and updates their Lookup columns.
4.  [ ] **Serialization**: The calculated values are written to the Markdown file as standard text. The logic is saved in the metadata block.

## 18. Technical Architecture Implications (Separation of Concerns)
To achieve this, the implementation must be modular:

*   **Grid Model**: Pure state management (Cells, Rows, Cols, Selection). Independent of rendering.
*   **Selection Model**: Handles complex selection logic (Ranges, Multi-select).
*   **Command System**: All actions (Edit, Move, Resize) should be Commands to support Undo/Redo easily.
*   **Renderer**: Dumb component that just renders the Model. (Canvas-based or Virtual DOM based for performance).
*   **Input Controller**: Handles keyboard/mouse events and dispatches Commands.
*   **Clipboard Manager**: Handles serialization/deserialization.

## 19. Code Architecture Backlog

Refactoring tasks for `webview-ui/main.ts` and related components.

### 19.1. Tab Bar Component Extraction (Phase 4)
- [x] Create `<bottom-tabs>` component to encapsulate tab bar logic.
- [x] Properties: `tabs`, `activeIndex`, `editingIndex`.
- [x] Events: `tab-select`, `tab-rename`, `tab-drag`, `tab-context-menu`.
- [x] Move drag-and-drop, inline editing, and scroll indicator logic from `main.ts`.

### 19.2. Event Handler Consolidation (Phase 5)
- [x] Refactor `firstUpdated()` event listeners into a Lit `ReactiveController`.
- [x] Create `GlobalEventController` for window-level event management.
- [x] Improve `disconnectedCallback()` cleanup to prevent memory leaks.

