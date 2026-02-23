import { ReactiveController, ReactiveControllerHost } from 'lit';
import { SpreadsheetService } from '../services/spreadsheet-service';
import { ClipboardStore } from '../stores/clipboard-store';
import {
    ICellEditDetail,
    IRangeEditDetail,
    IRowOperationDetail,
    IColumnOperationDetail,
    IColumnOperationsDetail, // Added this
    IColumnResizeDetail,
    IMetadataEditDetail,
    IMetadataUpdateDetail,
    IRequestAddTableDetail,
    IRequestRenameTableDetail,
    IRequestDeleteTableDetail,
    IVisualMetadataUpdateDetail,
    ISheetMetadataUpdateDetail,
    IPasteCellsDetail,
    IValidationUpdateDetail,
    IFormulaUpdateDetail,
    IMoveRowsDetail,
    IMoveColumnsDetail,
    IMoveCellsDetail,
    PostMessageCommand
} from '../types';

/**
 * Host interface for GlobalEventController
 * Defines the methods and properties that the host component must provide
 */
export interface GlobalEventHost extends ReactiveControllerHost {
    readonly spreadsheetService: SpreadsheetService;
    markdownInput: string;
    config: Record<string, unknown>;

    // Handler methods that must be provided by the host
    _handleRangeEdit(
        sheetIndex: number,
        tableIndex: number,
        startRow: number,
        endRow: number,
        startCol: number,
        endCol: number,
        newValue: string
    ): void;
    _handleDeleteRow(sheetIndex: number, tableIndex: number, rowIndex: number): void;
    _handleDeleteRows(sheetIndex: number, tableIndex: number, rowIndices: number[]): void;
    _handleInsertRow(sheetIndex: number, tableIndex: number, rowIndex: number): void;
    _handleDeleteColumn(sheetIndex: number, tableIndex: number, colIndex: number): void;
    _handleDeleteColumns(sheetIndex: number, tableIndex: number, colIndices: number[]): void;
    _handleInsertColumn(sheetIndex: number, tableIndex: number, colIndex: number): void;
    _handleClearColumn(sheetIndex: number, tableIndex: number, colIndex: number): void;
    _handleClearColumns(sheetIndex: number, tableIndex: number, colIndices: number[]): void;
    _handleColumnResize(detail: IColumnResizeDetail): void;
    _handleMetadataEdit(detail: IMetadataEditDetail): void;
    _handleMetadataUpdate(detail: IMetadataUpdateDetail): void;
    _handleRequestAddTable(detail: IRequestAddTableDetail): void;
    _handleRequestRenameTable(detail: IRequestRenameTableDetail): void;
    _handleRequestDeleteTable(detail: IRequestDeleteTableDetail): void;
    _handleVisualMetadataUpdate(detail: IVisualMetadataUpdateDetail): void;
    _handleSheetMetadataUpdate(detail: ISheetMetadataUpdateDetail): void;
    _handlePasteCells(detail: IPasteCellsDetail): void;
    _handlePostMessage(detail: PostMessageCommand): void;
    _handleDocumentChange(detail: { sectionIndex: number; content: string; title?: string; save?: boolean }): void;
    _handleDocSheetChange(detail: { sheetIndex: number; content: string; title?: string; save?: boolean }): void;
    _handleSave(): void;
    _handleValidationUpdate(detail: IValidationUpdateDetail): void;
    _handleFormulaUpdate(detail: IFormulaUpdateDetail): void;
    _handleMoveRows(detail: IMoveRowsDetail): void;
    _handleMoveColumns(detail: IMoveColumnsDetail): void;
    _handleMoveCells(detail: IMoveCellsDetail): void;
    _handleInsertRowsAt(detail: {
        sheetIndex: number;
        tableIndex: number;
        targetRow: number;
        rowsData: string[][];
    }): void;
    _handleInsertColumnsAt(detail: {
        sheetIndex: number;
        tableIndex: number;
        targetCol: number;
        columnsData: string[][];
    }): void;
    _parseWorkbook(): Promise<void>;
}

