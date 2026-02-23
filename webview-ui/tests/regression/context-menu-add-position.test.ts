/**
 * Regression test for Context Menu "Add New Document" / "Add New Sheet" position bug.
 *
 * Bug: When using the context menu's "Add New Document" or "Add New Sheet" on a workbook
 * that has a root tab (Overview), the new item was inserted at position +1 from the expected
 * position. This was because `_addSheetAtPosition` / `_addDocumentAtPosition` passed
 * `targetTabOrderIndex` (from `this.tabs` which includes root tab) directly to the editor
 * layer's `tabOrder.splice()`, where tab_order doesn't include the root tab entry.
 *
 * Fix: Compute `editorTabOrderIndex = targetTabOrderIndex - rootTabCount` before passing
 * to the editor layer.
 *
 * Related: _addDocumentFromMenu, _addSheetFromMenu, _addDocumentAtPosition, _addSheetAtPosition
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor/api';

interface TabDefinition {
    type: string;
    title: string;
    index: number;
    docIndex?: number;
    sheetIndex?: number;
    data?: unknown;
}

/**
 * Simulate how main.ts builds the tabs array from workbook state.
 */
function buildTabsFromState(state: {
    workbook: {
        rootContent?: string;
        sheets?: { name?: string }[];
        metadata?: { tab_order?: { type: string; index: number }[] };
    };
    structure: { type: string; title?: string }[];
}): TabDefinition[] {
    const tabs: TabDefinition[] = [];
    const workbook = state.workbook;
    const structure = state.structure;
    let docIndex = 0;

    for (const section of structure) {
        if (section.type === 'document') {
            tabs.push({
                type: 'document',
                title: section.title!,
                index: tabs.length,
                docIndex: docIndex++,
                data: section
            });
        } else if (section.type === 'workbook') {
            const rootContent = workbook.rootContent;
            if (rootContent) {
                tabs.push({
                    type: 'root',
                    title: 'Overview',
                    index: tabs.length,
                    data: { type: 'root', content: rootContent }
                });
            }

            if (workbook.sheets && workbook.sheets.length > 0) {
                const tabOrder = workbook.metadata?.tab_order;
                if (tabOrder && tabOrder.length > 0) {
                    for (const item of tabOrder) {
                        if (item.type === 'sheet' && item.index < workbook.sheets.length) {
                            const sheet = workbook.sheets[item.index];
                            tabs.push({
                                type: 'sheet',
                                title: sheet.name || `Sheet ${item.index + 1}`,
                                index: tabs.length,
                                sheetIndex: item.index,
                                data: sheet
                            });
                        }
                    }
                } else {
                    workbook.sheets.forEach((sheet: { name?: string }, shIdx: number) => {
                        tabs.push({
                            type: 'sheet',
                            title: sheet.name || `Sheet ${shIdx + 1}`,
                            index: tabs.length,
                            sheetIndex: shIdx,
                            data: sheet
                        });
                    });
                }
            }
        }
    }

    tabs.push({ type: 'add-sheet', title: '', index: tabs.length });
    return tabs;
}

/**
 * Simulate the FIXED _addSheetAtPosition logic.
 * 1. targetTabOrderIndex = contextMenuIndex + 1 (raw, includes root tab in this.tabs)
 * 2. Scan this.tabs[0..targetTabOrderIndex) to count sheetsBeforeTarget
 * 3. Compute editorTabOrderIndex = targetTabOrderIndex - rootTabCount
 * 4. Call editor.addSheet(name, afterSheetIndex, editorTabOrderIndex)
 */
function simulateAddSheetAtPosition(
    tabs: TabDefinition[],
    contextMenuIndex: number
): { afterSheetIndex: number; editorTabOrderIndex: number } {
    const targetTabOrderIndex = contextMenuIndex + 1;

    // Count sheets before target in this.tabs
    let sheetsBeforeTarget = 0;
    for (let i = 0; i < Math.min(targetTabOrderIndex, tabs.length); i++) {
        if (tabs[i].type === 'sheet') {
            sheetsBeforeTarget++;
        }
    }
    const afterSheetIndex = sheetsBeforeTarget;

    // Subtract root tabs for editor layer
    const rootTabCount = tabs.filter((t) => t.type === 'root').length;
    const editorTabOrderIndex = targetTabOrderIndex - rootTabCount;

    return { afterSheetIndex, editorTabOrderIndex };
}

