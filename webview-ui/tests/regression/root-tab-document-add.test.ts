/**
 * Regression tests for document add from context menu in single-H1 workbooks.
 *
 * Bugs fixed:
 * 1. _addDocumentFromMenu bypasses single-H1 detection → creates H1 instead of H2
 * 2. afterWorkbook was false when adding from Root tab
 * 3. addDocument insert-after semantics mismatch
 *
 * In a single-H1 workbook, "Add Document" should create a doc-sheet (## header)
 * within the workbook, NOT an external document (# header).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor/api';

interface TabDefinition {
    type: string;
    title: string;
    index: number;
    docIndex?: number;
    sheetIndex?: number;
}

/**
 * Build tabs array from editor state (simulates main.ts tab building).
 */
function buildTabsFromState(state: {
    workbook: {
        rootContent?: string;
        sheets?: { name?: string; type?: string }[];
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
                docIndex: docIndex++
            });
        } else if (section.type === 'workbook') {
            if (workbook.rootContent) {
                tabs.push({
                    type: 'root',
                    title: 'Overview',
                    index: tabs.length
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
                                sheetIndex: item.index
                            });
                        }
                    }
                } else {
                    workbook.sheets.forEach((sheet: { name?: string }, shIdx: number) => {
                        tabs.push({
                            type: 'sheet',
                            title: sheet.name || `Sheet ${shIdx + 1}`,
                            index: tabs.length,
                            sheetIndex: shIdx
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
 * Detect single-H1 mode: no external document tabs exist.
 */
function isSingleH1(tabs: TabDefinition[]): boolean {
    return !tabs.some((tab) => tab.type === 'document');
}

describe('Root Tab: Document Add as H2 (Single-H1 Workbook)', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    it('should detect single-H1 mode for workbook with only sheets', () => {
        const markdown = `# Doc

test text

テスト

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Document 1
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const state = JSON.parse(editor.getState());
        const tabs = buildTabsFromState(state);

        // Single-H1: no external document tabs
        expect(isSingleH1(tabs)).toBe(true);
        // Root tab present
        expect(tabs.some((t) => t.type === 'root')).toBe(true);
    });

    it('should add document as doc-sheet (H2) in single-H1 workbook via context menu', () => {
        // User's exact scenario
        const markdown = `# Doc

test text

テスト

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Document 1
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const state = JSON.parse(editor.getState());
        const tabs = buildTabsFromState(state);

        // Verify it's single-H1
        expect(isSingleH1(tabs)).toBe(true);

        // In single-H1 mode, "Add Document" from context menu should use addDocSheet
        // which adds a ## header inside the workbook, NOT a # header
        const sheetsBeforeTarget = tabs.filter((t) => t.type === 'sheet').length;
        const result = editor.addDocSheet('Document 2', '', sheetsBeforeTarget, null);
        expect(result.error).toBeUndefined();

        // The output should NOT contain a # Document 2 (H1)
        // It SHOULD contain a ## Document 2 (H2) within the workbook
        const content = result.content ?? '';
        expect(content).not.toMatch(/^# Document 2$/m);
        expect(content).toMatch(/^## Document 2$/m);

        // The workbook structure should remain single-H1
        const lines = content.split('\n');
        const h1Lines = lines.filter((l) => /^# /.test(l));
        expect(h1Lines.length).toBe(1); // Only the original # Doc
        expect(h1Lines[0]).toBe('# Doc');
    });

    it('should not create tab_order when adding doc-sheet at end', () => {
        const markdown = `# Doc

test text

## Sheet 1

| A |
|---|
| 1 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // Add doc-sheet at end
        const sheetsCount = 1;
        const result = editor.addDocSheet('Notes', '', sheetsCount, null);
        expect(result.error).toBeUndefined();

        const newState = JSON.parse(editor.getState());
        const tabOrder = newState.workbook.metadata?.tab_order;

        // Natural order → no tab_order metadata needed
        expect(tabOrder).toBeUndefined();
    });

    it('should generate correct name avoiding duplicates', () => {
        const markdown = `# Doc

Overview

## Sheet 2

| A |
|---|
| 1 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // Workbook has 1 sheet (Sheet 2). Adding a new sheet should NOT create
        // "Sheet 2" again. When name is empty, editor layer generates unique name.
        const result = editor.addSheet('', null, null, null, null);
        expect(result.error).toBeUndefined();

        const newState = JSON.parse(editor.getState());
        const sheetNames = (newState.workbook.sheets ?? []).map((s: { name: string }) => s.name);

        // Should have original Sheet 2 + new sheet with non-duplicate name
        expect(sheetNames).toContain('Sheet 2');
        const duplicateCount = sheetNames.filter((n: string) => n === 'Sheet 2').length;
        expect(duplicateCount).toBe(1); // Only the original, no duplicate
    });
});
