/**
 * Regression test: Adding a sheet should include ### Table header and table content.
 *
 * Expected output for a new sheet in single-H1 workbook:
 *   ## Sheet 1
 *   ### Table 1
 *   | Column 1 | Column 2 | Column 3 |
 *   | --- | --- | --- |
 *   |  |  |  |
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor/api';

describe('Sheet Add: Table Headers', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    it('should include ### Table 1 header and table when adding a sheet', () => {
        const markdown = `# Doc

test text

テスト

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // Simulate _addSheetAtPosition with headers (via SpreadsheetService)
        const result = editor.addSheet(
            '',                                    // empty name → editor dedup
            ['Column 1', 'Column 2', 'Column 3'],  // default headers
            'Table 1',                              // default table name
            null,                                   // afterSheetIndex
            null                                    // targetTabOrderIndex
        );
        expect(result.error).toBeUndefined();

        const content = result.content ?? '';

        // Should have ## Sheet 1 header
        expect(content).toMatch(/^## Sheet 1$/m);

        // Should have ### Table 1 header
        expect(content).toMatch(/^### Table 1$/m);

        // Should have table with headers
        expect(content).toContain('| Column 1 | Column 2 | Column 3 |');

        // Should have separator row
        expect(content).toMatch(/\| ---/);
    });

    it('should include ### Table 1 header when adding at specific position', () => {
        const markdown = `# Doc

test text

テスト

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // Simulate _addSheetAtPosition: afterSheetIndex=1, tabOrderIndex=1
        const result = editor.addSheet(
            '',                                    // empty name
            ['Column 1', 'Column 2', 'Column 3'],  // headers
            'Table 1',                              // table name
            1,                                      // afterSheetIndex
            1                                       // targetTabOrderIndex
        );
        expect(result.error).toBeUndefined();

        const content = result.content ?? '';

        // Must have ### Table 1 header
        expect(content).toMatch(/^### Table 1$/m);
        // Must have table with headers
        expect(content).toContain('| Column 1 | Column 2 | Column 3 |');
    });

    it('should include ### Table 1 header even with null column args', () => {
        const markdown = `# Doc

Overview

## Sheet 1

| A |
|---|
| 1 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // When columnNames=null, addSheet defaults to ['Column 1', 'Column 2', 'Column 3']
        const result = editor.addSheet('', null, null, null, null);
        expect(result.error).toBeUndefined();

        const content = result.content ?? '';

        // Default table should still have ### header and table content
        expect(content).toContain('| Column 1 | Column 2 | Column 3 |');
    });
});
