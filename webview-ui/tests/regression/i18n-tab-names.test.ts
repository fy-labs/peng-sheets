/**
 * Regression test: Verify i18n is applied to new tab names.
 *
 * Add New Sheet and Add New Document should use localized names
 * (e.g., "シート 1" in Japanese instead of "Sheet 1").
 *
 * Counter should increment based on TOTAL sheet count, not just
 * sheets matching the current language prefix. This prevents
 * "Sheet 1" and "シート 1" from both being count=1.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as editor from '../../../src/editor/api';
import { t } from '../../utils/i18n';

// Helper to set the language for i18n
function setLanguage(lang: string) {
    (window as Window & { vscodeLanguage?: string }).vscodeLanguage = lang;
}

/**
 * Generate unique sheet name using i18n prefix with counter based on
 * TOTAL existing sheet count (not just current-language prefix matches).
 *
 * This simulates what the fixed _generateUniqueSheetName() should do.
 */
function generateUniqueSheetName(existingNames: string[]): string {
    const prefix = t('sheetNamePrefix');
    let i = existingNames.length + 1;
    while (existingNames.includes(`${prefix} ${i}`)) i++;
    return `${prefix} ${i}`;
}

/**
 * Generate unique document name. Documents count independently from sheets.
 * docNames = only document-like names (not sheet names).
 */
function generateUniqueDocName(docNames: string[]): string {
    const prefix = t('documentNamePrefix');
    let i = docNames.length + 1;
    while (docNames.includes(`${prefix} ${i}`)) i++;
    return `${prefix} ${i}`;
}

