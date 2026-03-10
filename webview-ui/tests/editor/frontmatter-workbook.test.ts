/**
 * Frontmatter Workbook Tests
 *
 * Scope: Integration tests across editor modules.
 * Uses real module instances: initializeWorkbook → getState/updateCell.
 * No mocks — exercises the full parser → editor → markdown generation pipeline.
 *
 * Scenario A: Frontmatter title only (no H1 headers)
 *   → Parser treats frontmatter as workbook root (virtual root)
 *   → Editor must handle rootMarker absent from text
 *
 * Scenario B: Frontmatter title + H1 headers
 *   → Parser treats H1 as workbook root, frontmatter as separate content
 *   → Frontmatter becomes a pinned Document tab
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initializeWorkbook, getState, resetContext, updateCell } from '../../../src/editor';

const DEFAULT_CONFIG = JSON.stringify({});

describe('Frontmatter Workbook Integration Tests', () => {
    beforeEach(() => {
        resetContext();
    });

    describe('Scenario A: Virtual root workbook (frontmatter only, no H1)', () => {
        const FRONTMATTER_ONLY = `---
title: My Daily Journal
date: 2024-01-01
---

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| C |
|---|
| 3 |
`;

        it('should use frontmatter title as workbook name and detect all sheets', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // Strict: exact workbook name from frontmatter title
            expect(state.workbook.name).toBe('My Daily Journal');
            // Strict: exact sheet count and names
            expect(state.workbook.sheets).toHaveLength(2);
            expect(state.workbook.sheets[0].name).toBe('Sheet 1');
            expect(state.workbook.sheets[1].name).toBe('Sheet 2');
        });

        it('should build structure with exactly one workbook section', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // Strict: structure contains exactly one workbook section
            const wbSections = state.structure.filter(
                (s: { type: string }) => s.type === 'workbook'
            );
            expect(wbSections).toHaveLength(1);
            // No document sections expected (no H1 = no separate docs)
            const docSections = state.structure.filter(
                (s: { type: string }) => s.type === 'document'
            );
            expect(docSections).toHaveLength(0);
        });

        it('should build tab_order with correct sheet entries', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            const tabOrder = state.workbook.metadata?.tab_order;
            // Strict: tab_order exists and has correct structure
            expect(tabOrder).toBeInstanceOf(Array);
            const sheetTabs = tabOrder.filter(
                (t: { type: string }) => t.type === 'sheet'
            );
            expect(sheetTabs).toHaveLength(2);
            // Verify indices are correct
            expect(sheetTabs[0].index).toBe(0);
            expect(sheetTabs[1].index).toBe(1);
        });

        it('should update cell in-place with startLine=0 (not append at EOF)', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);

            const result = updateCell(0, 0, 0, 0, 'Changed');

            // No error
            expect(result.error).toBeUndefined();
            // Virtual root starts at line 0
            expect(result.startLine).toBe(0);
            // Content contains the updated value
            expect(result.content).toContain('Changed');
            // No duplication: Sheet 1 appears exactly once
            expect((result.content!.match(/## Sheet 1/g) || []).length).toBe(1);
            // Sheet 2 also appears exactly once
            expect((result.content!.match(/## Sheet 2/g) || []).length).toBe(1);
        });

        it('should replace entire file for workbook with doc sheets and metadata', () => {
            // Realistic frontmatter_workbook.md: metadata comment + doc sheet
            const realMd = `---
id: root
title: root
desc: ""
updated: 1605266684036
created: 1595961348801
---

This is the root doc.

## Sheet 1

### MyTable

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  | 200 |  |

<!-- md-spreadsheet-sheet-metadata: {"layout": {"type": "pane", "id": "root", "tables": [0], "activeTableIndex": 0}} -->

## Document 1

`;
            initializeWorkbook(realMd, DEFAULT_CONFIG);

            const result = updateCell(0, 0, 0, 2, 'NEW');

            // No error
            expect(result.error).toBeUndefined();
            // Replacement starts at line 0 (virtual root)
            expect(result.startLine).toBe(0);

            // endLine covers the entire file
            const totalInputLines = realMd.split('\n').length;
            expect(result.endLine).toBeGreaterThanOrEqual(totalInputLines - 2);

            // No content duplication (each section exactly once)
            expect((result.content!.match(/## Sheet 1/g) || []).length).toBe(1);
            expect((result.content!.match(/## Document 1/g) || []).length).toBe(1);
            expect((result.content!.match(/### MyTable/g) || []).length).toBe(1);

            // Updated value is present
            expect(result.content).toContain('NEW');

            // Frontmatter is preserved in output
            expect(result.content).toContain('title: root');
            expect(result.content).toContain('id: root');

            // Root content is preserved
            expect(result.content).toContain('This is the root doc.');
        });
    });

    describe('Scenario B: Frontmatter + H1 headers', () => {
        const FRONTMATTER_WITH_H1 = `---
title: My Daily Journal
date: 2024-01-01
---

Journal body content here.

# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |
`;

        it('should use H1 as workbook name, not frontmatter title', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // H1 "Tables" takes precedence over frontmatter "My Daily Journal"
            expect(state.workbook.name).toBe('Tables');
            // Exactly one sheet
            expect(state.workbook.sheets).toHaveLength(1);
            expect(state.workbook.sheets[0].name).toBe('Sheet 1');
        });

        it('should update cell correctly with H1-based workbook range', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = updateCell(0, 0, 0, 0, 'Updated');

            expect(result.error).toBeUndefined();
            // Content should contain the updated value
            expect(result.content).toContain('Updated');
            // No duplication
            expect((result.content!.match(/## Sheet 1/g) || []).length).toBe(1);

            // Frontmatter content should NOT be in the workbook replacement
            // (it's before the H1 boundary)
            expect(result.content).not.toContain('Journal body content here.');
        });
    });
});
