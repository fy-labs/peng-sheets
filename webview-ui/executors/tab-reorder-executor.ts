/**
 * TabReorderExecutor - Singleton executor for tab reorder operations.
 *
 * This executor encapsulates the complex tab reordering logic from main.ts _handleTabReorder.
 * It uses tab-reorder-service for action determination and editor module for physical moves.
 *
 * Pattern follows existing clipboard-store.ts singleton pattern.
 */

import * as editor from '../../src/editor';
import {
    determineReorderAction,
    type ReorderAction,
    type PhysicalMove,
    type TabOrderItem
} from '../services/tab-reorder-service';

export interface TabReorderResult {
    success: boolean;
    content?: string;
    startLine?: number;
    endLine?: number;
    newActiveTabIndex?: number;
    error?: string;
}

export interface TabInfo {
    type: 'sheet' | 'document' | 'add-sheet';
    sheetIndex?: number;
    docIndex?: number;
}

/**
 * Callback interface for batch operations.
 * This allows the executor to work without direct dependency on SpreadsheetService.
 */
export interface BatchCallbacks {
    postBatchUpdate: (result: { content?: string; startLine?: number; endLine?: number }) => void;
    reorderTabsArray: (fromIndex: number, toIndex: number) => void;
    getCurrentTabOrder: () => TabOrderItem[];
}

