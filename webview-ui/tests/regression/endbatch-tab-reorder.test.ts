/**
 * Regression test for endBatch() tab reorder bug
 *
 * Bug: When D3 is moved to after S1 in [D1, S1, S2, D2, D3],
 * the physical file order should change but it doesn't.
 * Only tab_order metadata is updated.
 *
 * Root cause: endBatch() uses last update's content, but when
 * physical move happens BEFORE metadata update in the batch,
 * the last update (metadata) may not contain the physical move result.
 *
 * This test verifies at the SpreadsheetService level that:
 * 1. Physical move content is preserved in batch
 * 2. Metadata updates don't overwrite physical moves
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpreadsheetService } from '../../services/spreadsheet-service';
import { IVSCodeApi } from '../../services/types';
import * as editor from '../../../src/editor';

describe('Regression: endBatch() tab reorder physical move', () => {
    let service: SpreadsheetService;
    let mockVscode: IVSCodeApi;
    let postedMessages: unknown[];

    beforeEach(async () => {
        postedMessages = [];
        mockVscode = {
            postMessage: vi.fn((msg) => {
                postedMessages.push(msg);
            }),
            getState: vi.fn(),
            setState: vi.fn()
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Bug reproduction: Physical move + metadata update in batch.
     *
     * When _handleTabReorder does:
     * 1. startBatch()
     * 2. updateWorkbookTabOrder() - metadata update (batched)
     * 3. moveDocumentSection() - physical move (batched)
     * 4. endBatch()
     *
     * The final message should contain the physical move content,
     * not just the metadata update content.
     */
    it('batch with physical move + metadata should preserve physical move content', async () => {
        // Setup: File with docs before and after workbook
        const mdContent = `# Doc 1

Content of Doc 1.

# Tables

## Sheet 1

| Column 1 |
| --- |
| A |

## Sheet 2

| Column 1 |
| --- |
| B |

# Doc 2

Content of Doc 2.

# Doc 3

Content of Doc 3.
`;

        editor.initializeWorkbook(mdContent, JSON.stringify({ rootMarker: '# Tables' }));
        service = new SpreadsheetService(mockVscode);
        await service.initialize();

        // Verify initial structure: [D1, WB, D2, D3]
        const initialState = JSON.parse(editor.getState());
        const initialDocs = initialState.structure
            .filter((s: { type: string }) => s.type === 'document')
            .map((s: { title: string }) => s.title);
        expect(initialDocs).toEqual(['Doc 1', 'Doc 2', 'Doc 3']);

        // Simulate _handleTabReorder: D3 to after S1
        // This requires both metadata update AND physical move
        service.startBatch();

        // Step 1: Metadata update FIRST (as _handleTabReorder does)
        // This sets tab_order to show D3 between S1 and S2
        const metadataResult = editor.updateWorkbookTabOrder([
            { type: 'document', index: 0 }, // D1
            { type: 'sheet', index: 0 }, // S1
            { type: 'document', index: 2 }, // D3 (moved here)
            { type: 'sheet', index: 1 }, // S2
            { type: 'document', index: 1 } // D2
        ]);
        if (metadataResult && !metadataResult.error) {
            service.postBatchUpdate(metadataResult);
        }

        // Step 2: Physical move AFTER metadata
        // D3 (docIndex 2) moves to after workbook
        const physicalResult = editor.moveDocumentSection(
            2, // fromDocIndex: D3
            null, // toDocIndex: null = relative to workbook
            true, // toAfterWorkbook
            false // toBeforeWorkbook
        );
        if (physicalResult && !physicalResult.error) {
            service.postBatchUpdate(physicalResult);
        }

        // End batch - this should send a single message with physical move content
        service.endBatch();

        // Verify: Should have exactly 1 message posted
        expect(postedMessages.length).toBe(1);

        const message = postedMessages[0] as { type: string; content: string };
        expect(message.type).toBe('updateRange');
        expect(message.content).toBeDefined();

        // CRITICAL ASSERTION: The content must contain physical move result
        // After physical move, D3 should appear BEFORE D2 in the file
        const doc3Pos = message.content.indexOf('# Doc 3');
        const doc2Pos = message.content.indexOf('# Doc 2');

        expect(doc3Pos).toBeGreaterThan(0);
        expect(doc2Pos).toBeGreaterThan(0);

        // This is the key test: D3 should be before D2 in the physical content
        expect(doc3Pos).toBeLessThan(doc2Pos);
    });

    /**
     * Verify that updates with different ranges in batch work correctly.
     *
     * When metadata update has a different range than physical move,
     * endBatch() should still use the last update's content which should
     * have the cumulative result.
     */
    it('batch updates should use last content regardless of range sizes', async () => {
        const mdContent = `# Tables

## Sheet 1

| Column 1 |
| --- |
| A |

# Doc 1

Content
`;

        editor.initializeWorkbook(mdContent, JSON.stringify({ rootMarker: '# Tables' }));
        service = new SpreadsheetService(mockVscode);
        await service.initialize();

        service.startBatch();

        // First update: Full file range
        const update1 = {
            startLine: 0,
            endLine: 20,
            endCol: 0,
            content: 'Update 1 Content - should be overwritten'
        };
        service.postBatchUpdate(update1);

        // Second update: Smaller range but with correct final content
        const update2 = {
            startLine: 5,
            endLine: 10,
            endCol: 0,
            content: 'Update 2 Content - THIS should be used'
        };
        service.postBatchUpdate(update2);

        service.endBatch();

        expect(postedMessages.length).toBe(1);
        const message = postedMessages[0] as { content: string };

        // Should use update2's content (last update), not update1
        expect(message.content).toBe('Update 2 Content - THIS should be used');
    });

    /**
     * USER's exact bug scenario: D3 → after S1 in [D1, S1, S2, D2, D3]
     *
     * Physical structure: [D1, WB(S1, S2), D2, D3]
     * Tab order (display): [D1, S1, S2, D2, D3]
     *
     * When D3 is moved to after S1, it should:
     * 1. Physical move: D3 moves to after WB (before D2)
     * 2. Metadata: tab_order = [D1, S1, D3, S2, D2]
     *
     * The final content sent to VS Code must have BOTH:
     * - Physical change: D3 before D2 in file
     * - Metadata: tab_order updated
     */
    it('USER BUG: D3→after S1 in [D1, S1, S2, D2, D3] must include physical move', async () => {
        // Replicate user's workbook.md structure
        const mdContent = `# Doc 1

# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

# Doc 2

# Doc 3
`;

        editor.initializeWorkbook(mdContent, JSON.stringify({ rootMarker: '# Tables' }));
        service = new SpreadsheetService(mockVscode);
        await service.initialize();

        // Verify structure: [D1, WB, D2, D3]
        const initialState = JSON.parse(editor.getState());
        expect(initialState.structure[0].title).toBe('Doc 1');
        expect(initialState.structure[1].type).toBe('workbook');
        expect(initialState.structure[2].title).toBe('Doc 2');
        expect(initialState.structure[3].title).toBe('Doc 3');

        // Simulate the EXACT flow in _handleTabReorder for D3→after S1
        // Tab indices: [D1=0, S1=1, S2=2, D2=3, D3=4]
        // Move D3 (index 4) to after S1 (toIndex = 2)

        service.startBatch();

        // Step 1: Metadata update FIRST (as _handleTabReorder does on lines 1409-1417)
        // newTabOrder = [D1, S1, D3, S2, D2]
        const metadataResult = editor.updateWorkbookTabOrder([
            { type: 'document', index: 0 }, // D1
            { type: 'sheet', index: 0 }, // S1
            { type: 'document', index: 2 }, // D3 - moved between S1 and S2
            { type: 'sheet', index: 1 }, // S2
            { type: 'document', index: 1 } // D2
        ]);
        // Note: metadata update is NOT posted to batch in lines 1409-1417
        // It's done to set the state, then physical move includes it
        expect(metadataResult.error).toBeUndefined();

        // Step 2: Physical move - D3 to after workbook
        // This is what move-document case does on lines 1438-1487
        const moveResult = editor.moveDocumentSection(
            2, // fromDocIndex: D3 (0=D1, 1=D2, 2=D3)
            null, // toDocIndex: null = relative to workbook
            true, // toAfterWorkbook
            false // toBeforeWorkbook
        );
        expect(moveResult.error).toBeUndefined();

        // Step 3: Regenerate workbook section (lines 1457-1480)
        // This merges the physical move content with updated workbook metadata
        if (moveResult.content) {
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

                service.postBatchUpdate({
                    content: mergedContent,
                    startLine: 0,
                    endLine: lines.length
                });
            }
        }

        service.endBatch();

        // Verify the message
        expect(postedMessages.length).toBe(1);
        const message = postedMessages[0] as { content: string };

        // CRITICAL: Content must include BOTH physical move AND metadata
        // 1. Physical: D3 before D2
        const doc3Pos = message.content.indexOf('# Doc 3');
        const doc2Pos = message.content.indexOf('# Doc 2');
        expect(doc3Pos).toBeGreaterThan(0);
        expect(doc2Pos).toBeGreaterThan(0);
        expect(doc3Pos).toBeLessThan(doc2Pos); // D3 must be before D2

        // 2. Metadata: tab_order present
        expect(message.content).toContain('tab_order');
    });

    /**
     * DEBUG: Verify that generateAndGetRange() returns correct line ranges
     * after a physical document move.
     *
     * This test checks if the merge logic in _handleTabReorder is receiving
     * correct line numbers from generateAndGetRange() relative to moveResult.content.
     */
    it('DEBUG: generateAndGetRange line ranges after physical move', async () => {
        // User's exact scenario: [D1, WB(S1,S2), D2, D3]
        const mdContent = `# Doc 1

# Tables

## Sheet 1

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

## Sheet 2

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |

# Doc 2

# Doc 3
`;

        editor.initializeWorkbook(mdContent, JSON.stringify({ rootMarker: '# Tables' }));

        // Step 1: Update metadata (as _handleTabReorder does)
        const metadataResult = editor.updateWorkbookTabOrder([
            { type: 'document', index: 0 },
            { type: 'sheet', index: 0 },
            { type: 'document', index: 2 }, // D3 moved
            { type: 'sheet', index: 1 },
            { type: 'document', index: 1 }
        ]);
        expect(metadataResult.error).toBeUndefined();

        // Step 2: Physical move - D3 to after workbook
        const moveResult = editor.moveDocumentSection(
            2, // D3
            null,
            true,
            false
        );
        expect(moveResult.error).toBeUndefined();
        expect(moveResult.content).toBeDefined();

        // Get the line ranges from generateAndGetRange
        const wbUpdate = editor.generateAndGetRange();

        // Log the values for debugging
        const moveContentLines = moveResult.content!.split('\n');
        console.log('moveResult content line count:', moveContentLines.length);
        console.log('wbUpdate.startLine:', wbUpdate.startLine);
        console.log('wbUpdate.endLine:', wbUpdate.endLine);

        // Verify the line ranges are valid for moveResult.content
        const wbStart = wbUpdate.startLine ?? 0;
        const wbEnd = wbUpdate.endLine ?? 0;

        // CRITICAL: wbStart and wbEnd should be valid indices for moveResult.content
        expect(wbStart).toBeLessThan(moveContentLines.length);
        expect(wbEnd).toBeLessThanOrEqual(moveContentLines.length);

        // Check what's at the expected workbook section start
        console.log('Line at wbStart:', moveContentLines[wbStart]);
        console.log('Line at wbEnd:', moveContentLines[wbEnd] || 'END OF FILE');

        // After merge, verify D3 is before D2
        const wbContentLines = wbUpdate.content!.trimEnd().split('\n');
        wbContentLines.push('');

        const mergedLines = [
            ...moveContentLines.slice(0, wbStart),
            ...wbContentLines,
            ...moveContentLines.slice(wbEnd + 1)
        ];
        const mergedContent = mergedLines.join('\n');

        console.log('mergedContent (first 50 chars):', mergedContent.slice(0, 50));

        // Final verification
        const doc3Pos = mergedContent.indexOf('# Doc 3');
        const doc2Pos = mergedContent.indexOf('# Doc 2');

        console.log('D3 position:', doc3Pos);
        console.log('D2 position:', doc2Pos);

        // This is the key assertion - D3 must be before D2 in merged content
        expect(doc3Pos).toBeGreaterThan(0);
        expect(doc2Pos).toBeGreaterThan(0);
        expect(doc3Pos).toBeLessThan(doc2Pos);
    });
});
