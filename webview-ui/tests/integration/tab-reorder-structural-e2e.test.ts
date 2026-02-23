/**
 * Structural E2E Tests for Tab Reorder
 *
 * These tests verify the PHYSICAL FILE STRUCTURE after reorder operations,
 * not just action classification or metadata. This prevents bugs like SIDR3
 * where toSheetIndex was calculated incorrectly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor';
import { executeTabReorderLikeMainTs, TestTab } from '../helpers/tab-reorder-test-utils';

/**
 * Extract sheet names in physical order from markdown content.
 */
function extractSheetNamesInOrder(content: string): string[] {
    const sheetHeaderRegex = /^## (.+)$/gm;
    const sheetNames: string[] = [];
    let match;
    while ((match = sheetHeaderRegex.exec(content)) !== null) {
        sheetNames.push(match[1]);
    }
    return sheetNames;
}

describe('Tab Reorder Structural E2E', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    describe('SIDR3 Physical Sheet Order Verification', () => {
        /**
         * User Bug Report (Critical):
         * Tab: [S1, D1, S2, D2, S3]
         * Action: S1 → after D2 (between D2 and S3)
         *
         * Expected Physical: [Sheet 2, Sheet 1, Sheet 3]
         * Bug Result: [Sheet 2, Sheet 3, Sheet 1] (WRONG!)
         */
        it('S1 → after D2: physical sheets should be [Sheet 2, Sheet 1, Sheet 3]', () => {
            const INITIAL_MD = `# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| A | B |
|---|---|
| 3 | 4 |

## Sheet 3

| A | B |
|---|---|
| 5 | 6 |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 0}, {"type": "document", "index": 0}, {"type": "sheet", "index": 1}, {"type": "document", "index": 1}, {"type": "sheet", "index": 2}]} -->

# Doc 1

# Doc 2

`;

            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));

            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 }, // S1
                { type: 'document', docIndex: 0 }, // D1
                { type: 'sheet', sheetIndex: 1 }, // S2
                { type: 'document', docIndex: 1 }, // D2
                { type: 'sheet', sheetIndex: 2 }, // S3
                { type: 'add-sheet' }
            ];

            // S1 to after D2 (index 4)
            const result = executeTabReorderLikeMainTs(tabs, 0, 4);

            // Verify PHYSICAL sheet order in markdown
            const sheetNames = extractSheetNamesInOrder(result.content);
            expect(sheetNames).toEqual(['Sheet 2', 'Sheet 1', 'Sheet 3']);
        });

        /**
         * H11: [S1, D1, S2, D2] → S1 to between S2/D2
         * Expected Physical: [Sheet 2, Sheet 1]
         */
        it('H11: S1 → between S2/D2: physical sheets should be [Sheet 2, Sheet 1]', () => {
            const INITIAL_MD = `# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| A | B |
|---|---|
| 3 | 4 |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 0}, {"type": "document", "index": 0}, {"type": "sheet", "index": 1}, {"type": "document", "index": 1}]} -->

# Doc 1

# Doc 2

`;

            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));

            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'document', docIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 1 },
                { type: 'add-sheet' }
            ];

            // S1 to index 3 (between S2 and D2)
            const result = executeTabReorderLikeMainTs(tabs, 0, 3);

            const sheetNames = extractSheetNamesInOrder(result.content);
            expect(sheetNames).toEqual(['Sheet 2', 'Sheet 1']);
        });

        /**
         * Simple 2-sheet swap: [S1, D1, S2] → [D1, S2, S1]
         * Expected Physical: [Sheet 2, Sheet 1]
         */
        it('Simple 2-sheet: S1 → end: physical sheets should be [Sheet 2, Sheet 1]', () => {
            const INITIAL_MD = `# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| A | B |
|---|---|
| 3 | 4 |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 0}, {"type": "document", "index": 0}, {"type": "sheet", "index": 1}]} -->

# Doc 1

`;

            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));

            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'document', docIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'add-sheet' }
            ];

            // S1 to end (index 3)
            const result = executeTabReorderLikeMainTs(tabs, 0, 3);

            const sheetNames = extractSheetNamesInOrder(result.content);
            expect(sheetNames).toEqual(['Sheet 2', 'Sheet 1']);
        });
    });

    describe('Sheets-Only Physical Order Verification', () => {
        /**
         * Simple sheet swap without docs: [S1, S2] → [S2, S1]
         */
        it('Simple swap: S1 → end: physical sheets should be [Sheet 2, Sheet 1]', () => {
            const INITIAL_MD = `# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| A | B |
|---|---|
| 3 | 4 |

`;

            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));

            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'add-sheet' }
            ];

            // S1 to end (index 2)
            const result = executeTabReorderLikeMainTs(tabs, 0, 2);

            const sheetNames = extractSheetNamesInOrder(result.content);
            expect(sheetNames).toEqual(['Sheet 2', 'Sheet 1']);
        });

        /**
         * 3-sheet reorder: [S1, S2, S3] → S1 to end → [S2, S3, S1]
         */
        it('3-sheet: S1 → end: physical sheets should be [Sheet 2, Sheet 3, Sheet 1]', () => {
            const INITIAL_MD = `# Tables

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |

## Sheet 2

| A | B |
|---|---|
| 3 | 4 |

## Sheet 3

| A | B |
|---|---|
| 5 | 6 |

`;

            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));

            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'sheet', sheetIndex: 2 },
                { type: 'add-sheet' }
            ];

            // S1 to end (index 3)
            const result = executeTabReorderLikeMainTs(tabs, 0, 3);

            const sheetNames = extractSheetNamesInOrder(result.content);
            expect(sheetNames).toEqual(['Sheet 2', 'Sheet 3', 'Sheet 1']);
        });
    });
});
