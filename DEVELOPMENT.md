# Development Guide (Full Stack)


> [!NOTE] 
> Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before starting development.

This document outlines the development practices for the `PengSheets` extension, covering the Extension Host (Node.js) and Webview (Lit).

## 1. Architecture Overview

```mermaid
graph TD
    EXT[Extension Host (Node)] <-->|Messages| WB[Webview (HTML/Lit)]
    WB <-->|TypeScript Editor| WASM[md-spreadsheet-parser (WASM)]
```

-   **Extension Host**: Handles file I/O, VS Code API, and Undo/Redo stack.
-   **Webview**: Renders the UI and hosts the TypeScript editor logic.
-   **md-spreadsheet-parser**: NPM package providing Markdown table parsing via WASM.

## 2. Directory Structure

-   `src/`: Extension Host (Node.js) code.
-   `src/editor/`: TypeScript editor services (ported from Python).
-   `webview-ui/`: Frontend (Lit) code.
-   `webview-ui/tests/`: Vitest tests for webview and editor.

## 2.5 Code Style Rules

### Import Statements

**All imports must be placed at the top of the file.** Do not use dynamic `await import()` within functions. Use static imports at the file header.

```typescript
// ✅ CORRECT: Static imports at file top
import * as editor from '../../src/editor';
import { someFunction } from './utils';

// ❌ WRONG: Dynamic import inside function
async function example() {
    const editor = await import('../../src/editor'); // Don't do this!
}
```

## 3. Parser Package

The extension uses the `md-spreadsheet-parser` NPM package for Markdown parsing. This package is installed as a dependency and bundled with the extension.

### Using Development Parser (Not Published to PyPI)

When using a locally built `md-spreadsheet-parser` during development:

> [!IMPORTANT]
> **Do NOT use `npm install` for local development parser.** Use direct copy instead.

```bash
# ❌ WRONG: npm install causes WASM loading errors in Vitest
npm install ../md-spreadsheet-parser/packages/npm

# ✅ CORRECT: Direct copy works reliably
rm -rf node_modules/md-spreadsheet-parser
cp -R ../md-spreadsheet-parser/packages/npm node_modules/md-spreadsheet-parser
```

**Why?** `npm install` with local paths creates symlinks or performs file transformations that break WASM loading in the Vitest test environment (`ERR_INVALID_URL_SCHEME` errors). Direct copy preserves the exact file structure.

### Updating the Parser (Full Procedure)

When updating parser after Python changes:

> [!CAUTION]
> **Must clean Extension build cache** after parser update, otherwise Vite may bundle stale WASM.

```bash
# 1. Build Python wheel in parser directory (use -o dist to ensure correct output)
cd ../md-spreadsheet-parser
uv build -o dist

# 2. Build NPM package
cd packages/npm
npm run build

# 3. Copy to Extension
cd ../../..  # back to peng-sheets
rm -rf node_modules/md-spreadsheet-parser
cp -R ../md-spreadsheet-parser/packages/npm node_modules/md-spreadsheet-parser

# 4. CRITICAL: Clean Extension build cache
rm -rf out

# 5. Rebuild Extension
npm run compile
```

**Common Problem**: `uv build` in a workspace may output to the workspace root (`md-spreadsheet-suite/dist`) instead of the submodule (`md-spreadsheet-parser/dist`). Always use `uv build -o dist` to ensure correct output location.

## 4. Frontend Development (Webview)

### Testing
-   **Unit Tests (`vitest`)**:
    ```bash
    npm run test:webview
    ```
    Test UI components and editor services in isolation (`webview-ui/tests/`).

### Linting & Formatting

-   **Lint check**:
    ```bash
    npm run lint
    ```
    Runs ESLint with Prettier integration to check for code style issues.

-   **Auto-fix lint issues**:
    ```bash
    npm run lint:fix
    ```
    Automatically fixes formatting and simple lint errors.

> [!IMPORTANT]
> Always run `npm run lint:fix` before committing changes.

### Internationalization (i18n)
-   Use `t('key')`.
-   Update `webview-ui/utils/i18n.ts`.

## 5. Extension Development (Node.js)

### Running Integration Tests
```bash
npm test
```
Runs the extension in a real VS Code instance.

### Coverage
```bash
npm run test:coverage
```
Collects coverage for the TypeScript extension code using `c8`.

## 6. Build & Release

To package the full extension (`.vsix`):

```bash
vsce package
```

### Publishing to Marketplace

1.  **Bump Version**:
    ```bash
    npm version patch # or minor/major
    ```

2.  **Publish to VS Code Marketplace**:
    ```bash
    vsce publish
    ```

3.  **Publish to Open VSX Registry**:
    ```bash
    # Requires 'ovsx' CLI: npm install -g ovsx
    ovsx publish peng-sheets-x.x.x.vsix -p <OPEN_VSX_TOKEN>
    ```

---

## 6.5 Optimistic Update and isSyncing Pattern

When the user edits cells (delete, paste, type, etc.), the webview uses **Optimistic Update** to provide immediate feedback:

1. **UI updates immediately** (e.g., `table.rows[r][c] = ''`)
2. Change event is dispatched (e.g., `range-edit`)
3. `SpreadsheetService` sends update to VS Code extension
4. VS Code updates the document and sends new content back

### The Problem

Without proper handling, the VS Code response triggers `_parseWorkbook()`, which:
- Re-parses the entire workbook from markdown
- Replaces `this.workbook` with the parsed data
- This can cause **visual flicker** because the re-parse momentarily shows data that doesn't match the optimistic update

### The Solution: `isSyncing` Flag

The `SpreadsheetService` exposes an `isSyncing` getter:

```typescript
// spreadsheet-service.ts
public get isSyncing(): boolean {
    return this._isSyncing;
}
```

When `isSyncing` is `true`, the service is waiting for VS Code's response to our own change.

In `GlobalEventController._handleMessage`, we skip `_parseWorkbook()` during sync:

```typescript
if (this.host.spreadsheetService.isSyncing) {
    // Skip re-parse - optimistic update is already correct
    this.host.spreadsheetService.notifyUpdateReceived();
} else {
    await this.host._parseWorkbook();
    this.host.spreadsheetService.notifyUpdateReceived();
}
```

### When to Use This Pattern

Use `isSyncing` check when:
- Receiving external updates that might conflict with optimistic UI changes
- Implementing new edit operations that update UI before server confirmation

---

## 6.6 Undo Batching for Multi-Step Operations

When an operation involves multiple steps (e.g., cell edit + formula recalculation), they should be consolidated into a single Undo stack so that `Ctrl+Z` reverts everything at once.

### Implementation Pattern

```typescript
// In SpreadsheetService
private _performAction<T extends IUpdateSpec>(fn: () => T) {
    // Start batch BEFORE the action
    this.startBatch();
    try {
        const result = fn();
        if (result) this._postUpdateMessage(result);
        // Callback runs WITHIN the same batch
        this._onDataChanged?.();
    } catch (err) {
        console.error('Operation failed:', err);
    } finally {
        // End batch AFTER everything completes
        this.endBatch();
    }
}
```

### Key Points

1. **Caller manages the batch**: Operations like `updateRange` and `_performAction` call `startBatch()` before executing
2. **Callbacks use `withinBatch: true`**: The `recalculateAllFormulas` function accepts a `withinBatch` parameter to skip its own batch management
3. **Single `endBatch()` at the end**: All updates are collected and sent as one message to VS Code

### For New Operations

When adding new data-modifying operations:
1. Wrap the operation in `startBatch()`/`endBatch()`
2. Call `_onDataChanged?.()` inside the batch
3. Use `_performAction` helper when possible - it handles batching automatically

---

## 6.7 Deferred Save for Non-Undo Operations

Some UI state changes (like tab switching) should be persisted to the file but should **not** create undo entries. These use the **deferred save** architecture.

### Problem

When switching table tabs in split-pane layouts, the `activeTableIndex` is updated in sheet metadata. If saved immediately, each tab switch creates an undo entry, polluting the undo stack.

### Solution: Deferred Save Queue

Instead of saving immediately, tab switches queue their updates to be applied with the next actual file edit:

```
Tab Switch → 'sheet-metadata-deferred' event
    ↓
GlobalEventController → queueDeferredMetadataUpdate()
    ↓
SpreadsheetService._deferredMetadataUpdates (Map)
    ↓
Next actual edit → startBatch() → _applyDeferredUpdates()
    ↓
Deferred update included in same batch as actual edit
```

### Key Files

- `webview-ui/components/layout-container.ts` - Dispatches `sheet-metadata-deferred` for switch-tab
- `webview-ui/controllers/global-event-controller.ts` - Routes event to service
- `webview-ui/services/spreadsheet-service.ts` - Manages deferred queue

### When to Use This Pattern

Use deferred save when:
- The change should be saved to file eventually
- The change should NOT create an undo entry
- The change can wait until the next actual edit

Examples: tab selection, scroll position, expanded/collapsed states

---

## 6.8 Computed Column Recalculation

Computed columns (formula columns defined in table metadata) are automatically recalculated after any data-modifying operation.

### Architecture

```
Data Operation → onDataChanged callback → recalculateAllFormulas()
                                                    ↓
                                          getCurrentWorkbook() from editor
                                                    ↓
                                          Evaluate all formulas (Lookup → Arithmetic)
                                                    ↓
                                          Compare with current values
                                                    ↓
                                          Sync changed cells via updateRangeBatch()
```

### Key Files

- `webview-ui/services/formula-recalculator.ts` - Core recalculation logic
- `webview-ui/services/spreadsheet-service.ts` - `getCurrentWorkbook()` and callback registration
- `webview-ui/main.ts` - Callback registration in `connectedCallback()`

### Troubleshooting: Recalculation Not Working

If formula columns are not updating after data changes, check these common causes:

