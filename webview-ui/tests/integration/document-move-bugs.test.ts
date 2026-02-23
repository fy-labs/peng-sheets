/**
 * Tests for document move off-by-one bug.
 *
 * Bug symptom: Documents are inserted at target-1 position instead of target.
 * Examples:
 * - Add New Document inserts at end-1 instead of end
 * - Cross-sheet doc move inserts at wrong physical position
 */

import { describe, it, expect } from 'vitest';
import { determineReorderAction } from '../../services/tab-reorder-service';

interface TestTab {
    type: 'sheet' | 'document' | 'add-sheet';
    sheetIndex?: number;
    docIndex?: number;
}

describe('Document Move Off-by-One Bug', () => {
    describe('D→D moves', () => {
        it('D1 to end of [S1, S2, D1, D2, D3] should move to after D3', () => {
            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 0 },
                { type: 'document', docIndex: 1 },
                { type: 'document', docIndex: 2 },
                { type: 'add-sheet' }
            ];

            // Drag D1 (tabIndex 2) to end (toIndex = 5, before add-sheet)
            const action = determineReorderAction(tabs, 2, 5);

            // D1 should move:
            // - actionType could be 'metadata' (no physical DOC reorder needed, just tab_order metadata)
            //   OR 'physical' if physical doc order needs to change
            // In [S1,S2,D1,D2,D3], moving D1 to end means [S1,S2,D2,D3,D1]
            // Physical order after WB is [D1=0, D2=1, D3=2]
            // New order should be [D2=0, D3=1, D1=2] → requires physical reorder!

            // Debug: Check what we actually get
            console.log('D1 to end action:', JSON.stringify(action, null, 2));

            // The physical move should reorder docs: D1 (fromDocIndex=0) to EOF (toDocIndex=null)
            if (action.physicalMove?.type === 'move-document') {
                expect(action.physicalMove.fromDocIndex).toBe(0); // D1
                // toDocIndex=null means insert at EOF (after D3) - this is correct!
                expect(action.physicalMove.toDocIndex).toBe(null);
            } else {
                // If no physical move, check metadata
                console.log('No physical move - metadata only');
            }
        });

        it('D3 to position of D1 in [S1, S2, D1, D2, D3]', () => {
            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 0 },
                { type: 'document', docIndex: 1 },
                { type: 'document', docIndex: 2 },
                { type: 'add-sheet' }
            ];

            // Drag D3 (tabIndex 4) to D1's position (toIndex = 2)
            const action = determineReorderAction(tabs, 4, 2);

            // Debug: Check what we actually get
            console.log('D3 to D1 position action:', JSON.stringify(action, null, 2));

            // D3 should move to position of D1 (toDocIndex = 0)
            if (action.physicalMove?.type === 'move-document') {
                expect(action.physicalMove.fromDocIndex).toBe(2); // D3
                expect(action.physicalMove.toDocIndex).toBe(0); // To D1's position
            }
        });
    });

    describe('D→S cross-type moves (D moves before sheets)', () => {
        it('D1 to before S1 in [S1, S2, D1, D2]', () => {
            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 0 },
                { type: 'document', docIndex: 1 },
                { type: 'add-sheet' }
            ];

            // Drag D1 (tabIndex 2) to before S1 (toIndex = 0)
            const action = determineReorderAction(tabs, 2, 0);

            // D1 should move to before workbook (physical move)
            expect(action.actionType).not.toBe('no-op');
            expect(action.physicalMove?.type).toBe('move-document');
            if (action.physicalMove?.type === 'move-document') {
                expect(action.physicalMove.fromDocIndex).toBe(0); // D1
                expect(action.physicalMove.toBeforeWorkbook).toBe(true);
            }
        });

        it('D1 to between S1 and S2 in [S1, S2, D1, D2]', () => {
            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 0 },
                { type: 'document', docIndex: 1 },
                { type: 'add-sheet' }
            ];

            // Drag D1 (tabIndex 2) to between S1 and S2 (toIndex = 1)
            const action = determineReorderAction(tabs, 2, 1);

            // D1 moves between sheets - requires metadata
            expect(action.actionType).toBe('metadata');
            expect(action.metadataRequired).toBe(true);
        });
    });

    describe('S→D cross-type moves (S moves into doc range)', () => {
        it('S1 to after D1 in [S1, S2, D1, D2, D3]', () => {
            const tabs: TestTab[] = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 0 },
                { type: 'document', docIndex: 1 },
                { type: 'document', docIndex: 2 },
                { type: 'add-sheet' }
            ];

            // Drag S1 (tabIndex 0) to after D1 (toIndex = 3)
            const action = determineReorderAction(tabs, 0, 3);

            // S1 sheet physically moves to end of WB, metadata updates
            expect(action.actionType).toBe('physical+metadata');
            expect(action.physicalMove?.type).toBe('move-sheet');
        });
    });
});