/**
 * GlobalEventController - Manages window-level event listeners
 *
 * This controller consolidates all global event listeners from main.ts,
 * providing proper lifecycle management through hostConnected/hostDisconnected.
 */
export class GlobalEventController implements ReactiveController {
    private host: GlobalEventHost;

    // Bound handlers for proper cleanup
    private _boundKeyDown: (e: KeyboardEvent) => void;
    private _boundCellEdit: (e: Event) => void;
    private _boundRangeEdit: (e: Event) => void;
    private _boundRowDelete: (e: Event) => void;
    private _boundRowsDelete: (e: Event) => void;
    private _boundRowInsert: (e: Event) => void;
    private _boundColumnDelete: (e: Event) => void;
    private _boundColumnInsert: (e: Event) => void;
    private _boundColumnClear: (e: Event) => void;
    private _boundColumnResize: (e: Event) => void;
    private _boundMetadataEdit: (e: Event) => void;
    private _boundMetadataUpdate: (e: Event) => void;
    private _boundRequestAddTable: (e: Event) => void;
    private _boundRequestRenameTable: (e: Event) => void;
    private _boundRequestDeleteTable: (e: Event) => void;
    private _boundMetadataChange: (e: Event) => void;
    private _boundSheetMetadataUpdate: (e: Event) => void;
    private _boundSheetMetadataDeferred: (e: Event) => void;
    private _boundPasteCells: (e: Event) => void;
    private _boundPostMessage: (e: Event) => void;
    private _boundDocumentChange: (e: Event) => void;
    private _boundDocSheetChange: (e: Event) => void;
    private _boundValidationUpdate: (e: Event) => void;
    private _boundMoveRows: (e: Event) => void;
    private _boundMoveColumns: (e: Event) => void;
    private _boundMoveCells: (e: Event) => void;
    private _boundInsertRowsAt: (e: Event) => void;
    private _boundInsertColumnsAt: (e: Event) => void;
    private _boundFormulaUpdate: (e: Event) => void;
    private _boundMessage: (e: MessageEvent) => void;
    private _boundRequestSkipParse: () => void;

    constructor(host: GlobalEventHost) {
        this.host = host;
        host.addController(this);

        // Bind all handlers
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundCellEdit = this._handleCellEdit.bind(this);
        this._boundRangeEdit = this._handleRangeEdit.bind(this);
        this._boundRowDelete = this._handleRowDelete.bind(this);
        this._boundRowsDelete = this._handleRowsDelete.bind(this);
        this._boundRowInsert = this._handleRowInsert.bind(this);
        this._boundColumnDelete = this._handleColumnDelete.bind(this);
        this._boundColumnInsert = this._handleColumnInsert.bind(this);
        this._boundColumnClear = this._handleColumnClear.bind(this);
        this._boundColumnResize = this._handleColumnResize.bind(this);
        this._boundMetadataEdit = this._handleMetadataEdit.bind(this);
        this._boundMetadataUpdate = this._handleMetadataUpdate.bind(this);
        this._boundRequestAddTable = this._handleRequestAddTable.bind(this);
        this._boundRequestRenameTable = this._handleRequestRenameTable.bind(this);
        this._boundRequestDeleteTable = this._handleRequestDeleteTable.bind(this);
        this._boundMetadataChange = this._handleMetadataChange.bind(this);
        this._boundSheetMetadataUpdate = this._handleSheetMetadataUpdate.bind(this);
        this._boundSheetMetadataDeferred = this._handleSheetMetadataDeferred.bind(this);
        this._boundPasteCells = this._handlePasteCells.bind(this);
        this._boundPostMessage = this._handlePostMessage.bind(this);
        this._boundDocumentChange = this._handleDocumentChange.bind(this);
        this._boundDocSheetChange = this._handleDocSheetChange.bind(this);
        this._boundValidationUpdate = this._handleValidationUpdate.bind(this);
        this._boundMoveRows = this._handleMoveRows.bind(this);
        this._boundMoveColumns = this._handleMoveColumns.bind(this);
        this._boundMoveCells = this._handleMoveCells.bind(this);
        this._boundInsertRowsAt = this._handleInsertRowsAt.bind(this);
        this._boundInsertColumnsAt = this._handleInsertColumnsAt.bind(this);
        this._boundFormulaUpdate = this._handleFormulaUpdate.bind(this);
        this._boundMessage = this._handleMessage.bind(this);
        this._boundRequestSkipParse = this._handleRequestSkipParse.bind(this);
    }

