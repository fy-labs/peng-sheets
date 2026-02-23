/**
 * Sheet service - Sheet-level operations.
 * Converted from python-modules/src/md_spreadsheet_editor/services/sheet.py
 */

import { Workbook, Sheet, Table } from 'md-spreadsheet-parser';
import type { EditorContext } from '../context';
import type { UpdateResult, TabOrderItem } from '../types';
import {
    applySheetUpdate,
    generateAndGetRange,
    initializeTabOrderFromStructure,
    isTabOrderRedundant,
    reorderTabMetadata,
    updateWorkbook
} from './workbook';

/**
 * Add a new sheet to the workbook.
 */
export function addSheet(
    context: EditorContext,
    newName: string,
    columnNames: string[] | null = null,
    tableName: string | null = null,
    afterSheetIndex: number | null = null,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    let workbook = context.workbook;

    if (workbook === null) {
        workbook = new Workbook({ sheets: [], metadata: {} });
    }

    let finalName = newName;
    if (!finalName) {
        // Generate default name if empty
        const existingNames = (workbook.sheets ?? []).map((s) => s.name);
        let i = 1;
        while (existingNames.includes(`Sheet ${i}`)) {
            i++;
        }
        finalName = `Sheet ${i}`;
    }

    const finalCols = columnNames ?? ['Column 1', 'Column 2', 'Column 3'];

    try {
        // Create new sheet with custom headers and table name
        const finalTableName = tableName ?? 'Table 1';
        const newTable = new Table({
            name: finalTableName,
            headers: finalCols,
            rows: [finalCols.map(() => '')],
            metadata: {}
        });
        const newSheet = new Sheet({
            name: finalName,
            tables: [newTable]
        });

        const newSheets = [...(workbook.sheets ?? [])];
        const currentMetadata = workbook.metadata ? { ...workbook.metadata } : {};
        let tabOrder: TabOrderItem[] = [...(currentMetadata.tab_order || [])];
        let newSheetIndex: number;

        // Determine insertion position
        if (afterSheetIndex !== null && afterSheetIndex >= 0 && afterSheetIndex <= newSheets.length) {
            // Insert at specified position
            newSheetIndex = afterSheetIndex;
            newSheets.splice(newSheetIndex, 0, newSheet);

            // If tab_order is empty, initialize from structure
            if (!tabOrder.length) {
                tabOrder = initializeTabOrderFromStructure(
                    context.mdText,
                    context.config,
                    (workbook.sheets ?? []).length
                );
            }

            // Update indices of sheets that come after the insertion point
            for (const item of tabOrder) {
                if (item.type === 'sheet' && item.index >= newSheetIndex) {
                    item.index = item.index + 1;
                }
            }

            // Insert new sheet entry at specified tab_order position
            if (targetTabOrderIndex !== null) {
                tabOrder.splice(targetTabOrderIndex, 0, { type: 'sheet', index: newSheetIndex });
            } else {
                tabOrder.push({ type: 'sheet', index: newSheetIndex });
            }

            currentMetadata.tab_order = tabOrder;
        } else {
            // Append at end (default behavior)
            newSheetIndex = newSheets.length;
            newSheets.push(newSheet);

            // If tab_order is empty, initialize from structure
            if (!tabOrder.length && newSheetIndex > 0) {
                tabOrder = initializeTabOrderFromStructure(context.mdText, context.config, newSheetIndex);
            }

            // Add new sheet entry
            if (targetTabOrderIndex !== null) {
                tabOrder.splice(targetTabOrderIndex, 0, { type: 'sheet', index: newSheetIndex });
            } else {
                tabOrder.push({ type: 'sheet', index: newSheetIndex });
            }
            currentMetadata.tab_order = tabOrder;
        }

        // Cleanup redundant tab_order
        if (isTabOrderRedundant(tabOrder, newSheets.length) && currentMetadata.tab_order) {
            delete currentMetadata.tab_order;
        }

        const newWorkbook = new Workbook({
            ...workbook,
            sheets: newSheets,
            metadata: currentMetadata
        });
        context.updateWorkbook(newWorkbook);
        return generateAndGetRange(context);
    } catch (e) {
        return { error: String(e) };
    }
}

/**
 * Add a new doc sheet (document-type sheet within workbook).
 * Similar to addSheet but creates a sheet with type='doc' and content instead of tables.
 */