class TabReorderExecutorClass {
    /**
     * Execute tab reorder operation.
     *
     * @param tabs - Current tab definitions
     * @param fromIndex - Source tab index
     * @param toIndex - Target tab index
     * @param callbacks - Batch operation callbacks
     * @returns Result of the reorder operation
     */
    execute(tabs: TabInfo[], fromIndex: number, toIndex: number, callbacks: BatchCallbacks): TabReorderResult {
        const action = determineReorderAction(tabs, fromIndex, toIndex);

        if (action.actionType === 'no-op') {
            return { success: true };
        }

        try {
            // Update metadata FIRST (if needed) so it's included in the physical move result
            if (action.metadataRequired && action.physicalMove) {
                if (action.newTabOrder) {
                    const result = editor.updateWorkbookTabOrder(action.newTabOrder);
                    if (result && result.error) {
                        console.error('[TabReorderExecutor] Metadata update failed:', result.error);
                    }
                }
            } else if (!action.metadataRequired && action.physicalMove) {
                // Result is natural order - remove existing tab_order before physical move
                editor.updateWorkbookTabOrder(null);
            }

            // Execute physical move AFTER metadata
            if (action.physicalMove) {
                const moveResult = this._executePhysicalMove(action, toIndex, callbacks);
                if (moveResult.error) {
                    return { success: false, error: moveResult.error };
                }

                // Execute secondary physical moves
                if (action.secondaryPhysicalMoves && action.secondaryPhysicalMoves.length > 0) {
                    for (const secondaryMove of action.secondaryPhysicalMoves) {
                        this._executeSecondaryMove(secondaryMove, callbacks);
                    }
                }
            } else {
                // Metadata-only case (no physical move)
                this._executeMetadataOnly(action, fromIndex, toIndex, callbacks);
            }

            // Calculate final position
            const newActiveTabIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;

            return {
                success: true,
                newActiveTabIndex
            };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('[TabReorderExecutor] Unexpected error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Execute primary physical move based on action type.
     */
    private _executePhysicalMove(
        action: ReorderAction,
        toIndex: number,
        callbacks: BatchCallbacks
    ): { error?: string } {
        const move = action.physicalMove!;

        switch (move.type) {
            case 'move-sheet':
                return this._executeMoveSheet(move, toIndex, action.metadataRequired, callbacks);

            case 'move-workbook':
                return this._executeMoveWorkbook(move, toIndex, callbacks);

            case 'move-document':
                return this._executeMoveDocument(move, callbacks);

            default:
                return { error: `Unknown move type: ${(move as PhysicalMove).type}` };
        }
    }

    /**
     * Execute move-sheet operation.
     */
    private _executeMoveSheet(
        move: PhysicalMove & { type: 'move-sheet' },
        toIndex: number,
        metadataRequired: boolean,
        callbacks: BatchCallbacks
    ): { error?: string } {
        const { fromSheetIndex, toSheetIndex } = move;
        const targetTabOrderIndex = metadataRequired ? toIndex : null;
        const result = editor.moveSheet(fromSheetIndex, toSheetIndex, targetTabOrderIndex);
        if (result) callbacks.postBatchUpdate(result);
        return {};
    }

    /**
     * Execute move-workbook operation with merged content.
     */
    private _executeMoveWorkbook(
        move: PhysicalMove & { type: 'move-workbook' },
        toIndex: number,
        callbacks: BatchCallbacks
    ): { error?: string } {
        const { direction, targetDocIndex } = move;
        const toAfterDoc = direction === 'after-doc';
        const moveResult = editor.moveWorkbookSection(targetDocIndex, toAfterDoc, false, toIndex);

        if (moveResult && !moveResult.error && moveResult.content) {
            const mergedContent = this._mergeWithWorkbookSection(moveResult.content);
            if (mergedContent) {
                callbacks.postBatchUpdate({
                    content: mergedContent.content,
                    startLine: 0,
                    endLine: mergedContent.originalLineCount - 1
                });
            } else {
                callbacks.postBatchUpdate(moveResult);
            }
        } else if (moveResult) {
            callbacks.postBatchUpdate(moveResult);
        }

        return {};
    }

    /**
     * Execute move-document operation with merged content.
     */
    private _executeMoveDocument(
        move: PhysicalMove & { type: 'move-document' },
        callbacks: BatchCallbacks
    ): { error?: string } {
        const { fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook } = move;

        const moveResult = editor.moveDocumentSection(fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook);

        if (moveResult.error) {
            return { error: moveResult.error };
        }

        if (moveResult.content) {
            const mergedContent = this._mergeWithWorkbookSection(moveResult.content);
            if (mergedContent) {
                callbacks.postBatchUpdate({
                    content: mergedContent.content,
                    startLine: 0,
                    endLine: mergedContent.originalLineCount - 1
                });
            } else {
                callbacks.postBatchUpdate(moveResult);
            }
        }

        return {};
    }

    /**
     * Execute secondary document move.
     */
    private _executeSecondaryMove(move: PhysicalMove, callbacks: BatchCallbacks): void {
        if (move.type !== 'move-document') return;

        const { fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook } = move;
        const moveResult = editor.moveDocumentSection(fromDocIndex, toDocIndex, toAfterWorkbook, toBeforeWorkbook);

        if (moveResult.error) {
            console.error('[TabReorderExecutor] Secondary move failed:', moveResult.error);
            return;
        }

        if (moveResult.content) {
            const mergedContent = this._mergeWithWorkbookSection(moveResult.content);
            if (mergedContent) {
                callbacks.postBatchUpdate({
                    content: mergedContent.content,
                    startLine: 0,
                    endLine: mergedContent.originalLineCount - 1
                });
            } else {
                callbacks.postBatchUpdate(moveResult);
            }
        }
    }

    /**
     * Execute metadata-only update (no physical move).
     */
    private _executeMetadataOnly(
        action: ReorderAction,
        fromIndex: number,
        toIndex: number,
        callbacks: BatchCallbacks
    ): void {
        if (action.metadataRequired) {
            if (action.newTabOrder) {
                const result = editor.updateWorkbookTabOrder(action.newTabOrder);
                if (result) callbacks.postBatchUpdate(result);
            } else {
                callbacks.reorderTabsArray(fromIndex, toIndex);
                const tabOrder = callbacks.getCurrentTabOrder();
                const result = editor.updateWorkbookTabOrder(tabOrder);
                if (result) callbacks.postBatchUpdate(result);
            }
        } else if (action.actionType === 'metadata') {
            const result = editor.updateWorkbookTabOrder(null);
            if (result) callbacks.postBatchUpdate(result);
            callbacks.reorderTabsArray(fromIndex, toIndex);
        }
    }

    /**
     * Merge move result content with regenerated workbook section.
     * This ensures metadata changes are included in the final output.
     */
    private _mergeWithWorkbookSection(moveContent: string): { content: string; originalLineCount: number } | null {
        const wbUpdate = editor.generateAndGetRange();

        if (!wbUpdate || wbUpdate.error || !wbUpdate.content) {
            return null;
        }

        const lines = moveContent.split('\n');
        const wbStart = wbUpdate.startLine ?? 0;
        const wbEnd = wbUpdate.endLine ?? 0;
        const wbContentLines = wbUpdate.content.trimEnd().split('\n');
        if (wbUpdate.content) {
            wbContentLines.push('');
        }

        const mergedLines = [...lines.slice(0, wbStart), ...wbContentLines, ...lines.slice(wbEnd + 1)];

        return {
            content: mergedLines.join('\n'),
            originalLineCount: lines.length
        };
    }

    /**
     * Reset state for testing purposes.
     */
    _resetForTesting(): void {
        // Currently stateless, but this method exists for API consistency
    }
}

/** Singleton instance of TabReorderExecutor */
export const TabReorderExecutor = new TabReorderExecutorClass();