    hostConnected(): void {
        // Global keyboard shortcuts (capture phase)
        window.addEventListener('keydown', this._boundKeyDown, true);

        // Cell/Range editing events
        window.addEventListener('cell-edit', this._boundCellEdit);
        window.addEventListener('range-edit', this._boundRangeEdit);

        // Row operations
        window.addEventListener('row-delete', this._boundRowDelete);
        window.addEventListener('rows-delete', this._boundRowsDelete);
        window.addEventListener('row-insert', this._boundRowInsert);

        // Column operations
        window.addEventListener('column-delete', this._boundColumnDelete);
        window.addEventListener('columns-delete', this._boundColumnsDelete);
        window.addEventListener('column-insert', this._boundColumnInsert);
        window.addEventListener('column-clear', this._boundColumnClear);
        window.addEventListener('columns-clear', this._boundColumnsClear);
        window.addEventListener('column-resize', this._boundColumnResize);

        // Metadata events
        window.addEventListener('metadata-edit', this._boundMetadataEdit);
        window.addEventListener('metadata-update', this._boundMetadataUpdate);
        window.addEventListener('metadata-change', this._boundMetadataChange);
        window.addEventListener('sheet-metadata-update', this._boundSheetMetadataUpdate);
        window.addEventListener('sheet-metadata-deferred', this._boundSheetMetadataDeferred);

        // Table operations
        window.addEventListener('request-add-table', this._boundRequestAddTable);
        window.addEventListener('request-rename-table', this._boundRequestRenameTable);
        window.addEventListener('request-delete-table', this._boundRequestDeleteTable);

        // Other operations
        window.addEventListener('paste-cells', this._boundPasteCells);
        window.addEventListener('post-message', this._boundPostMessage);
        window.addEventListener('document-change', this._boundDocumentChange);
        window.addEventListener('doc-sheet-change', this._boundDocSheetChange);
        window.addEventListener('validation-update', this._boundValidationUpdate);
        window.addEventListener('formula-update', this._boundFormulaUpdate);

        // Move operations (drag-and-drop)
        window.addEventListener('move-rows', this._boundMoveRows);
        window.addEventListener('move-columns', this._boundMoveColumns);
        window.addEventListener('move-cells', this._boundMoveCells);

        // Insert copied rows/columns operations
        window.addEventListener('rows-insert-at', this._boundInsertRowsAt);
        window.addEventListener('columns-insert-at', this._boundInsertColumnsAt);

        // VS Code extension messages
        window.addEventListener('message', this._boundMessage);

        // Skip parse request (for flicker prevention in specific operations)
        window.addEventListener('request-skip-parse', this._boundRequestSkipParse);
    }

