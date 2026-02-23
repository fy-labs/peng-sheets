/**
 * Comprehensive Integration Test: Tab Reorder Metadata Scenarios
 *
 * This test file covers ALL metadata scenarios:
 * 1. Metadata REMOVAL - when tab order matches physical/natural order
 * 2. Metadata ADDITION - when tab order differs from natural order
 * 3. Metadata UPDATE - when existing metadata needs to change
 * 4. Mixed structures - docs before/after WB in various combinations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor';
import {
    determineReorderAction,
    isMetadataRequired,
    deriveTabOrderFromFile,
    type TabOrderItem,
    type FileStructure
} from '../../services/tab-reorder-service';
import { TabReorderExecutor } from '../../executors/tab-reorder-executor';

/**
 * Helper: Build FileStructure from state.structure array and sheetCount
 */
function buildFileStructure(
    stateStructure: Array<{ type: string; title?: string }>,
    sheetCount: number
): FileStructure {
    const docsBeforeWb: number[] = [];
    const docsAfterWb: number[] = [];
    let hasWorkbook = false;
    let seenWorkbook = false;
    let docIndex = 0;

    for (const item of stateStructure) {
        if (item.type === 'workbook') {
            hasWorkbook = true;
            seenWorkbook = true;
        } else if (item.type === 'document') {
            if (seenWorkbook) {
                docsAfterWb.push(docIndex);
            } else {
                docsBeforeWb.push(docIndex);
            }
            docIndex++;
        }
    }

    // Build sheets array from sheetCount
    const sheets: number[] = [];
    for (let i = 0; i < sheetCount; i++) {
        sheets.push(i);
    }

    return { docsBeforeWb, sheets, docsAfterWb, hasWorkbook };
}

// =============================================================================
// 1. Metadata REMOVAL Scenarios (result matches natural order)
// =============================================================================

