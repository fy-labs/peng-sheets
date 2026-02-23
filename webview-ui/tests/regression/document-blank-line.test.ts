/**
 * Regression test: Document operations should handle blank lines correctly
 *
 * Issue 1: When a document section at EOF has no trailing blank line,
 * moving another document can cause content duplication.
 *
 * Issue 2: Add New Document should ensure proper blank line separation.
 *
 * Example problematic file:
 * ```
 * # Workbook
 * ## Sheet 1
 * | Col |
 * | --- |
 * |  |
 * # Doc
 * # Doc2  ← No trailing newline
 * ```
 *
 * Moving Doc before Workbook resulted in:
 * ```
 * # Doc
 * # Workbook ...
 * # Doc2# Doc2  ← Duplicated!
 * ```
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor';

describe('Document Blank Line Handling', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    describe('Move document with missing trailing newline', () => {
        it('should not duplicate content when moving document with no trailing newline at EOF', () => {
            // Exact reproduction of user scenario from workbook.md
            const mdText = `# Workbook

## Sheet 1

| 列名1 | 列名2 | 列名3 |
| --- | --- | --- |
|  |  |  |

# Doc

# Doc2`; // No trailing newline - exactly like user's file!

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Move Doc (docIndex 0) to before Workbook (toBeforeWorkbook = true)
            const result = editor.moveDocumentSection(0, 0, false, true);

            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            console.log('=== RESULT CONTENT ===');
            console.log(result.content);
            console.log('======================');

            // Count occurrences of "# Doc2" - should be exactly 1
            const doc2Matches = result.content!.match(/# Doc2/g);
            expect(doc2Matches?.length).toBe(1);

            // The content should have proper structure - no concatenation like "# Doc2# Doc2"
            expect(result.content).not.toMatch(/# Doc2# Doc2/);

            // The content should have proper structure
            expect(result.content).toContain('# Doc');
            expect(result.content).toContain('# Workbook');
            expect(result.content).toContain('# Doc2');
        });

        it('should handle document move when multiple sections lack trailing newlines', () => {
            const mdText = `# Workbook

## Sheet 1

| Col |
| --- |
|  |

# Doc1
# Doc2`; // Multiple sections without blank lines

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Move Doc1 to after Doc2
            const result = editor.moveDocumentSection(0, 1, false, false);

            expect(result.error).toBeUndefined();

            // Each document should appear exactly once
            const doc1Matches = result.content!.match(/# Doc1/g);
            const doc2Matches = result.content!.match(/# Doc2/g);
            expect(doc1Matches?.length).toBe(1);
            expect(doc2Matches?.length).toBe(1);
        });
    });

    describe('Add document with proper blank line separation', () => {
        it('should add blank lines before and after new document', () => {
            const mdText = `# Workbook

## Sheet 1

| Column 1 |
| --- |
|  |
`;

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Add a new document (afterDocIndex=-1 and afterWorkbook=false will add at default position)
            const result = editor.addDocumentAndGetFullUpdate('New Document');

            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            // When new document is added, there should be a blank line after it
            expect(result.content).toMatch(/# New Document\n\n/);
        });

        it('should ensure blank line after last document when adding at end', () => {
            const mdText = `# Workbook

## Sheet 1

| Col |
| --- |
|  |

# Existing Doc`; // No trailing newline

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Add a new document after the existing one (afterDocIndex=0 puts it after first doc)
            const result = editor.addDocumentAndGetFullUpdate('New Document', 0);

            expect(result.error).toBeUndefined();

            // Both documents should be properly separated
            expect(result.content).toContain('# Existing Doc');
            expect(result.content).toContain('# New Document');

            // Should NOT have documents concatenated directly
            expect(result.content).not.toMatch(/# Existing Doc\n# New Document/);
        });
    });

    describe('Workbook range calculation with EOF edge cases', () => {
        it('should correctly identify workbook end when file has no trailing newline', () => {
            const mdText = `# Workbook

## Sheet 1

| Col |
| --- |
|  |

# Doc`; // No trailing newline

            const lines = mdText.split('\n');
            const docLineIndex = lines.findIndex((l) => l.trim() === '# Doc');

            const [startLine, endLine] = editor.getWorkbookRange(mdText, '# Workbook', 2);

            // Workbook should start at line 0
            expect(startLine).toBe(0);

            // Workbook should end at the # Doc line (not beyond)
            expect(endLine).toBe(docLineIndex);
        });
    });
});