    hostDisconnected(): void {
        // Remove all listeners to prevent memory leaks
        window.removeEventListener('keydown', this._boundKeyDown, true);
        window.removeEventListener('cell-edit', this._boundCellEdit);
        window.removeEventListener('range-edit', this._boundRangeEdit);
        window.removeEventListener('row-delete', this._boundRowDelete);
        window.removeEventListener('rows-delete', this._boundRowsDelete);
        window.removeEventListener('row-insert', this._boundRowInsert);
        window.removeEventListener('column-delete', this._boundColumnDelete);
        window.removeEventListener('column-insert', this._boundColumnInsert);
        window.removeEventListener('column-clear', this._boundColumnClear);
        window.removeEventListener('columns-clear', this._boundColumnsClear);
        window.removeEventListener('column-resize', this._boundColumnResize);
        window.removeEventListener('metadata-edit', this._boundMetadataEdit);
        window.removeEventListener('metadata-update', this._boundMetadataUpdate);
        window.removeEventListener('metadata-change', this._boundMetadataChange);
        window.removeEventListener('sheet-metadata-update', this._boundSheetMetadataUpdate);
        window.removeEventListener('sheet-metadata-deferred', this._boundSheetMetadataDeferred);
        window.removeEventListener('request-add-table', this._boundRequestAddTable);
        window.removeEventListener('request-rename-table', this._boundRequestRenameTable);
        window.removeEventListener('request-delete-table', this._boundRequestDeleteTable);
        window.removeEventListener('paste-cells', this._boundPasteCells);
        window.removeEventListener('post-message', this._boundPostMessage);
        window.removeEventListener('document-change', this._boundDocumentChange);
        window.removeEventListener('doc-sheet-change', this._boundDocSheetChange);
        window.removeEventListener('validation-update', this._boundValidationUpdate);
        window.removeEventListener('formula-update', this._boundFormulaUpdate);
        window.removeEventListener('move-rows', this._boundMoveRows);
        window.removeEventListener('move-columns', this._boundMoveColumns);
        window.removeEventListener('move-cells', this._boundMoveCells);
        window.removeEventListener('rows-insert-at', this._boundInsertRowsAt);
        window.removeEventListener('columns-insert-at', this._boundInsertColumnsAt);
        window.removeEventListener('message', this._boundMessage);
        window.removeEventListener('request-skip-parse', this._boundRequestSkipParse);
    }

    // Event handlers delegate to host methods

    private _handleKeyDown(e: KeyboardEvent): void {
        const isModifier = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        if (isModifier && key === 's') {
            e.preventDefault();
            this.host._handleSave();
        }

        // Clear clipboard indicator on Undo (Cmd/Ctrl+Z) or Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)
        if (isModifier && (key === 'z' || key === 'y')) {
            ClipboardStore.clear();
        }
    }

    private _handleCellEdit(e: Event): void {
        const detail = (e as CustomEvent<ICellEditDetail>).detail;
        this.host._handleRangeEdit(
            detail.sheetIndex,
            detail.tableIndex,
            detail.rowIndex,
            detail.rowIndex,
            detail.colIndex,
            detail.colIndex,
            detail.newValue
        );
    }

    private _handleRangeEdit(e: Event): void {
        const detail = (e as CustomEvent<IRangeEditDetail>).detail;
        this.host._handleRangeEdit(
            detail.sheetIndex,
            detail.tableIndex,
            detail.startRow,
            detail.endRow,
            detail.startCol,
            detail.endCol,
            detail.newValue
        );
    }

    private _handleRowDelete(e: Event): void {
        const detail = (e as CustomEvent<IRowOperationDetail>).detail;
        this.host._handleDeleteRow(detail.sheetIndex, detail.tableIndex, detail.rowIndex);
        ClipboardStore.adjustForRowDelete(detail.sheetIndex, detail.tableIndex, detail.rowIndex, 1);
    }

    private _handleRowsDelete(e: Event): void {
        const detail = (e as CustomEvent<{ sheetIndex: number; tableIndex: number; rowIndices: number[] }>).detail;
        this.host._handleDeleteRows(detail.sheetIndex, detail.tableIndex, detail.rowIndices);
        // For multiple row deletion, use the first row index and count
        if (detail.rowIndices.length > 0) {
            const minRow = Math.min(...detail.rowIndices);
            ClipboardStore.adjustForRowDelete(detail.sheetIndex, detail.tableIndex, minRow, detail.rowIndices.length);
        }
    }

    private _handleRowInsert(e: Event): void {
        const detail = (e as CustomEvent<IRowOperationDetail>).detail;
        this.host._handleInsertRow(detail.sheetIndex, detail.tableIndex, detail.rowIndex);
        ClipboardStore.adjustForRowInsert(detail.sheetIndex, detail.tableIndex, detail.rowIndex, 1);
    }

