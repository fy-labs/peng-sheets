/**
 * Unit test for Root Tab creation with rootContent
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as editor from '../../../src/editor/api';

describe('Root Tab with rootContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should include rootContent in workbook when parsing workbook-only markdown', () => {
        const markdown = `# Doc

test text
`;
        // Initialize with default config (auto-detect rootMarker)
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const stateJson = editor.getState();
        const state = JSON.parse(stateJson);

        console.log('=== DEBUG: state ===', JSON.stringify(state, null, 2));

        // Workbook should have name "Doc" and rootContent "test text"
        expect(state.workbook).not.toBeNull();
        expect(state.workbook.name).toBe('Doc');
        expect(state.workbook.rootContent).toBe('test text');

        // Structure should have a workbook section
        expect(state.structure).not.toBeNull();
        expect(state.structure.length).toBeGreaterThan(0);
        const workbookSection = state.structure.find((s: { type: string }) => s.type === 'workbook');
        expect(workbookSection).toBeDefined();
    });

    it('should include rootContent when workbook has text before first sheet', () => {
        const markdown = `# Workbook

This is the overview text.

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const stateJson = editor.getState();
        const state = JSON.parse(stateJson);

        expect(state.workbook).not.toBeNull();
        expect(state.workbook.name).toBe('Workbook');
        expect(state.workbook.rootContent).toBe('This is the overview text.');
        expect(state.workbook.sheets.length).toBe(1);
    });
});
