/**
 * Regression test: Name counter should avoid duplicate names.
 *
 * Bugs:
 * 1. _addSheetAtPosition generates "Sheet N" using sheets.length+1,
 *    which can duplicate existing names like "Sheet 2" when "Sheet 1" doesn't exist.
 * 2. _addDocumentFromMenu (single-H1 path) generates "Document N" using
 *    doc-type sheet count, which misses sheets named "Document 1" that aren't type 'doc'.
 *
 * Fix: Pass empty string to editor layer, which has proper dedup logic:
 *    - addSheet('') checks existingNames.includes('Sheet N') iteratively
 *    - addDocSheet('') checks existingNames.includes('Document N') iteratively
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor/api';

describe('Name Counter: Avoid Duplicates', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    describe('Sheet naming', () => {
        it('should not create duplicate "Sheet 2" when "Sheet 2" already exists', () => {
            // Workbook has 1 sheet named "Sheet 2" (not "Sheet 1")
            const markdown = `# Doc

Overview

## Sheet 2

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(markdown, JSON.stringify({}));

            // When main.ts uses sheets.length+1 = 1+1 = "Sheet 2" → DUPLICATE!
            // Editor layer with empty name correctly generates "Sheet 1"
            const result = editor.addSheet('', null, null, null, null);
            expect(result.error).toBeUndefined();

            const state = JSON.parse(editor.getState());
            const names = (state.workbook.sheets ?? []).map((s: { name: string }) => s.name);

            // Both "Sheet 1" and "Sheet 2" should exist, no duplicates
            expect(names.filter((n: string) => n === 'Sheet 2').length).toBe(1);
            expect(names).toContain('Sheet 1');
        });

        it('should find first available number for sheet name', () => {
            // Workbook has "Sheet 1" and "Sheet 3" (but not "Sheet 2")
            const markdown = `# Doc

## Sheet 1

| A |
|---|
| 1 |

## Sheet 3

| B |
|---|
| 2 |
`;
            editor.initializeWorkbook(markdown, JSON.stringify({}));

            const result = editor.addSheet('', null, null, null, null);
            expect(result.error).toBeUndefined();

            const state = JSON.parse(editor.getState());
            const names = (state.workbook.sheets ?? []).map((s: { name: string }) => s.name);

            // Should create "Sheet 2" (first available)
            expect(names).toContain('Sheet 2');
            expect(names.filter((n: string) => n === 'Sheet 1').length).toBe(1);
            expect(names.filter((n: string) => n === 'Sheet 3').length).toBe(1);
        });
    });

    describe('Doc-sheet naming', () => {
        it('should not create duplicate "Document 1" when sheet named "Document 1" exists', () => {
            // Workbook has a sheet named "Document 1" (may not be type 'doc')
            const markdown = `# Doc

Overview

## Sheet 1

| A |
|---|
| 1 |

## Document 1

Some content here.
`;
            editor.initializeWorkbook(markdown, JSON.stringify({}));

            // When main.ts uses docCount+1 where docCount=0 → "Document 1" → DUPLICATE!
            // Editor layer with empty name checks ALL sheet names for conflicts
            const sheetsCount = 2; // Sheet 1 + Document 1
            const result = editor.addDocSheet('', '', sheetsCount, null);
            expect(result.error).toBeUndefined();

            const state = JSON.parse(editor.getState());
            const names = (state.workbook.sheets ?? []).map((s: { name: string }) => s.name);

            // Should NOT have duplicate "Document 1"
            expect(names.filter((n: string) => n === 'Document 1').length).toBe(1);
            // New doc-sheet should be "Document 2"
            expect(names).toContain('Document 2');
        });
    });

    describe('Simulated main.ts name generation (demonstrating the bug)', () => {
        it('should show that count-based naming fails for sheets', () => {
            const markdown = `# Doc

## Sheet 2

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(markdown, JSON.stringify({}));
            const state = JSON.parse(editor.getState());
            const sheetsLength = (state.workbook.sheets ?? []).length;

            // Bug: main.ts generates "Sheet " + (sheetsLength + 1)
            const buggyName = `Sheet ${sheetsLength + 1}`;
            // This would be "Sheet 2" which already exists!
            expect(buggyName).toBe('Sheet 2'); // Confirms the buggy behavior

            // Correct: using empty string lets editor find "Sheet 1"
            const result = editor.addSheet('', null, null, null, null);
            expect(result.error).toBeUndefined();

            const newState = JSON.parse(editor.getState());
            const newNames = (newState.workbook.sheets ?? []).map((s: { name: string }) => s.name);
            const newSheet = newNames.find((n: string) => n !== 'Sheet 2');
            expect(newSheet).toBe('Sheet 1'); // Correct name
        });
    });
});