    private _handleColumnDelete(e: Event): void {
        const detail = (e as CustomEvent<IColumnOperationDetail>).detail;
        this.host._handleDeleteColumn(detail.sheetIndex, detail.tableIndex, detail.colIndex);
        ClipboardStore.adjustForColumnDelete(detail.sheetIndex, detail.tableIndex, detail.colIndex, 1);
    }

    private _boundColumnsDelete = (e: Event) => {
        const detail = (e as CustomEvent<IColumnOperationsDetail>).detail;
        this.host._handleDeleteColumns(detail.sheetIndex, detail.tableIndex, detail.colIndices);
        // For multiple column deletion, use the first column index and count
        if (detail.colIndices.length > 0) {
            const minCol = Math.min(...detail.colIndices);
            ClipboardStore.adjustForColumnDelete(
                detail.sheetIndex,
                detail.tableIndex,
                minCol,
                detail.colIndices.length
            );
        }
    };

    private _handleColumnInsert(e: Event): void {
        const detail = (e as CustomEvent<IColumnOperationDetail>).detail;
        this.host._handleInsertColumn(detail.sheetIndex, detail.tableIndex, detail.colIndex);
        ClipboardStore.adjustForColumnInsert(detail.sheetIndex, detail.tableIndex, detail.colIndex, 1);
    }

    private _handleColumnClear(e: Event): void {
        const detail = (e as CustomEvent<IColumnOperationDetail>).detail;
        this.host._handleClearColumn(detail.sheetIndex, detail.tableIndex, detail.colIndex);
    }

    private _boundColumnsClear = (e: Event) => {
        const detail = (e as CustomEvent<IColumnOperationsDetail>).detail;
        this.host._handleClearColumns(detail.sheetIndex, detail.tableIndex, detail.colIndices);
    };

    private _handleColumnResize(e: Event): void {
        this.host._handleColumnResize((e as CustomEvent<IColumnResizeDetail>).detail);
    }

    private _handleMetadataEdit(e: Event): void {
        this.host._handleMetadataEdit((e as CustomEvent<IMetadataEditDetail>).detail);
    }

    private _handleMetadataUpdate(e: Event): void {
        this.host._handleMetadataUpdate((e as CustomEvent<IMetadataUpdateDetail>).detail);
    }

    private _handleRequestAddTable(e: Event): void {
        this.host._handleRequestAddTable((e as CustomEvent<IRequestAddTableDetail>).detail);
    }

    private _handleRequestRenameTable(e: Event): void {
        this.host._handleRequestRenameTable((e as CustomEvent<IRequestRenameTableDetail>).detail);
    }

    private _handleRequestDeleteTable(e: Event): void {
        this.host._handleRequestDeleteTable((e as CustomEvent<IRequestDeleteTableDetail>).detail);
    }

    private _handleMetadataChange(e: Event): void {
        this.host._handleVisualMetadataUpdate((e as CustomEvent<IVisualMetadataUpdateDetail>).detail);
    }

    private _handleSheetMetadataUpdate(e: Event): void {
        this.host._handleSheetMetadataUpdate((e as CustomEvent<ISheetMetadataUpdateDetail>).detail);
    }

    private _handleSheetMetadataDeferred(e: Event): void {
        // Queue deferred update to be applied with next actual file edit
        const detail = (e as CustomEvent<ISheetMetadataUpdateDetail>).detail;
        this.host.spreadsheetService.queueDeferredMetadataUpdate(detail.sheetIndex, detail.metadata);
    }

    private _handlePasteCells(e: Event): void {
        this.host._handlePasteCells((e as CustomEvent<IPasteCellsDetail>).detail);
    }

    private _handlePostMessage(e: Event): void {
        this.host._handlePostMessage((e as CustomEvent<PostMessageCommand>).detail);
    }