describe('Context Menu Add Position Bug (Root Tab Offset)', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    describe('Add New Sheet via context menu', () => {
        it('should insert new sheet after the right-clicked sheet when root tab is present', () => {
            const markdown = `# My Workbook

Overview content here.

## Sheet 1

| A |
|---|
| 1 |

## Sheet 2

| B |
|---|
| 2 |
`;
            editor.initializeWorkbook(markdown, JSON.stringify({}));
            const state = JSON.parse(editor.getState());
            const tabs = buildTabsFromState(state);

            // Verify: [root, Sheet1, Sheet2, add-sheet]
            expect(tabs.map((t) => t.type)).toEqual(['root', 'sheet', 'sheet', 'add-sheet']);

            // User right-clicks "Sheet 1" (tabs index = 1) → "Add New Sheet"
            const contextMenuIndex = 1;
            const { afterSheetIndex, editorTabOrderIndex } = simulateAddSheetAtPosition(tabs, contextMenuIndex);

            // With fix: targetTabOrderIndex=2, rootTabCount=1 → editorTabOrderIndex=1
            expect(editorTabOrderIndex).toBe(1);
            // sheetsBeforeTarget: tabs[0]=root(skip), tabs[1]=Sheet1 → 1
            expect(afterSheetIndex).toBe(1);

            const result = editor.addSheet('Sheet 3', ['Col1'], 'Table 1', afterSheetIndex, editorTabOrderIndex);
            expect(result.error).toBeUndefined();

            // Verify via sheets array order (tab_order may be cleaned up as redundant)
            const newState = JSON.parse(editor.getState());
            const sheets = newState.workbook.sheets;

            // Expected physical order: [Sheet 1, Sheet 3 (new), Sheet 2]
            expect(sheets).toHaveLength(3);
            expect(sheets[0].name).toBe('Sheet 1');
            expect(sheets[1].name).toBe('Sheet 3'); // New sheet inserted after Sheet 1
            expect(sheets[2].name).toBe('Sheet 2');
        });

        it('should insert new sheet at correct position without root tab (baseline)', () => {
            const markdown = `# Tables

## Sheet 1

| A |
|---|
| 1 |

## Sheet 2

| B |
|---|
| 2 |
`;
            editor.initializeWorkbook(markdown, JSON.stringify({ rootMarker: '# Tables', sheetHeaderLevel: 2 }));
            const state = JSON.parse(editor.getState());
            const tabs = buildTabsFromState(state);

            // Without root tab: [Sheet1, Sheet2, add-sheet]
            expect(tabs.map((t) => t.type)).toEqual(['sheet', 'sheet', 'add-sheet']);

            // User right-clicks "Sheet 1" (tabs index = 0)
            const contextMenuIndex = 0;
            const { afterSheetIndex, editorTabOrderIndex } = simulateAddSheetAtPosition(tabs, contextMenuIndex);

            // No root tabs → editorTabOrderIndex = 0+1-0 = 1
            expect(editorTabOrderIndex).toBe(1);
            expect(afterSheetIndex).toBe(1);

            const result = editor.addSheet('Sheet 3', ['Col1'], 'Table 1', afterSheetIndex, editorTabOrderIndex);
            expect(result.error).toBeUndefined();

            // Verify: [Sheet1, Sheet3(new), Sheet2]
            const newState = JSON.parse(editor.getState());
            const sheets = newState.workbook.sheets;
            expect(sheets).toHaveLength(3);
            expect(sheets[0].name).toBe('Sheet 1');
            expect(sheets[1].name).toBe('Sheet 3');
            expect(sheets[2].name).toBe('Sheet 2');
        });
    });
});