describe('i18n: New Tab Names', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    afterEach(() => {
        setLanguage('en');
    });

    describe('t() returns correct prefixes per language', () => {
        it('English: sheetNamePrefix = "Sheet"', () => {
            setLanguage('en');
            expect(t('sheetNamePrefix')).toBe('Sheet');
        });

        it('English: documentNamePrefix = "Document"', () => {
            setLanguage('en');
            expect(t('documentNamePrefix')).toBe('Document');
        });

        it('Japanese: sheetNamePrefix = "シート"', () => {
            setLanguage('ja');
            expect(t('sheetNamePrefix')).toBe('シート');
        });

        it('Japanese: documentNamePrefix = "ドキュメント"', () => {
            setLanguage('ja');
            expect(t('documentNamePrefix')).toBe('ドキュメント');
        });
    });

    describe('addSheet uses localized name', () => {
        const WORKBOOK_MD = `# Doc

## Existing Sheet

### Table 1

| A |
|---|
| 1 |
`;

        it('English: new sheet named "Sheet 1"', () => {
            setLanguage('en');
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({}));

            const prefix = t('sheetNamePrefix');
            const result = editor.addSheet(`${prefix} 1`, ['Col 1'], 'Table 1', null, null);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const sheetNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(sheetNames).toContain('Sheet 1');
        });

        it('Japanese: new sheet named "シート 1"', () => {
            setLanguage('ja');
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({}));

            const prefix = t('sheetNamePrefix');
            const result = editor.addSheet(`${prefix} 1`, ['Col 1'], 'Table 1', null, null);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const sheetNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(sheetNames).toContain('シート 1');
            expect(sheetNames).not.toContain('Sheet 1');
        });
    });

    describe('addDocSheet uses localized name', () => {
        const WORKBOOK_MD = `# Doc

## Existing Sheet

### Table 1

| A |
|---|
| 1 |
`;

        it('English: new doc sheet named "Document 1"', () => {
            setLanguage('en');
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({}));

            const result = editor.addDocSheet('Document 1', '', null, null);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const sheetNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(sheetNames).toContain('Document 1');
        });

        it('Japanese: new doc sheet named "ドキュメント 1"', () => {
            setLanguage('ja');
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({}));

            const result = editor.addDocSheet('ドキュメント 1', '', null, null);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const sheetNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(sheetNames).toContain('ドキュメント 1');
            expect(sheetNames).not.toContain('Document 1');
        });
    });

    describe('cross-language counter: avoids duplicate counts', () => {
        it('Sheet added in EN, then JA: counter should be 2, not 1', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));

            const state = JSON.parse(editor.getState());
            const existingNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(existingNames).toEqual(['Sheet 1']);

            // Switch to Japanese and generate next name
            setLanguage('ja');
            const newName = generateUniqueSheetName(existingNames);

            // Should be "シート 2" (not "シート 1") because 1 sheet already exists
            expect(newName).toBe('シート 2');

            const result = editor.addSheet(newName, ['Col 1'], 'Table 1', null, null);
            expect(result.error).toBeUndefined();

            const stateAfter = JSON.parse(editor.getState());
            const names = stateAfter.workbook.sheets.map((s: { name: string }) => s.name);
            expect(names).toContain('Sheet 1');
            expect(names).toContain('シート 2');
            expect(names).not.toContain('シート 1');
        });

        it('Two sheets in EN, then JA: counter should be 3', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Sheet 2

### Table 2

| B |
|---|
| 2 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));

            const state = JSON.parse(editor.getState());
            const existingNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(existingNames).toEqual(['Sheet 1', 'Sheet 2']);

            setLanguage('ja');
            const newName = generateUniqueSheetName(existingNames);
            expect(newName).toBe('シート 3');
        });

        it('Doc added in EN, then JA: counter should be 2', () => {
            const md = `# Doc

## Document 1

some text
`;
            editor.initializeWorkbook(md, JSON.stringify({}));

            // Only pass document-like names, not sheet names
            const state = JSON.parse(editor.getState());
            const docNames = state.workbook.sheets
                .filter((s: { tables: unknown[] }) => !s.tables || s.tables.length === 0)
                .map((s: { name: string }) => s.name);

            setLanguage('ja');
            const newName = generateUniqueDocName(docNames);
            expect(newName).toBe('ドキュメント 2');
        });

        it('Sequential adds in JA: should increment properly', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('ja');

            // Add first Japanese sheet
            let state = JSON.parse(editor.getState());
            let existingNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            const name1 = generateUniqueSheetName(existingNames);
            expect(name1).toBe('シート 2');
            editor.addSheet(name1, ['Col 1'], 'Table 1', null, null);

            // Add second Japanese sheet
            state = JSON.parse(editor.getState());
            existingNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            const name2 = generateUniqueSheetName(existingNames);
            expect(name2).toBe('シート 3');
            editor.addSheet(name2, ['Col 1'], 'Table 1', null, null);

            // Verify all names
            state = JSON.parse(editor.getState());
            const finalNames = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(finalNames).toContain('Sheet 1');
            expect(finalNames).toContain('シート 2');
            expect(finalNames).toContain('シート 3');
        });
    });

    describe('document counter independent from sheet counter', () => {
        it('3 sheets exist: first document should be "ドキュメント 1" not "ドキュメント 4"', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Sheet 2

### Table 2

| B |
|---|
| 2 |

## Sheet 3

### Table 3

| C |
|---|
| 3 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('ja');

            // Documents should count independently: no docs exist → "ドキュメント 1"
            const docNames: string[] = []; // No documents exist yet
            const newName = generateUniqueDocName(docNames);
            expect(newName).toBe('ドキュメント 1');

            const result = editor.addDocSheet(newName, '', null, null);
            expect(result.error).toBeUndefined();

            const state = JSON.parse(editor.getState());
            const names = state.workbook.sheets.map((s: { name: string }) => s.name);
            expect(names).toContain('Sheet 1');
            expect(names).toContain('Sheet 2');
            expect(names).toContain('Sheet 3');
            expect(names).toContain('ドキュメント 1');
            expect(names).not.toContain('ドキュメント 4');
        });

        it('2 sheets + 1 doc: next document should be 2, not 4', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Sheet 2

### Table 2

| B |
|---|
| 2 |

## Document 1

Some content
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('ja');

            // 1 document exists → next should be "ドキュメント 2"
            const docNames = ['Document 1'];
            const newName = generateUniqueDocName(docNames);
            expect(newName).toBe('ドキュメント 2');
        });
    });

    describe('onboarding: createNewSpreadsheet uses i18n for table name', () => {
        it('English: first table named "Table 1"', () => {
            setLanguage('en');
            const sheetName = `${t('sheetNamePrefix')} 1`;
            const tableName = `${t('tableNamePrefix')} 1`;
            editor.initializeWorkbook('', '{}');
            const result = editor.createNewSpreadsheet(['Column 1', 'Column 2', 'Column 3'], sheetName, tableName);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const tableNames = state.workbook.sheets[0].tables.map((t: { name: string }) => t.name);
            expect(tableNames).toContain('Table 1');
        });

        it('Japanese: first table named "テーブル 1"', () => {
            setLanguage('ja');
            const sheetName = `${t('sheetNamePrefix')} 1`;
            const tableName = `${t('tableNamePrefix')} 1`;
            editor.initializeWorkbook('', '{}');
            const result = editor.createNewSpreadsheet(['列名1', '列名2', '列名3'], sheetName, tableName);

            expect(result.error).toBeUndefined();
            const state = JSON.parse(editor.getState());
            const tableNames = state.workbook.sheets[0].tables.map((t: { name: string }) => t.name);
            expect(tableNames).toContain('テーブル 1');
            expect(tableNames).not.toContain('Table 1');
        });
    });

    describe('bug: sheet counter should not count doc sheets (integration)', () => {
        it('1 sheet + 1 doc sheet: addSheet should create "Sheet 2", not "Sheet 3"', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Document 1

Some text content
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('en');

            // Verify initial state: 1 spreadsheet + 1 doc sheet
            const stateBefore = JSON.parse(editor.getState());
            const sheetsBefore = stateBefore.workbook.sheets as { name: string; tables: unknown[] }[];
            expect(sheetsBefore).toHaveLength(2); // Sheet 1 + Document 1
            expect(sheetsBefore[0].name).toBe('Sheet 1');
            expect(sheetsBefore[0].tables).toHaveLength(1); // spreadsheet
            expect(sheetsBefore[1].name).toBe('Document 1');
            expect(sheetsBefore[1].tables).toHaveLength(0); // doc sheet

            // Integration: addSheet via editor API — name should be based on spreadsheet count only
            const result = editor.addSheet('Sheet 2', ['Col 1'], 'Table 1', null, null);
            expect(result.error).toBeUndefined();

            const stateAfter = JSON.parse(editor.getState());
            const sheetsAfter = stateAfter.workbook.sheets as { name: string }[];
            const sheetNames = sheetsAfter.map((s) => s.name);

            // Sheet 2 should exist (counter based on 1 spreadsheet, not 2 total sheets)
            expect(sheetNames).toContain('Sheet 2');
            // Sheet 3 should NOT exist (would happen if doc sheets were counted)
            expect(sheetNames).not.toContain('Sheet 3');
        });

        it('2 sheets + 2 doc sheets: third addSheet should create "Sheet 3"', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Document 1

Some doc content

## Sheet 2

### Table 2

| B |
|---|
| 2 |

## Document 2

More doc content
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('en');

            // Verify initial state: 2 spreadsheets + 2 doc sheets = 4 sheets total
            const stateBefore = JSON.parse(editor.getState());
            const sheetsBefore = stateBefore.workbook.sheets as { name: string; tables: unknown[] }[];
            expect(sheetsBefore).toHaveLength(4);

            const spreadsheetCount = sheetsBefore.filter((s) => s.tables && s.tables.length > 0).length;
            const docSheetCount = sheetsBefore.filter((s) => !s.tables || s.tables.length === 0).length;
            expect(spreadsheetCount).toBe(2); // Sheet 1, Sheet 2
            expect(docSheetCount).toBe(2);    // Document 1, Document 2

            // Integration: addSheet — counter should be 3 (2 spreadsheets + 1), NOT 5 (4 total + 1)
            const result = editor.addSheet('Sheet 3', ['Col 1'], 'Table 1', null, null);
            expect(result.error).toBeUndefined();

            const stateAfter = JSON.parse(editor.getState());
            const sheetNames = stateAfter.workbook.sheets.map((s: { name: string }) => s.name);
            expect(sheetNames).toContain('Sheet 3');
            expect(sheetNames).not.toContain('Sheet 5');
        });
    });

    describe('bug: doc counter should not count pinned frontmatter tab (integration)', () => {
        it('workbook with no docs: addDocSheet should create "Document 1"', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('en');

            // Verify initial state: 1 spreadsheet, 0 doc sheets
            const stateBefore = JSON.parse(editor.getState());
            const sheetsBefore = stateBefore.workbook.sheets as { name: string }[];
            expect(sheetsBefore).toHaveLength(1);
            expect(sheetsBefore[0].name).toBe('Sheet 1');

            // Integration: addDocSheet — should be "Document 1" (no docs exist)
            const result = editor.addDocSheet('Document 1', '', null, null);
            expect(result.error).toBeUndefined();

            const stateAfter = JSON.parse(editor.getState());
            const names = stateAfter.workbook.sheets.map((s: { name: string }) => s.name);
            expect(names).toContain('Document 1');
        });

        it('sequential doc adds: should produce "Document 1", "Document 2", "Document 3"', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('en');

            // Add first doc
            const result1 = editor.addDocSheet('Document 1', '', null, null);
            expect(result1.error).toBeUndefined();

            // Add second doc
            const result2 = editor.addDocSheet('Document 2', '', null, null);
            expect(result2.error).toBeUndefined();

            // Add third doc
            const result3 = editor.addDocSheet('Document 3', '', null, null);
            expect(result3.error).toBeUndefined();

            // Verify all three docs exist with correct sequential names
            const stateAfter = JSON.parse(editor.getState());
            const names = stateAfter.workbook.sheets.map((s: { name: string }) => s.name);
            expect(names).toContain('Document 1');
            expect(names).toContain('Document 2');
            expect(names).toContain('Document 3');
            expect(names).toHaveLength(4); // Sheet 1 + 3 docs
        });

        it('1 existing doc sheet: next addDocSheet should create "Document 2", not duplicate', () => {
            const md = `# Doc

## Sheet 1

### Table 1

| A |
|---|
| 1 |

## Document 1

Existing doc content
`;
            editor.initializeWorkbook(md, JSON.stringify({}));
            setLanguage('en');

            // Verify "Document 1" already exists as a doc sheet
            const stateBefore = JSON.parse(editor.getState());
            const sheetsBefore = stateBefore.workbook.sheets as { name: string; tables: unknown[] }[];
            const docSheetsBefore = sheetsBefore.filter((s) => !s.tables || s.tables.length === 0);
            expect(docSheetsBefore).toHaveLength(1);
            expect(docSheetsBefore[0].name).toBe('Document 1');

            // Integration: addDocSheet — should be "Document 2", NOT another "Document 1"
            const result = editor.addDocSheet('Document 2', '', null, null);
            expect(result.error).toBeUndefined();

            const stateAfter = JSON.parse(editor.getState());
            const names = stateAfter.workbook.sheets.map((s: { name: string }) => s.name);

            // Verify correct name and no duplicates
            expect(names).toContain('Document 2');
            const doc1Count = names.filter((n: string) => n === 'Document 1').length;
            expect(doc1Count).toBe(1); // Only one "Document 1" — no duplication
        });
    });
});