    private _handleDocumentChange(e: Event): void {
        this.host._handleDocumentChange(
            (
                e as CustomEvent<{
                    sectionIndex: number;
                    content: string;
                    title?: string;
                    save?: boolean;
                }>
            ).detail
        );
    }

    private _handleDocSheetChange(e: Event): void {
        this.host._handleDocSheetChange(
            (
                e as CustomEvent<{
                    sheetIndex: number;
                    content: string;
                    title?: string;
                    save?: boolean;
                }>
            ).detail
        );
    }

    private _handleValidationUpdate(e: Event): void {
        this.host._handleValidationUpdate((e as CustomEvent<IValidationUpdateDetail>).detail);
    }

    private _handleFormulaUpdate(e: Event): void {
        this.host._handleFormulaUpdate((e as CustomEvent<IFormulaUpdateDetail>).detail);
    }

    private _handleMoveRows(e: Event): void {
        this.host._handleMoveRows((e as CustomEvent<IMoveRowsDetail>).detail);
    }

    private _handleMoveColumns(e: Event): void {
        this.host._handleMoveColumns((e as CustomEvent<IMoveColumnsDetail>).detail);
    }

    private _handleMoveCells(e: Event): void {
        this.host._handleMoveCells((e as CustomEvent<IMoveCellsDetail>).detail);
    }

    private _handleInsertRowsAt(e: Event): void {
        const detail = (
            e as CustomEvent<{ sheetIndex: number; tableIndex: number; targetRow: number; rowsData: string[][] }>
        ).detail;
        this.host._handleInsertRowsAt(detail);
        ClipboardStore.adjustForRowInsert(
            detail.sheetIndex,
            detail.tableIndex,
            detail.targetRow,
            detail.rowsData.length
        );
    }

    private _handleInsertColumnsAt(e: Event): void {
        const detail = (
            e as CustomEvent<{ sheetIndex: number; tableIndex: number; targetCol: number; columnsData: string[][] }>
        ).detail;
        this.host._handleInsertColumnsAt(detail);
        ClipboardStore.adjustForColumnInsert(
            detail.sheetIndex,
            detail.tableIndex,
            detail.targetCol,
            detail.columnsData.length
        );
    }

    private async _handleMessage(event: MessageEvent): Promise<void> {
        const message = event.data;
        switch (message.type) {
            case 'update':
                // Store the markdown content - this is safe even before service is initialized
                this.host.markdownInput = message.content;
                // Only parse if service is initialized, otherwise content will be parsed in firstUpdated
                if (this.host.spreadsheetService.isInitialized) {
                    // Skip re-parse if this is a response to our own change (isSyncing)
                    // The optimistic update already reflects the correct state
                    if (this.host.spreadsheetService.isSyncing) {
                        this.host.spreadsheetService.notifyUpdateReceived();
                    } else {
                        await this.host._parseWorkbook();
                        this.host.spreadsheetService.notifyUpdateReceived();
                    }
                }
                break;
            case 'configUpdate':
                this.host.config = message.config;
                // Only parse if service is initialized
                if (this.host.spreadsheetService.isInitialized) {
                    await this.host._parseWorkbook();
                }
                break;
            case 'sync-failed':
                console.warn('Sync failed, resetting queue state.');
                this.host.spreadsheetService.notifyUpdateReceived();
                break;
            case 'insertValue':
                // Insert value at current selection (used for date/time shortcuts from extension)
                window.dispatchEvent(
                    new CustomEvent('insert-value-at-selection', {
                        detail: { value: message.value }
                    })
                );
                break;
            case 'insertCopiedCells':
                // Trigger insert copied cells action (used for Ctrl+Shift+= shortcut from extension)
                window.dispatchEvent(new CustomEvent('insert-copied-cells-at-selection'));
                break;
        }
    }

    /**
     * Handle request to skip next parse (for flicker prevention).
     * This is triggered by specific operations like Delete key in selection mode.
     */
    private _handleRequestSkipParse(): void {
        this.host.spreadsheetService.setSkipNextParse(true);
    }
}