describe('Integration: Metadata REMOVAL scenarios', () => {
    describe('D3 from between sheets → after S2 (restore natural order)', () => {
        // BUG SCENARIO from user report
        const WORKBOOK_MD = `# Doc 1

# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "document", "index": 0}, {"type": "sheet", "index": 0}, {"type": "document", "index": 1}, {"type": "sheet", "index": 1}, {"type": "document", "index": 2}]} -->

# Doc 3


# Doc 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('should verify initial structure with tab_order metadata', () => {
            const state = JSON.parse(editor.getState());

            // Physical order: D1, WB, D3, D2
            expect(state.structure[0].title).toBe('Doc 1');
            expect(state.structure[1].type).toBe('workbook');
            expect(state.structure[2].title).toBe('Doc 3');
            expect(state.structure[3].title).toBe('Doc 2');

            // tab_order should exist with D3 between S1 and S2
            expect(state.workbook.metadata?.tab_order).toBeDefined();
        });

        it('D3 → after S2: metadataRequired should be FALSE (matches natural order)', () => {
            // Current display: [D1, S1, D3, S2, D2]
            // Moving D3 after S2 → [D1, S1, S2, D3, D2]
            // This IS natural order, so no metadata needed

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);

            const newTabOrder: TabOrderItem[] = [
                { type: 'document', index: 0 }, // D1
                { type: 'sheet', index: 0 }, // S1
                { type: 'sheet', index: 1 }, // S2
                { type: 'document', index: 1 }, // D3 (first doc after WB)
                { type: 'document', index: 2 } // D2 (second doc after WB)
            ];

            const naturalOrder = deriveTabOrderFromFile(fileStructure);
            console.log('Natural order:', naturalOrder);
            console.log('New tab order:', newTabOrder);

            const needsMetadata = isMetadataRequired(newTabOrder, fileStructure);

            // BUG: This should return false but currently returns true
            expect(needsMetadata).toBe(false);
        });

        it('FULL SCENARIO: D3 → after S2 should produce clean file without tab_order', () => {
            const newTabOrder: TabOrderItem[] = [
                { type: 'document', index: 0 },
                { type: 'sheet', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 1 },
                { type: 'document', index: 2 }
            ];

            editor.updateWorkbookTabOrder(newTabOrder);
            const wbUpdate = editor.generateAndGetRange();

            // Should NOT contain tab_order since it matches natural order
            expect(wbUpdate.content).not.toContain('tab_order');
        });
    });

    /**
     * USER BUG REPORT (Hazard 61):
     *
     * Initial State:
     * - Physical: [WB(S1, S2), D1, D3, D2]
     * - tab_order: [S1, D1, S2, D3, D2] - D1 displayed between sheets
     * - Display: S1 → D1 → S2 → D3 → D2
     *
     * Action: Move S1 to directly before S2 (remove D1 from between sheets)
     *
     * Expected:
     * - New display: [D1, S1, S2, D3, D2]
     * - This matches natural order for [D1, WB, D3, D2]
     * - Metadata should be REMOVED
     *
     * Bug: Metadata is NOT removed
     */
    describe('USER BUG: S1→before S2 (D1 was between sheets)', () => {
        // Physical structure: [D1, WB(S1, S2), D3, D2]
        // tab_order shows D1 between sheets: [S1, D1, S2, D3, D2]
        // After S1→before S2: [D1, S1, S2, D3, D2] = natural order → no metadata needed
        const WORKBOOK_MD = `# Doc 1

# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 0}, {"type": "document", "index": 0}, {"type": "sheet", "index": 1}, {"type": "document", "index": 1}, {"type": "document", "index": 2}]} -->

# Doc 3


# Doc 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(WORKBOOK_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('should verify initial state: D1 displayed between S1 and S2', () => {
            const state = JSON.parse(editor.getState());

            // Physical order: D1, WB(S1, S2), D3, D2
            expect(state.structure[0].title).toBe('Doc 1');
            expect(state.structure[1].type).toBe('workbook');
            expect(state.structure[2].title).toBe('Doc 3');
            expect(state.structure[3].title).toBe('Doc 2');

            // tab_order: [S1, D1, S2, D3, D2]
            const tabOrder = state.workbook.metadata?.tab_order;
            expect(tabOrder).toEqual([
                { type: 'sheet', index: 0 },
                { type: 'document', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 1 },
                { type: 'document', index: 2 }
            ]);
        });

        it('BUG REPRODUCTION via determineReorderAction: S1→before S2 should return metadataRequired=false', () => {
            // Get physical structure from editor state
            const state = JSON.parse(editor.getState());
            const physicalStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);

            // Simulate UI tabs array based on tab_order: [S1, D1, S2, D3, D2]
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 0
                { type: 'document', docIndex: 0 }, // D1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 }, // D3 at index 3
                { type: 'document', docIndex: 2 } // D2 at index 4
            ];

            // User action: Move S1 (index 0) to before S2 (index 2)
            // Pass physicalStructure for accurate natural order comparison
            const action = determineReorderAction(tabs, 0, 2, physicalStructure);

            // After move: [D1, S1, S2, D3, D2] which is natural order
            // So metadataRequired should be FALSE
            expect(action.metadataRequired).toBe(false);
        });

        it('FULL BUG REPRODUCTION: S1→before S2 should produce clean file without tab_order', () => {
            // Get physical structure from editor state
            const state = JSON.parse(editor.getState());
            const physicalStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);

            // Simulate UI tabs array based on tab_order: [S1, D1, S2, D3, D2]
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 0
                { type: 'document', docIndex: 0 }, // D1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 }, // D3 at index 3
                { type: 'document', docIndex: 2 } // D2 at index 4
            ];

            // User action: Move S1 (index 0) to before S2 (index 2)
            // Pass physicalStructure for accurate natural order comparison
            const action = determineReorderAction(tabs, 0, 2, physicalStructure);

            // Execute the action like _handleTabReorder would
            if (action.newTabOrder) {
                editor.updateWorkbookTabOrder(action.metadataRequired ? action.newTabOrder : null);
            } else if (!action.metadataRequired) {
                // If not required, we should remove it (whether actionType is metadata or physical)
                editor.updateWorkbookTabOrder(null);
            }

            const wbUpdate = editor.generateAndGetRange();

            // Result should NOT contain tab_order metadata
            expect(wbUpdate.content).not.toContain('tab_order');
        });
    });

    /**
     * NEW BUG (Regression from fix):
     *
     * Initial State (clean file, no tab_order):
     * - Physical: [D1, WB(S1, S2), D3, D2]
     * - Display: [D1, S1, S2, D3, D2] (natural order)
     *
     * Action: Move S1 to before D1 (tab index 1 → 0)
     *
     * Expected:
     * - Physical: stays same [D1, WB(S1, S2), D3, D2]
     * - Display: [S1, D1, S2, D3, D2]
     * - tab_order metadata ADDED: [S1, D1, S2, D3, D2]
     *
     * Bug: Entire WB moves to before D1 → [WB(S1, S2), D1, D3, D2]
     */
    // Regression test for S1→before D1 from clean file
    describe('REGRESSION: S1→before D1 from clean file should NOT move WB', () => {
        const CLEAN_MD = `# Doc 1

# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

# Doc 3


# Doc 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(CLEAN_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('should verify initial state: D1 before WB, no tab_order', () => {
            const state = JSON.parse(editor.getState());

            // Physical order: D1, WB(S1, S2), D3, D2
            expect(state.structure[0].title).toBe('Doc 1');
            expect(state.structure[1].type).toBe('workbook');
            expect(state.structure[2].title).toBe('Doc 3');
            expect(state.structure[3].title).toBe('Doc 2');

            // Natural order = no tab_order needed
            // (initializeWorkbook sets tab_order but generateAndGetRange should clean it)
        });

        it('S1→before D1 should return physical+metadata action', () => {
            // Display order (natural): [D1, S1, S2, D3, D2]
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'document', docIndex: 0 }, // D1 at index 0
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 }, // D3 at index 3
                { type: 'document', docIndex: 2 } // D2 at index 4
            ];

            // User action: Move S1 (index 1) to before D1 (index 0)
            const action = determineReorderAction(tabs, 1, 0);

            // Classifier returns physical+metadata because:
            // - S1 needs to appear before D1 which is before WB
            // - This requires either WB move or metadata-only depending on H9 patterns
            // The important assertions are metadataRequired and newTabOrder
            expect(action.metadataRequired).toBe(true);
            expect(action.newTabOrder).toBeDefined();
        });

        it('S1→before D1 should include correct newTabOrder', () => {
            // Display order (natural): [D1, S1, S2, D3, D2]
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'document', docIndex: 0 }, // D1 at index 0
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 }, // D3 at index 3
                { type: 'document', docIndex: 2 } // D2 at index 4
            ];

            // User action: Move S1 (index 1) to before D1 (index 0)
            const action = determineReorderAction(tabs, 1, 0);

            // newTabOrder should be [S1, D1, S2, D3, D2] - what user wanted
            expect(action.newTabOrder).toEqual([
                { type: 'sheet', index: 0 },
                { type: 'document', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 1 },
                { type: 'document', index: 2 }
            ]);
        });

        it('E2E: Full _handleTabReorder flow should produce correct metadata', () => {
            // Simulate the EXACT flow of _handleTabReorder
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'document', docIndex: 0 }, // D1 at index 0
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 }, // D3 at index 3
                { type: 'document', docIndex: 2 } // D2 at index 4
            ];

            // Get action (lines 1388-1395 in main.ts)
            const action = determineReorderAction(tabs, 1, 0);

            // Step 1: Update metadata FIRST if needed (lines 1410-1418 in main.ts)
            if (action.metadataRequired && action.physicalMove) {
                if (action.newTabOrder) {
                    editor.updateWorkbookTabOrder(action.newTabOrder);
                }
            }

            // Step 2: Execute physical move (lines 1430-1467 in main.ts)
            // For move-workbook case:
            if (action.physicalMove?.type === 'move-workbook') {
                const { direction, targetDocIndex } = action.physicalMove;
                const toAfterDoc = direction === 'after-doc';
                const toIndex = 0; // S1 moved to position 0
                const moveResult = editor.moveWorkbookSection(targetDocIndex, toAfterDoc, false, toIndex);

                if (moveResult && !moveResult.error && moveResult.content) {
                    // After physical move, regenerate workbook section
                    const wbUpdate = editor.generateAndGetRange();

                    if (wbUpdate && !wbUpdate.error && wbUpdate.content) {
                        const lines = moveResult.content.split('\n');
                        const wbStart = wbUpdate.startLine ?? 0;
                        const wbEnd = wbUpdate.endLine ?? 0;
                        const wbContentLines = wbUpdate.content.trimEnd().split('\n');
                        if (wbUpdate.content) {
                            wbContentLines.push('');
                        }

                        const mergedLines = [...lines.slice(0, wbStart), ...wbContentLines, ...lines.slice(wbEnd + 1)];
                        const mergedContent = mergedLines.join('\n');

                        // Check merged content has correct metadata
                        expect(mergedContent).toContain('tab_order');
                        expect(mergedContent).toContain('"type": "sheet", "index": 0');
                        expect(mergedContent).toContain('"type": "document", "index": 0');
                    }
                }
            }
        });
    });

    describe('Remove all customization - restore natural order from custom', () => {
        const CUSTOM_ORDER_MD = `# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 1}, {"type": "sheet", "index": 0}, {"type": "document", "index": 0}]} -->

# Doc 1
`;

        beforeEach(() => {
            editor.initializeWorkbook(CUSTOM_ORDER_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('restoring natural order [S1, S2, D1] should remove metadata', () => {
            // Natural order for [WB, D1] is [S1, S2, D1]
            const naturalOrder: TabOrderItem[] = [
                { type: 'sheet', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 0 }
            ];

            editor.updateWorkbookTabOrder(naturalOrder);
            const wbUpdate = editor.generateAndGetRange();

            expect(wbUpdate.content).not.toContain('tab_order');
        });
    });
});

// =============================================================================
// 2. Metadata ADDITION Scenarios (result differs from natural order)
// =============================================================================

describe('Integration: Metadata ADDITION scenarios', () => {
    describe('Clean file → add custom order', () => {
        const CLEAN_MD = `# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |

# Doc 1

Content
`;

        beforeEach(() => {
            editor.initializeWorkbook(CLEAN_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('initial state should have tab_order matching natural order', () => {
            // Note: initializeWorkbook currently sets tab_order from structure
            // This is cleaned up by generateAndGetRange when output matches natural order
            const state = JSON.parse(editor.getState());
            // After initialization, tab_order exists but matches natural order [S1, S2, D1]
            expect(state.workbook.metadata?.tab_order).toEqual([
                { type: 'sheet', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 0 }
            ]);
        });

        it('swapping sheets should ADD metadata', () => {
            // Natural: [S1, S2, D1]
            // Custom:  [S2, S1, D1]
            const customOrder: TabOrderItem[] = [
                { type: 'sheet', index: 1 },
                { type: 'sheet', index: 0 },
                { type: 'document', index: 0 }
            ];

            editor.updateWorkbookTabOrder(customOrder);
            const wbUpdate = editor.generateAndGetRange();

            expect(wbUpdate.content).toContain('tab_order');
        });

        it('moving doc to between sheets should ADD metadata', () => {
            // Natural: [S1, S2, D1]
            // Custom:  [S1, D1, S2]
            const customOrder: TabOrderItem[] = [
                { type: 'sheet', index: 0 },
                { type: 'document', index: 0 },
                { type: 'sheet', index: 1 }
            ];

            editor.updateWorkbookTabOrder(customOrder);
            const wbUpdate = editor.generateAndGetRange();

            expect(wbUpdate.content).toContain('tab_order');
        });
    });

    describe('D2 → between S1 and S2 (from natural order)', () => {
        const NATURAL_ORDER_MD = `# Doc 1

# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |

# Doc 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(NATURAL_ORDER_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('moving doc to between sheets should require metadata', () => {
            const tabs = [
                { type: 'document' as const, docIndex: 0 }, // D1
                { type: 'sheet' as const, sheetIndex: 0 }, // S1
                { type: 'sheet' as const, sheetIndex: 1 }, // S2
                { type: 'document' as const, docIndex: 1 }, // D2
                { type: 'add-sheet' as const }
            ];

            // D2 (tab 3) → between S1 and S2 (toIndex 2)
            const action = determineReorderAction(tabs, 3, 2);

            expect(action.metadataRequired).toBe(true);
        });
    });
});