export function addDocSheet(
    context: EditorContext,
    newName: string,
    content: string = '',
    afterSheetIndex: number | null = null,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    let workbook = context.workbook;

    if (workbook === null) {
        workbook = new Workbook({ sheets: [], metadata: {} });
    }

    let finalName = newName;
    if (!finalName) {
        // Generate default name if empty
        const existingNames = (workbook.sheets ?? []).map((s) => s.name);
        let i = 1;
        while (existingNames.includes(`Document ${i}`)) {
            i++;
        }
        finalName = `Document ${i}`;
    }

    try {
        // Create new doc sheet with type='doc' and content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sheetOpts: any = {
            name: finalName,
            tables: [],
            type: 'doc',
            content: content
        };
        const newSheet = new Sheet(sheetOpts);

        const newSheets = [...(workbook.sheets ?? [])];
        const currentMetadata = workbook.metadata ? { ...workbook.metadata } : {};
        let tabOrder: TabOrderItem[] = [...(currentMetadata.tab_order || [])];
        let newSheetIndex: number;

        // Determine insertion position (same logic as addSheet)
        if (afterSheetIndex !== null && afterSheetIndex >= 0 && afterSheetIndex <= newSheets.length) {
            newSheetIndex = afterSheetIndex;
            newSheets.splice(newSheetIndex, 0, newSheet);

            if (!tabOrder.length) {
                tabOrder = initializeTabOrderFromStructure(
                    context.mdText,
                    context.config,
                    (workbook.sheets ?? []).length
                );
            }

            for (const item of tabOrder) {
                if (item.type === 'sheet' && item.index >= newSheetIndex) {
                    item.index = item.index + 1;
                }
            }

            if (targetTabOrderIndex !== null) {
                tabOrder.splice(targetTabOrderIndex, 0, { type: 'sheet', index: newSheetIndex });
            } else {
                tabOrder.push({ type: 'sheet', index: newSheetIndex });
            }

            currentMetadata.tab_order = tabOrder;
        } else {
            newSheetIndex = newSheets.length;
            newSheets.push(newSheet);

            if (!tabOrder.length && newSheetIndex > 0) {
                tabOrder = initializeTabOrderFromStructure(context.mdText, context.config, newSheetIndex);
            }

            if (targetTabOrderIndex !== null) {
                tabOrder.splice(targetTabOrderIndex, 0, { type: 'sheet', index: newSheetIndex });
            } else {
                tabOrder.push({ type: 'sheet', index: newSheetIndex });
            }
            currentMetadata.tab_order = tabOrder;
        }

        // Cleanup redundant tab_order
        if (isTabOrderRedundant(tabOrder, newSheets.length) && currentMetadata.tab_order) {
            delete currentMetadata.tab_order;
        }

        const newWorkbook = new Workbook({
            ...workbook,
            sheets: newSheets,
            metadata: currentMetadata
        });
        context.updateWorkbook(newWorkbook);
        return generateAndGetRange(context);
    } catch (e) {
        return { error: String(e) };
    }
}

/**
 * Rename a sheet.
 */
export function renameSheet(context: EditorContext, sheetIdx: number, newName: string): UpdateResult {
    return updateWorkbook(context, (wb) => {
        return wb.renameSheet(sheetIdx, newName);
    });
}

/**
 * Update sheet metadata.
 */
export function updateSheetMetadata(
    context: EditorContext,
    sheetIdx: number,
    metadata: Record<string, unknown>
): UpdateResult {
    return applySheetUpdate(context, sheetIdx, (sheet) => {
        return new Sheet({
            ...sheet,
            metadata
        });
    });
}

/**
 * Update doc sheet content.
 */
export function updateDocSheetContent(context: EditorContext, sheetIdx: number, content: string): UpdateResult {
    return applySheetUpdate(context, sheetIdx, (sheet) => {
        // TODO: Remove workaround after updating md-spreadsheet-parser NPM package to 1.2.3+
        // which includes the type and content properties on Sheet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sheetOpts: any = {
            ...sheet,
            type: 'doc',
            content
        };
        return new Sheet(sheetOpts);
    });
}

/**
 * Delete a sheet.
 */
export function deleteSheet(context: EditorContext, sheetIdx: number): UpdateResult {
    return updateWorkbook(context, (wb) => {
        // 1. Delete the sheet
        const newWb = wb.deleteSheet(sheetIdx);

        // 2. Update tab_order metadata
        const metadata = { ...(newWb.metadata || {}) };
        if (metadata.tab_order && Array.isArray(metadata.tab_order)) {
            let tabOrder: TabOrderItem[] = [...metadata.tab_order];

            // Remove deleted sheet entry
            tabOrder = tabOrder.filter((item) => !(item.type === 'sheet' && item.index === sheetIdx));

            // Shift remaining sheet indices
            for (const item of tabOrder) {
                if (item.type === 'sheet' && item.index > sheetIdx) {
                    item.index--;
                }
            }

            metadata.tab_order = tabOrder;
            return new Workbook({ ...newWb, metadata });
        }

        return newWb;
    });
}

/**
 * Move a sheet to a new position.
 */
export function moveSheet(
    context: EditorContext,
    fromIndex: number,
    toIndex: number,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        const newSheets = [...(wb.sheets ?? [])];
        if (fromIndex < 0 || fromIndex >= newSheets.length) {
            throw new Error('Invalid source index');
        }

        const sheet = newSheets.splice(fromIndex, 1)[0];

        // Clamp toIndex to valid insertion points
        const insertIdx = Math.max(0, Math.min(toIndex, newSheets.length));
        newSheets.splice(insertIdx, 0, sheet);

        let updatedWb = new Workbook({
            ...wb,
            sheets: newSheets
        });

        if (targetTabOrderIndex !== null) {
            // Metadata is required - update tab_order
            updatedWb = reorderTabMetadata(updatedWb, 'sheet', fromIndex, insertIdx, targetTabOrderIndex)!;
        } else {
            // Metadata is NOT required - delete tab_order to prevent unwanted metadata in output
            // This is critical for SPECS.md 8.6 S1/S2 sheet swap cases
            const metadata = { ...(updatedWb.metadata || {}) };
            delete metadata.tab_order;
            updatedWb = new Workbook({ ...updatedWb, metadata });
        }

        return updatedWb;
    };

    return updateWorkbook(context, wbTransform);
}
