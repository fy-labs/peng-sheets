# Changelog

All notable changes to the "PengSheets" extension will be documented in this file.

## [Unreleased]

### Changed
- **Simplified Workbook Detection**: Documents with a single H1 header are now automatically recognized as a Workbook. The previous convention of using `# Tables` as the Workbook marker is no longer required. Documents with multiple H1 headers continue to work as before (backward compatible).
- **Overview Tab**: Content directly under the H1 header is now displayed as a dedicated "Overview" tab. This tab supports renaming and deletion via context menu.

## [1.1.0] - 2026-01-22

### Added
- **Formula Columns**: A powerful new feature for automatic calculations and cross-table lookups
  - **Calculation mode**: Apply formulas to columns using arithmetic expressions (`[Price] * [Quantity]`) or aggregate functions (SUM, AVG, COUNT, MIN, MAX). *Note: Currently limited to columns within the same table.*
  - **Table Lookup mode**: VLOOKUP-style cross-table references to pull values from other tables
  - **Formula Dialog**: Intuitive UI with Expression Builder for building formulas visually
  - **Live Preview**: See calculation results in real-time before applying
  - **Auto-recalculation**: Values update automatically when source data changes
  - **Local Undo/Redo**: Expression input supports Cmd/Ctrl+Z for undo and Cmd/Ctrl+Shift+Z for redo within the dialog
  - **Error Detection**: Non-numeric values in calculations return N/A for easy detection of broken references

### Fixed
- Fix sheet reordering across interleaved documents being incorrectly treated as physical-only moves, causing metadata removal and incorrect document order.
- Fix document save button not working.

## [1.0.6] - 2026-01-11

### Fixed
- Fix column names not saving when edited: The `updateCell` function now correctly handles header row edits (`rowIdx = -1`).

## [1.0.5] - 2026-01-11

### Fixed
- Fix context menu and add-tab dropdown being clipped when displayed near viewport edges.
- Fix + button "Add New Document" inserting document at wrong position in hybrid notebooks.
- Fix certain UI operations (e.g., toolbar formatting, column drag-and-drop) not updating immediately when document is unsaved.

## [1.0.4] - 2026-01-10

### Fixed
- Fix multiline text deletion in edit mode: Delete/Backspace now correctly removes selected text spanning newlines in contenteditable cells.
- Fix split-view layout corruption when deleting tables: Table indices in layout metadata are now properly updated after table deletion.
- Fix visual flicker when pressing Delete key on selected cells: Skip re-parsing workbook during synchronous updates to preserve optimistic UI changes.

### Added
- Add Selection/Range API mock for comprehensive JSDOM testing of contenteditable behavior.
- Add "Delete Pane" button (×) to empty split-view panes with improved empty state UI.

### Improved
- Significantly improved startup speed by replacing Pyodide with native WASM integration.

## [1.0.3] - 2026-01-07

### Fixed
- Fix document edit mode not being cancelled when clicking on bottom tabs.

### Improved
- Add scroll spacer at the end of document view for better scrolling experience.

## [1.0.2] - 2026-01-05

### Fixed
- Eliminate the blank period during extension startup by optimizing the loading indicator's CSS positioning (`position: fixed`).
- Update the underlying `md-spreadsheet-parser` to v1.1.0, improving performance and stability.

## [1.0.1] - 2026-01-05

### Added
- Add context menu item "Edit Table Description" to table tabs.
- Implement metadata editor for editing table descriptions.

### Fixed
- Fix loading timing issues where the extension could hang on initialization.

## [1.0.0] - 2026-01-03

### Added
- Initial release of PengSheets.
- Provides a spreadsheet-like GUI for editing Markdown tables.
- Supports validation, formatting, and rich editing features.
- Powered by `md-spreadsheet-parser` and Pyodide.
