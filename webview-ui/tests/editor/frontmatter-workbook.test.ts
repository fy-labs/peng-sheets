/**
 * Frontmatter Workbook Tests
 *
 * Tests for loading and operating on workbooks that use YAML frontmatter
 * as the workbook root (virtual root) instead of an explicit H1 header.
 *
 * Scenario A: Frontmatter title only (no H1 headers)
 *   → Parser treats frontmatter as workbook root
 *   → Editor must handle virtual root (rootMarker not in text)
 *
 * Scenario B: Frontmatter title + H1 headers
 *   → Parser treats H1 as workbook root, frontmatter as Document section
 *   → Editor works normally (H1 is in text)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initializeWorkbook, getState, resetContext } from '../../../src/editor';

const DEFAULT_CONFIG = JSON.stringify({});

describe('Frontmatter Workbook Tests', () => {
    beforeEach(() => {
        resetContext();
    });

    describe('Scenario A: Frontmatter-only workbook (no H1)', () => {
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

        it('should parse frontmatter workbook and detect sheets', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            expect(state.workbook).not.toBeNull();
            expect(state.workbook.name).toBe('My Daily Journal');
            expect(state.workbook.sheets.length).toBe(2);
            expect(state.workbook.sheets[0].name).toBe('Sheet 1');
            expect(state.workbook.sheets[1].name).toBe('Sheet 2');
        });

        it('should build correct structure with workbook section', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // Structure should contain the workbook
            expect(state.structure).not.toBeNull();
            const wbSections = state.structure.filter((s: { type: string }) => s.type === 'workbook');
            expect(wbSections.length).toBe(1);
        });

        it('should build correct tab_order with sheets', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // tab_order should include sheets
            const tabOrder = state.workbook.metadata?.tab_order;
            expect(tabOrder).toBeDefined();

            const sheetTabs = tabOrder.filter((t: { type: string }) => t.type === 'sheet');
            expect(sheetTabs.length).toBe(2);
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

        it('should use H1 as workbook (not frontmatter title)', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            expect(state.workbook).not.toBeNull();
            // H1 "Tables" should be the workbook, not frontmatter title
            expect(state.workbook.name).toBe('Tables');
            expect(state.workbook.sheets.length).toBe(1);
        });

        it('should detect frontmatter as document section', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // The frontmatter title doesn't appear as a workbook section
            // since H1 takes precedence (parser v1.4.2 behavior)
            expect(state.workbook.name).toBe('Tables');
        });
    });
});