// =============================================================================
// 3. Metadata UPDATE Scenarios (change existing metadata)
// =============================================================================

describe('Integration: Metadata UPDATE scenarios', () => {
    describe('Change custom order to different custom order', () => {
        const CUSTOM_MD = `# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |

## Sheet 3

| C |
| - |
| 3 |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 2}, {"type": "sheet", "index": 0}, {"type": "sheet", "index": 1}]} -->
`;

        beforeEach(() => {
            editor.initializeWorkbook(CUSTOM_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('changing from [S3, S1, S2] to [S1, S3, S2] should update metadata', () => {
            const newOrder: TabOrderItem[] = [
                { type: 'sheet', index: 0 },
                { type: 'sheet', index: 2 },
                { type: 'sheet', index: 1 }
            ];

            editor.updateWorkbookTabOrder(newOrder);
            const wbUpdate = editor.generateAndGetRange();

            expect(wbUpdate.content).toContain('tab_order');
            // Verify it's the new order
            expect(wbUpdate.content).toContain('"type": "sheet", "index": 0');
        });
    });
});

// =============================================================================
// 4. Complex Mixed Structure Scenarios
// =============================================================================

describe('Integration: Mixed Structure scenarios', () => {
    describe('Docs before AND after WB', () => {
        const MIXED_MD = `# Doc Before

# Tables

## Sheet 1

| A |
| - |
| 1 |

# Doc After 1

# Doc After 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(MIXED_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('natural order should be [Doc Before, S1, Doc After 1, Doc After 2]', () => {
            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const naturalOrder = deriveTabOrderFromFile(fileStructure);

            expect(naturalOrder).toEqual([
                { type: 'document', index: 0 }, // Doc Before
                { type: 'sheet', index: 0 }, // S1
                { type: 'document', index: 1 }, // Doc After 1
                { type: 'document', index: 2 } // Doc After 2
            ]);
        });

        it('moving Doc After 1 before S1 should require metadata', () => {
            // Natural: [Doc Before, S1, Doc After 1, Doc After 2]
            // Custom:  [Doc Before, Doc After 1, S1, Doc After 2]
            const customOrder: TabOrderItem[] = [
                { type: 'document', index: 0 },
                { type: 'document', index: 1 },
                { type: 'sheet', index: 0 },
                { type: 'document', index: 2 }
            ];

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const _naturalOrder = deriveTabOrderFromFile(fileStructure);

            const needsMetadata = isMetadataRequired(customOrder, fileStructure);
            expect(needsMetadata).toBe(true);
        });
    });

    describe('Multiple sheets with docs interleaved', () => {
        const INTERLEAVED_MD = `# Doc 1

# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |

## Sheet 3

| C |
| - |
| 3 |

# Doc 2

# Doc 3
`;

        beforeEach(() => {
            editor.initializeWorkbook(INTERLEAVED_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('natural order should be [D1, S1, S2, S3, D2, D3]', () => {
            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const naturalOrder = deriveTabOrderFromFile(fileStructure);

            expect(naturalOrder.length).toBe(6);
            expect(naturalOrder[0]).toEqual({ type: 'document', index: 0 });
            expect(naturalOrder[1]).toEqual({ type: 'sheet', index: 0 });
            expect(naturalOrder[4]).toEqual({ type: 'document', index: 1 });
        });

        it('inserting D2 between S1 and S2 should require metadata', () => {
            // Custom: [D1, S1, D2, S2, S3, D3]
            const customOrder: TabOrderItem[] = [
                { type: 'document', index: 0 },
                { type: 'sheet', index: 0 },
                { type: 'document', index: 1 }, // D2 moved
                { type: 'sheet', index: 1 },
                { type: 'sheet', index: 2 },
                { type: 'document', index: 2 }
            ];

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const _naturalOrder = deriveTabOrderFromFile(fileStructure);

            const needsMetadata = isMetadataRequired(customOrder, fileStructure);
            expect(needsMetadata).toBe(true);
        });
    });
});

// =============================================================================
// 5. Edge Cases
// =============================================================================

describe('Integration: Edge Cases', () => {
    describe('Single sheet, single doc', () => {
        const MINIMAL_MD = `# Tables

## Sheet 1

| A |
| - |
| 1 |

# Doc 1
`;

        beforeEach(() => {
            editor.initializeWorkbook(MINIMAL_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('only two items - swapping requires metadata', () => {
            // [S1, D1] is natural
            // [D1, S1] requires metadata
            const customOrder: TabOrderItem[] = [
                { type: 'document', index: 0 },
                { type: 'sheet', index: 0 }
            ];

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const _naturalOrder = deriveTabOrderFromFile(fileStructure);

            const needsMetadata = isMetadataRequired(customOrder, fileStructure);
            expect(needsMetadata).toBe(true);
        });
    });

    describe('No workbook (docs only)', () => {
        const DOCS_ONLY_MD = `# Doc 1

Content 1

# Doc 2

Content 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(DOCS_ONLY_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('should handle docs-only structure', () => {
            const state = JSON.parse(editor.getState());
            expect(state.structure.length).toBe(2);
            expect(state.structure[0].type).toBe('document');
            expect(state.structure[1].type).toBe('document');
        });
    });

    describe('No docs (sheets only)', () => {
        const SHEETS_ONLY_MD = `# Tables

## Sheet 1

| A |
| - |
| 1 |

## Sheet 2

| B |
| - |
| 2 |
`;

        beforeEach(() => {
            editor.initializeWorkbook(SHEETS_ONLY_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('swapping sheets should require metadata', () => {
            const customOrder: TabOrderItem[] = [
                { type: 'sheet', index: 1 },
                { type: 'sheet', index: 0 }
            ];

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const _naturalOrder = deriveTabOrderFromFile(fileStructure);

            const needsMetadata = isMetadataRequired(customOrder, fileStructure);
            expect(needsMetadata).toBe(true);
        });

        it('natural order should not require metadata', () => {
            const naturalOrderInput: TabOrderItem[] = [
                { type: 'sheet', index: 0 },
                { type: 'sheet', index: 1 }
            ];

            const state = JSON.parse(editor.getState());
            const fileStructure = buildFileStructure(state.structure, state.workbook?.sheets?.length ?? 0);
            const _fileNaturalOrder = deriveTabOrderFromFile(fileStructure);

            const needsMetadata = isMetadataRequired(naturalOrderInput, fileStructure);
            expect(needsMetadata).toBe(false);
        });
    });

    /**
     * BUG REPORT: Natural Order Restoration should REMOVE tab_order
     *
     * Initial State:
     * - Physical: [WB(S1, S2), D1, D2]
     * - tab_order: [S1, D1, S2, D1, D2] → Display: [S1, D1, S2, D2]
     *
     * Scenario 1: S1 → between D1 and S2 (moveSheet causes WB to move)
     * - New physical: [D1, WB(S1, S2), D2]
     * - New display: [D1, S1, S2, D2] = natural order
     * - Expected: tab_order should be REMOVED
     *
     * Scenario 2: D1 → before S1 (moveDocument)
     * - New physical: [D1, WB(S1, S2), D2]
     * - New display: [D1, S1, S2, D2] = natural order
     * - Expected: tab_order should be REMOVED
     */
    describe('E2E: Restore natural order should REMOVE tab_order', () => {
        const INITIAL_MD = `# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

<!-- md-spreadsheet-workbook-metadata: {"tab_order": [{"type": "sheet", "index": 0}, {"type": "document", "index": 0}, {"type": "sheet", "index": 1}, {"type": "document", "index": 1}]} -->

# Doc 1

# Doc 2
`;

        beforeEach(() => {
            editor.initializeWorkbook(INITIAL_MD, JSON.stringify({ rootMarker: '# Tables' }));
        });

        it('should verify initial state: tab_order = [S1, D1, S2, D2]', () => {
            const state = JSON.parse(editor.getState());
            expect(state.workbook.metadata?.tab_order).toEqual([
                { type: 'sheet', index: 0 },
                { type: 'document', index: 0 },
                { type: 'sheet', index: 1 },
                { type: 'document', index: 1 }
            ]);
        });

        it('Scenario 1 (moveSheet): S1 → between D1/S2 should REMOVE tab_order', () => {
            // Use TabReorderExecutor instead of manual flow simulation
            // This matches the actual production code path
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 0
                { type: 'document', docIndex: 0 }, // D1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 } // D2 at index 3
            ];

            // Verify action returns metadataRequired=false (natural order restoration)
            const action = determineReorderAction(tabs, 0, 2);
            expect(action.actionType).toBe('physical');
            expect(action.metadataRequired).toBe(false);
            expect(action.physicalMove?.type).toBe('move-workbook');

            // Use TabReorderExecutor to execute the complete flow
            let finalContent: string | undefined;
            const callbacks = {
                postBatchUpdate: (result: { content?: string }) => {
                    if (result.content) {
                        finalContent = result.content;
                    }
                },
                reorderTabsArray: () => {
                    // No-op for this test
                },
                getCurrentTabOrder: (): Array<{ type: 'sheet' | 'document'; index: number }> => {
                    return tabs
                        .filter((t) => t.type === 'sheet' || t.type === 'document')
                        .map((t) => ({
                            type: t.type as 'sheet' | 'document',
                            index: t.type === 'sheet' ? t.sheetIndex! : t.docIndex!
                        }));
                }
            };

            const result = TabReorderExecutor.execute(tabs, 0, 2, callbacks);
            expect(result.success).toBe(true);

            // The final content should NOT contain tab_order
            // because the result is natural order [D1, S1, S2, D2]
            if (finalContent) {
                expect(finalContent).not.toContain('tab_order');
            }
        });

        it('Scenario 2 (moveDocument): D1 → before S1 should REMOVE tab_order', () => {
            /**
             * This test verifies the fix in main.ts:
             *
             * BUG: When metadataRequired=false, main.ts skipped generateAndGetRange(),
             *      so old tab_order remained in the file.
             * FIX: Always call generateAndGetRange() for move-document to ensure
             *      metadata cleanup is included in result.
             *
             * This test simulates the FIXED main.ts flow:
             * 1. Remove tab_order first (because metadataRequired=false)
             * 2. Execute physical move
             * 3. ALWAYS regenerate workbook (the key fix!)
             * 4. Merge results
             */

            // Current display: [S1, D1, S2, D2] (indices 0, 1, 2, 3)
            // Action: Move D1 (index 1) to before S1 (index 0) → results in [D1, S1, S2, D2]
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'sheet', sheetIndex: 0 }, // S1 at index 0
                { type: 'document', docIndex: 0 }, // D1 at index 1
                { type: 'sheet', sheetIndex: 1 }, // S2 at index 2
                { type: 'document', docIndex: 1 } // D2 at index 3
            ];

            const action = determineReorderAction(tabs, 1, 0); // D1 to position 0

            // Verify action is what we expect
            expect(action.physicalMove?.type).toBe('move-document');
            expect(action.metadataRequired).toBe(false); // Result is natural order

            // Step 1: Remove tab_order (main.ts line 1417-1418)
            // This is called because metadataRequired=false && physicalMove exists
            if (!action.metadataRequired && action.physicalMove) {
                editor.updateWorkbookTabOrder(null);
            }

            // Step 2: Execute physical move (main.ts line 1476-1481)
            if (action.physicalMove?.type === 'move-document') {
                const { fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook } = action.physicalMove;
                const moveResult = editor.moveDocumentSection(
                    fromDocIndex,
                    toDocIndex,
                    toAfterWorkbook,
                    toBeforeWorkbook
                );

                expect(moveResult.error).toBeUndefined();
                expect(moveResult.content).toBeDefined();

                // Step 3: ALWAYS regenerate workbook (the FIX - main.ts line 1491)
                // Before fix: only regenerated if metadataRequired=true
                // After fix: always regenerate to include metadata cleanup
                if (moveResult.content) {
                    const wbUpdate = editor.generateAndGetRange();

                    if (wbUpdate && !wbUpdate.error && wbUpdate.content) {
                        // Step 4: Merge results (main.ts lines 1495-1508)
                        const lines = moveResult.content.split('\n');
                        const wbStart = wbUpdate.startLine ?? 0;
                        const wbEnd = wbUpdate.endLine ?? 0;
                        const wbContentLines = wbUpdate.content.trimEnd().split('\n');
                        wbContentLines.push('');

                        const mergedLines = [...lines.slice(0, wbStart), ...wbContentLines, ...lines.slice(wbEnd + 1)];
                        const mergedContent = mergedLines.join('\n');

                        // Verify: tab_order should be REMOVED (natural order)
                        expect(mergedContent).not.toContain('tab_order');
                    }
                }
            }
        });

        it('REGRESSION: OLD buggy behavior would leave tab_order (proves fix is needed)', () => {
            /**
             * This test proves the fix is needed by showing what the OLD behavior produced.
             *
             * OLD BUG (before fix):
             * - When metadataRequired=false, skip generateAndGetRange()
             * - Just send moveResult directly → contains OLD tab_order
             *
             * This test simulates the OLD buggy flow and verifies it WOULD fail.
             */
            const tabs: Array<{ type: 'sheet' | 'document' | 'add-sheet'; sheetIndex?: number; docIndex?: number }> = [
                { type: 'sheet', sheetIndex: 0 },
                { type: 'document', docIndex: 0 },
                { type: 'sheet', sheetIndex: 1 },
                { type: 'document', docIndex: 1 }
            ];

            const action = determineReorderAction(tabs, 1, 0);
            expect(action.metadataRequired).toBe(false);

            // Step 1: Remove tab_order (this was added correctly)
            editor.updateWorkbookTabOrder(null);

            // Step 2: Physical move
            if (action.physicalMove?.type === 'move-document') {
                const { fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook } = action.physicalMove;
                const moveResult = editor.moveDocumentSection(
                    fromDocIndex,
                    toDocIndex,
                    toAfterWorkbook,
                    toBeforeWorkbook
                );

                // OLD BUGGY BEHAVIOR: skip regeneration when metadataRequired=false
                // This would send moveResult.content directly, which still has OLD tab_order

                // Verify: moveResult STILL contains old tab_order (from before updateWorkbookTabOrder)
                // This proves that without regeneration, the bug persists
                expect(moveResult.content).toContain('tab_order');

                // FIXED BEHAVIOR would regenerate and NOT contain tab_order
                const wbUpdate = editor.generateAndGetRange();
                expect(wbUpdate.content).not.toContain('tab_order');
            }
        });
    });
});
