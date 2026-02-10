/**
 * Regression test: Adding a document to a single-H1 workbook should NOT create
 * redundant tab_order metadata.
 *
 * Bug: When adding a document via context menu to a single-H1 workbook, the
 * addDocument function initializes and writes tab_order even when the resulting
 * order matches the natural order (all sheets followed by all documents).
 * This creates unnecessary metadata in the output.
 *
 * For single-H1 workbooks, tab_order and physical order always match, so
 * tab_order should be cleaned up as redundant.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor/api';

describe('Redundant tab_order on document add', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    it('should not create tab_order when adding a document to a single-H1 workbook', () => {
        // Single-H1 workbook with root content and no existing documents
        const markdown = `# Doc

test text

テスト
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));

        // Add a document (simulates "Add New Document" button)
        const result = editor.addDocumentAndGetFullUpdate('Document 1', -1, true, -1);
        expect(result.error).toBeUndefined();

        // After adding, the natural order is: [sheet(s)..., document 0]
        // This is the default display order, so tab_order should not exist
        const newState = JSON.parse(editor.getState());
        const tabOrder = newState.workbook.metadata?.tab_order;

        // Bug: tab_order is created with [{type:'sheet', index:0}, {type:'document', index:0}]
        // Expected: tab_order should be undefined (cleaned up as redundant)
        expect(tabOrder).toBeUndefined();

        // Verify the document was actually added
        expect(result.content).toContain('# Document 1');
    });

    it('should not create tab_order when adding document at end of sheets-only workbook', () => {
        // Workbook with 2 sheets, no documents
        const markdown = `# My Workbook

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

        // Add a document at end
        const result = editor.addDocumentAndGetFullUpdate('Notes', -1, true, -1);
        expect(result.error).toBeUndefined();

        // Natural order: [sheet 0, sheet 1, document 0] — matches default, redundant
        const newState = JSON.parse(editor.getState());
        const tabOrder = newState.workbook.metadata?.tab_order;

        expect(tabOrder).toBeUndefined();
        expect(result.content).toContain('# Notes');
    });
});