#### 1. Stale Workbook Data
**Symptom**: Values don't change after column/row deletion or structural changes
**Cause**: Using `this.workbook` instead of fresh editor state
**Solution**: Use `getCurrentWorkbook()` to get fresh state from editor:
```typescript
this.spreadsheetService.setOnDataChangedCallback(() => {
    const currentWorkbook = this.spreadsheetService.getCurrentWorkbook();
    recalculateAllFormulas(currentWorkbook, ...);
});
```

#### 2. Callback Not Registered
**Symptom**: No recalculation after any operation
**Check**: Verify callback is registered in `connectedCallback()`:
```typescript
this.spreadsheetService.setOnDataChangedCallback(() => { ... });
```

#### 3. Operation Not Calling Callback
**Symptom**: Some operations don't trigger recalculation
**Cause**: Operation doesn't call `_onDataChanged?.()` or uses `_enqueueRequest` instead of `_performAction`
**Solution**: Ensure all data-modifying operations call `_onDataChanged?.()` after completing

#### 4. `withinBatch` Mismatch
**Symptom**: Batch errors or missing updates
**Cause**: Caller uses batch but passes `withinBatch: false`, or vice versa
**Solution**: Match `withinBatch` parameter to whether caller manages batch

#### 5. Change Detection Not Finding Updates
**Symptom**: Recalculation runs but `updates found: 0`
**Check**: Possible causes:
- Formula evaluates to same value as before
- Referenced column name changed but formula uses old name
- Workbook data is stale (see #1)

### Debug Tips

Add temporary logs to trace the flow:
```typescript
console.log('[DEBUG] recalculateAllFormulas: updates found:', updates.length);
console.log('[DEBUG] evaluateTask row 0: currentValue:', currentValue, 'newValue:', newValue);
```

---

## 6.9 Quality Guidelines

This section documents patterns and practices critical to application quality.

### 6.9.1 Bug Fix Policy: Reproduction Test First

> [!CAUTION]
> **Reproduction test MUST be implemented BEFORE fixing the bug.**
> A bug that exists is less critical than a bug that tests cannot detect.

#### Why Test-First is Mandatory

1. **Tests can pass while UI fails**: Tests may call functions differently than production code
2. **False confidence is dangerous**: Passing tests without proper reproduction hide real bugs
3. **RCA reveals gaps**: Root cause analysis often shows test/production flow mismatches

#### The Correct Flow

```
1. Report bug
   ↓
2. Write FAILING reproduction test that simulates production flow
   ↓
3. Verify test FAILS (if passes, test is wrong)
   ↓
4. Implement fix
   ↓
5. Verify test PASSES
   ↓
6. Run full test suite
   ↓
7. UI verification by user
   ↓
8. Commit
```

#### Reproduction Test Requirements

A proper reproduction test must:

1. **Simulate exact production flow**: Match the actual code path (reference specific line numbers)
2. **Fail before fix**: If test passes immediately, it's not reproducing the bug
3. **Document the bug mechanism**: Include comments explaining why the bug occurs

Example (from Hazard 61 fix):

```typescript
it('Scenario 2: D1 → before S1 should REMOVE tab_order', () => {
    /**
     * BUG: main.ts line 1491 - skipped generateAndGetRange() when metadataRequired=false
     * FIX: Always call generateAndGetRange() to include metadata cleanup
     */
    
    // Step 1: Remove tab_order (main.ts line 1417-1418)
    if (!action.metadataRequired && action.physicalMove) {
        editor.updateWorkbookTabOrder(null);
    }
    
    // Step 2: Physical move (main.ts line 1476-1481)
    const moveResult = editor.moveDocumentSection(...);
    
    // Step 3: ALWAYS regenerate (the FIX - main.ts line 1491)
    // Before fix: only if metadataRequired=true
    const wbUpdate = editor.generateAndGetRange();
    
    // Verify fix works
    expect(mergedContent).not.toContain('tab_order');
});
```

#### Anti-Pattern: Test That Embeds the Fix

```typescript
// ❌ BAD: Test includes the fix logic directly
it('should remove tab_order', () => {
    editor.updateWorkbookTabOrder(null); // Fix applied in test
    const result = editor.generateAndGetRange();
    expect(result).not.toContain('tab_order'); // Always passes
});

// ✅ GOOD: Test simulates production flow, fails if bug exists
it('should remove tab_order', () => {
    // Simulate EXACTLY what main.ts does (with line number references)
    // This test would FAIL if main.ts has the bug
});
```

### 6.9.2 Commit Policy

> [!CAUTION]
> **Do NOT commit bug fixes until UI verification is complete.**

1. ✅ All tests pass (`npm run test:webview`)
2. ✅ Extension packages successfully (`vsce package`)
3. ✅ User confirms fix works in actual VS Code extension
4. Then commit with descriptive message

---

## 7. For Maintainers

The release procedure (version bumping, changelog updates, and publishing to marketplaces) has been moved to the root [`MAINTAINER_GUIDE.md`](../MAINTAINER_GUIDE.md). Please refer to that document for publishing instructions.
