/**
 * PengSheets Editor API - Main entry point for the TypeScript editor module.
 *
 * This module provides all public functions for spreadsheet editing operations.
 */

import { EditorContext, getEditorContext } from './context';
import type { UpdateResult, TabOrderItem, CellRange } from './types';

// Import services
import * as workbookService from './services/workbook';
import * as sheetService from './services/sheet';
import * as tableService from './services/table';
import * as documentService from './services/document';

// =============================================================================
// Context Access
// =============================================================================

function getContext(): EditorContext {
    return getEditorContext();
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Initialize workbook from markdown text and config.
 */
export function initializeWorkbook(mdText: string, configJson: string): void {
    const context = getContext();
    context.initializeWorkbook(mdText, configJson);
}

/**
 * Get the current state as JSON string.
 */
export function getState(): string {
    const context = getContext();
    return context.getState();
}

/**
 * Create a new spreadsheet with initial columns.
 */
export function createNewSpreadsheet(columnNames: string[] | null = null, sheetName: string = ''): UpdateResult {
    const context = getContext();
    if (!context.workbook) {
        initializeWorkbook('', '{}');
    }
    return sheetService.addSheet(context, sheetName, columnNames);
}

// =============================================================================
// Workbook Functions
// =============================================================================

/**
 * Update tab order in workbook metadata.
 * Pass null to delete tab_order (when metadata is not needed).
 */
export function updateWorkbookTabOrder(tabOrder: TabOrderItem[] | null): UpdateResult {
    return workbookService.updateWorkbookTabOrder(getContext(), tabOrder);
}

/**
 * Update workbook metadata with the provided fields.
 */
export function updateWorkbookMetadata(updates: Record<string, unknown>): UpdateResult {
    return workbookService.updateWorkbookMetadata(getContext(), updates);
}

/**
 * Update the root content of a workbook.
 */
export function updateRootContent(content: string): UpdateResult {
    return workbookService.updateRootContent(getContext(), content);
}

/**
 * Delete the root content of a workbook.
 */
export function deleteRootContent(): UpdateResult {
    return workbookService.deleteRootContent(getContext());
}

/**
 * Rename a workbook.
 */
export function renameWorkbook(newName: string): UpdateResult {
    return workbookService.renameWorkbook(getContext(), newName);
}

// =============================================================================
// Sheet Functions
// =============================================================================

/**
 * Add a new sheet.
 */
export function addSheet(
    newName: string,
    columnNames: string[] | null = null,
    tableName: string | null = null,
    afterSheetIndex: number | null = null,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    return sheetService.addSheet(getContext(), newName, columnNames, tableName, afterSheetIndex, targetTabOrderIndex);
}

/**
 * Add a new doc sheet (document-type sheet within workbook).
 */
export function addDocSheet(
    newName: string,
    content: string = '',
    afterSheetIndex: number | null = null,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    return sheetService.addDocSheet(getContext(), newName, content, afterSheetIndex, targetTabOrderIndex);
}

/**
 * Rename a sheet.
 */
export function renameSheet(sheetIdx: number, newName: string): UpdateResult {
    return sheetService.renameSheet(getContext(), sheetIdx, newName);
}

/**
 * Delete a sheet.
 */
export function deleteSheet(sheetIdx: number): UpdateResult {
    return sheetService.deleteSheet(getContext(), sheetIdx);
}

/**
 * Move a sheet.
 */
export function moveSheet(fromIndex: number, toIndex: number, targetTabOrderIndex: number | null = null): UpdateResult {
    return sheetService.moveSheet(getContext(), fromIndex, toIndex, targetTabOrderIndex);
}

/**
 * Update sheet metadata.
 */
export function updateSheetMetadata(sheetIdx: number, metadata: Record<string, unknown>): UpdateResult {
    return sheetService.updateSheetMetadata(getContext(), sheetIdx, metadata);
}

/**
 * Update sheet name.
 */
export function updateSheetName(sheetIdx: number, newName: string): UpdateResult {
    return sheetService.renameSheet(getContext(), sheetIdx, newName);
}

/**
 * Update doc sheet content.
 */
export function updateDocSheetContent(sheetIdx: number, content: string): UpdateResult {
    return sheetService.updateDocSheetContent(getContext(), sheetIdx, content);
}

// =============================================================================
// Table Functions
// =============================================================================

/**
 * Add a new table.
 */
export function addTable(
    sheetIdx: number,
    columnNames: string[] | null = null,
    tableName: string | null = null
): UpdateResult {
    return tableService.addTable(getContext(), sheetIdx, columnNames, tableName);
}

/**
 * Delete a table.
 */
export function deleteTable(sheetIdx: number, tableIdx: number): UpdateResult {
    return tableService.deleteTable(getContext(), sheetIdx, tableIdx);
}

/**
 * Rename a table.
 */
export function renameTable(sheetIdx: number, tableIdx: number, newName: string): UpdateResult {
    return tableService.renameTable(getContext(), sheetIdx, tableIdx, newName);
}

/**
 * Update table metadata.
 */
export function updateTableMetadata(
    sheetIdx: number,
    tableIdx: number,
    newName: string,
    newDescription: string
): UpdateResult {
    return tableService.updateTableMetadata(getContext(), sheetIdx, tableIdx, newName, newDescription);
}

/**
 * Update visual metadata.
 */
export function updateVisualMetadata(
    sheetIdx: number,
    tableIdx: number,
    metadata: Record<string, unknown>
): UpdateResult {
    return tableService.updateVisualMetadata(getContext(), sheetIdx, tableIdx, metadata);
}

// =============================================================================
// Cell Functions
// =============================================================================

/**
 * Update a cell value.
 */
export function updateCell(
    sheetIdx: number,
    tableIdx: number,
    rowIdx: number,
    colIdx: number,
    value: string
): UpdateResult {
    return tableService.updateCell(getContext(), sheetIdx, tableIdx, rowIdx, colIdx, value);
}

// =============================================================================
// Row Functions
// =============================================================================

/**
 * Insert a row.
 */
export function insertRow(sheetIdx: number, tableIdx: number, rowIdx: number): UpdateResult {
    return tableService.insertRow(getContext(), sheetIdx, tableIdx, rowIdx);
}

/**
 * Delete rows.
 */
export function deleteRows(sheetIdx: number, tableIdx: number, rowIndices: number[]): UpdateResult {
    return tableService.deleteRows(getContext(), sheetIdx, tableIdx, rowIndices);
}

/**
 * Delete a single row (wrapper for deleteRows).
 */
export function deleteRow(sheetIdx: number, tableIdx: number, rowIdx: number): UpdateResult {
    return deleteRows(sheetIdx, tableIdx, [rowIdx]);
}

/**
 * Move rows.
 */
export function moveRows(sheetIdx: number, tableIdx: number, rowIndices: number[], targetIndex: number): UpdateResult {
    return tableService.moveRows(getContext(), sheetIdx, tableIdx, rowIndices, targetIndex);
}

/**
 * Sort rows by column.
 */
export function sortRows(sheetIdx: number, tableIdx: number, colIdx: number, ascending: boolean): UpdateResult {
    return tableService.sortRows(getContext(), sheetIdx, tableIdx, colIdx, ascending);
}

// =============================================================================
// Column Functions
// =============================================================================

/**
 * Insert a column.
 */
export function insertColumn(
    sheetIdx: number,
    tableIdx: number,
    colIdx: number,
    columnName = 'New Column'
): UpdateResult {
    return tableService.insertColumn(getContext(), sheetIdx, tableIdx, colIdx, columnName);
}

/**
 * Delete columns.
 */
export function deleteColumns(sheetIdx: number, tableIdx: number, colIndices: number[]): UpdateResult {
    return tableService.deleteColumns(getContext(), sheetIdx, tableIdx, colIndices);
}

/**
 * Delete a single column (wrapper for deleteColumns).
 */
export function deleteColumn(sheetIdx: number, tableIdx: number, colIdx: number): UpdateResult {
    return deleteColumns(sheetIdx, tableIdx, [colIdx]);
}

/**
 * Move columns.
 */
export function moveColumns(
    sheetIdx: number,
    tableIdx: number,
    colIndices: number[],
    targetIndex: number
): UpdateResult {
    return tableService.moveColumns(getContext(), sheetIdx, tableIdx, colIndices, targetIndex);
}

/**
 * Clear columns.
 */
export function clearColumns(sheetIdx: number, tableIdx: number, colIndices: number[]): UpdateResult {
    return tableService.clearColumns(getContext(), sheetIdx, tableIdx, colIndices);
}

/**
 * Clear a single column (wrapper for clearColumns).
 */
export function clearColumn(sheetIdx: number, tableIdx: number, colIdx: number): UpdateResult {
    return clearColumns(sheetIdx, tableIdx, [colIdx]);
}

/**
 * Update column width.
 */
export function updateColumnWidth(sheetIdx: number, tableIdx: number, colIdx: number, width: number): UpdateResult {
    return tableService.updateColumnWidth(getContext(), sheetIdx, tableIdx, colIdx, width);
}

/**
 * Update column format.
 */
export function updateColumnFormat(sheetIdx: number, tableIdx: number, colIdx: number, fmt: unknown): UpdateResult {
    return tableService.updateColumnFormat(getContext(), sheetIdx, tableIdx, colIdx, fmt);
}

/**
 * Update column alignment.
 */
export function updateColumnAlign(
    sheetIdx: number,
    tableIdx: number,
    colIdx: number,
    align: 'left' | 'center' | 'right'
): UpdateResult {
    return tableService.updateColumnAlign(getContext(), sheetIdx, tableIdx, colIdx, align);
}

/**
 * Update column filter.
 */
export function updateColumnFilter(
    sheetIdx: number,
    tableIdx: number,
    colIdx: number,
    hiddenValues: string[]
): UpdateResult {
    return tableService.updateColumnFilter(getContext(), sheetIdx, tableIdx, colIdx, hiddenValues);
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Paste cells.
 */
export function pasteCells(
    sheetIdx: number,
    tableIdx: number,
    startRow: number,
    startCol: number,
    newData: string[][],
    includeHeaders = false
): UpdateResult {
    return tableService.pasteCells(getContext(), sheetIdx, tableIdx, startRow, startCol, newData, includeHeaders);
}

/**
 * Move cells.
 */
export function moveCells(
    sheetIdx: number,
    tableIdx: number,
    srcRange: CellRange,
    destRow: number,
    destCol: number
): UpdateResult {
    return tableService.moveCells(getContext(), sheetIdx, tableIdx, srcRange, destRow, destCol);
}

// =============================================================================
// Document Functions
// =============================================================================

/**
 * Get document section range.
 */
export function getDocumentSectionRange(
    sectionIndex: number
): { startLine: number; endLine: number } | { error: string } {
    return documentService.getDocumentSectionRange(getContext(), sectionIndex);
}

/**
 * Add a document section.
 */
export function addDocument(
    title: string,
    afterDocIndex = -1,
    afterWorkbook = false,
    insertAfterTabOrderIndex = -1
): UpdateResult {
    return documentService.addDocument(getContext(), title, afterDocIndex, afterWorkbook, insertAfterTabOrderIndex);
}

/**
 * Add document and get full update.
 */
export function addDocumentAndGetFullUpdate(
    title: string,
    afterDocIndex = -1,
    afterWorkbook = false,
    insertAfterTabOrderIndex = -1
): UpdateResult {
    return documentService.addDocumentAndGetFullUpdate(
        getContext(),
        title,
        afterDocIndex,
        afterWorkbook,
        insertAfterTabOrderIndex
    );
}

/**
 * Rename a document section.
 */
export function renameDocument(docIndex: number, newTitle: string): UpdateResult {
    return documentService.renameDocument(getContext(), docIndex, newTitle);
}

/**
 * Update document section content (title and body).
 */
export function updateDocumentContent(docIndex: number, title: string, content: string): UpdateResult {
    return documentService.updateDocumentContent(getContext(), docIndex, title, content);
}

/**
 * Delete a document section.
 */
export function deleteDocument(docIndex: number): UpdateResult {
    return documentService.deleteDocument(getContext(), docIndex);
}

/**
 * Delete document and get full update.
 */
export function deleteDocumentAndGetFullUpdate(docIndex: number): UpdateResult {
    return documentService.deleteDocumentAndGetFullUpdate(getContext(), docIndex);
}

/**
 * Move document section (physical move only).
 * Does NOT update metadata - caller must handle metadata if needed per SPECS.md 8.6.
 */
export function moveDocumentSection(
    fromDocIndex: number,
    toDocIndex: number | null = null,
    toAfterWorkbook = false,
    toBeforeWorkbook = false
): UpdateResult {
    return documentService.moveDocumentSection(
        getContext(),
        fromDocIndex,
        toDocIndex,
        toAfterWorkbook,
        toBeforeWorkbook
    );
}

/**
 * Move workbook section.
 */
export function moveWorkbookSection(
    toDocIndex: number | null = null,
    toAfterDoc = false,
    toBeforeDoc = false,
    targetTabOrderIndex: number | null = null
): UpdateResult {
    return documentService.moveWorkbookSection(getContext(), toDocIndex, toAfterDoc, toBeforeDoc, targetTabOrderIndex);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the full markdown content.
 */
export function getFullMarkdown(): string {
    const context = getContext();
    if (!context.workbook || !context.schema) {
        return context.mdText;
    }
    return context.workbook.toMarkdown(context.schema);
}

/**
 * Generate and get range for workbook section.
 */
export function generateAndGetRange(): UpdateResult {
    return workbookService.generateAndGetRange(getContext());
}

/**
 * Get workbook range in markdown.
 */
export function getWorkbookRange(mdText: string, rootMarker: string, sheetHeaderLevel: number): [number, number] {
    return workbookService.getWorkbookRange(mdText, rootMarker, sheetHeaderLevel);
}

// =============================================================================
// Context Reset (for testing)
// =============================================================================

/**
 * Reset the editor context (for testing purposes).
 */
export function resetContext(): void {
    getContext().reset();
}
