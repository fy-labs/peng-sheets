/**
 * Test to debug Doc Sheet content display issue
 */
import { describe, it, expect } from 'vitest';
import { initializeWorkbook, getState, resetContext } from '../../../src/editor';

describe('Doc Sheet content display', () => {
    it('should parse Doc Sheet with content in Single Root Header file', () => {
        resetContext();
        const md = `# Doc

## Doc2

test
test

## Sheet 1

| 列名1 | 列名2 | 列名3 |
| --- | --- | --- |
|  |  |  |
`;
        initializeWorkbook(md, '{}');
        const state = JSON.parse(getState());

        console.log('Workbook name:', state.workbook?.name);
        console.log('Sheets count:', state.workbook?.sheets?.length);

        expect(state.workbook?.sheets?.length).toBeGreaterThanOrEqual(2);

        for (const sheet of state.workbook?.sheets ?? []) {
            console.log('Sheet:', sheet.name);
            console.log('  type:', sheet.type);
            console.log('  sheetType:', sheet.sheetType);
            console.log('  content:', JSON.stringify(sheet.content));
            console.log('  All keys:', Object.keys(sheet));
        }

        const docSheet = state.workbook?.sheets?.find((s: any) => s.name === 'Doc2');
        expect(docSheet).toBeDefined();
        // Check both type and sheetType to see which one has the value
        const sheetTypeValue = docSheet?.type ?? docSheet?.sheetType;
        expect(sheetTypeValue).toBe('doc');
        expect(docSheet?.content).toContain('test');
    });

    it('should preserve leading blank lines in Doc Sheet content', () => {
        resetContext();
        // This markdown has TWO blank lines between header and content
        const md = `# Workbook

## Document 1


test
`;
        initializeWorkbook(md, '{}');
        const state = JSON.parse(getState());

        const docSheet = state.workbook?.sheets?.find((s: any) => s.name === 'Document 1');
        expect(docSheet).toBeDefined();
        console.log('Document 1 content (JSON):', JSON.stringify(docSheet?.content));
        console.log('Document 1 content starts with newline:', docSheet?.content?.startsWith('\n'));

        // The content should start with a blank line (newline character)
        expect(docSheet?.content).toMatch(/^\n/);
    });
});
