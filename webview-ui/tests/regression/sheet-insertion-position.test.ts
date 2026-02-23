/**
 * Regression test: Sheet insertion should respect workbook boundaries
 *
 * Issue: When adding a new sheet to a workbook that is followed by documents,
 * the sheet was being inserted at the end of the file instead of at the end
 * of the workbook section (before the document sections).
 *
 * File structure (hybrid_notebook.md style):
 * ```
 * # Markdown Spreadsheet Overview   <- Document (before workbook)
 * # Tables                          <- Workbook (contains sheets)
 *   ## Sheet1
 *   ## Sheet2
 * # Appendix                        <- Document (after workbook)
 *   ## Glossaries
 * ```
 *
 * Expected: New sheet should be inserted within the workbook section,
 * BEFORE the `# Appendix` document.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor';

describe('Sheet Insertion Position', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    it('should insert sheet within workbook boundaries - detailed position check', () => {
        const mdText = `# Intro

Intro paragraph.

# Tables

## ExistingSheet

| Column |
| --- |
| data |

# Outro

Outro paragraph.
`;
        const lines = mdText.split('\n');
        const outroLineIndex = lines.findIndex((l) => l.trim() === '# Outro');
        expect(outroLineIndex).toBeGreaterThan(0);

        editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Tables' }));

        const result = editor.addSheet('NewSheet');
        expect(result.error).toBeUndefined();

        // The replacement range should end BEFORE the # Outro line
        // result.endLine is the last line being replaced (exclusive end for Monaco)
        // Since # Outro is at outroLineIndex, endLine should be < outroLineIndex
        expect(result.endLine).toBeLessThan(outroLineIndex);

        // The content should include the new sheet
        expect(result.content).toContain('## NewSheet');
    });

    it('BUG REPRO: without explicit rootMarker, workbook name should be auto-detected', () => {
        // This test reproduces the real-world scenario where rootMarker is NOT explicitly set
        // The parser should detect the workbook name from the file structure
        const mdText = `# Intro

Intro paragraph.

# Tables

## ExistingSheet

| Column |
| --- |
| data |

# Outro

Outro paragraph.
`;
        const lines = mdText.split('\n');
        const outroLineIndex = lines.findIndex((l) => l.trim() === '# Outro');
        expect(outroLineIndex).toBeGreaterThan(0);

        // No rootMarker in config - should auto-detect from workbook.name
        editor.initializeWorkbook(mdText, '{}');

        const result = editor.addSheet('NewSheet');
        expect(result.error).toBeUndefined();

        // The replacement range should end BEFORE the # Outro line
        expect(result.endLine).toBeLessThan(outroLineIndex);

        // The content should include the new sheet
        expect(result.content).toContain('## NewSheet');
    });

    it('should correctly call getWorkbookRange with proper workbook name', () => {
        // Workbook with name "Tables" (not default "Workbook")
        const mdText = `# Doc Before

Some content.

# Tables

## MySheet

| A | B |
| --- | |
| 1 | 2 |

# Doc After

More content.
`;

        editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Tables' }));

        // Get the workbook range
        const [startLine, endLine] = editor.getWorkbookRange(mdText, '# Tables', 2);

        // Workbook should start at "# Tables" (line 5, 0-indexed = 4)
        expect(startLine).toBe(4);

        // Workbook should end at "# Doc After" (line 13, 0-indexed = 12)
        expect(endLine).toBe(12);
    });

    it('should insert new sheet before document sections that follow the workbook', () => {
        // File structure: Doc -> Workbook(Sheet1, Sheet2) -> Doc
        const mdText = `# Introduction

This is the intro document.

# Tables

## Sheet1

| Col1 | Col2 |
| --- | --- |
| a | b |

## Sheet2

| Col1 | Col2 |
| --- | --- |
| c | d |

# Appendix

## Glossaries

- Term1: Definition1
- Term2: Definition2
`;
        const lines = mdText.split('\n');
        const appendixLineIndex = lines.findIndex((l) => l.trim() === '# Appendix');
        expect(appendixLineIndex).toBeGreaterThan(0);

        // Initialize with workbook named "Tables"
        editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Tables' }));

        // Add a new sheet at the end of the workbook
        const result = editor.addSheet('Sheet3');
        expect(result.error).toBeUndefined();

        // Verify: The new sheet (Sheet3) should appear BEFORE "# Appendix"
        const content = result.content!;

        // The content should contain Sheet3
        expect(content).toContain('## Sheet3');

        // The endLine should be BEFORE the Appendix section
        expect(result.endLine).toBeLessThan(appendixLineIndex);
    });
});
