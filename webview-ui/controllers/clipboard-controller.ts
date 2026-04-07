import { ReactiveController, ReactiveControllerHost } from 'lit';
import { SelectionController } from './selection-controller';
import { ClipboardStore } from '../stores/clipboard-store';
import { uploadImageAndGetUrl } from '../utils/spreadsheet-helpers';

interface TableData {
    headers: string[] | null;
    rows: string[][];
}

import { EditController } from './edit-controller';

interface ClipboardHost extends ReactiveControllerHost {
    table: TableData | null;
    sheetIndex: number;
    tableIndex: number;
    selectionCtrl: SelectionController;
    editCtrl: EditController;
    dispatchEvent(event: Event): boolean;
    requestUpdate(): void;
}

/**
 * ClipboardController - Manages clipboard operations (copy, paste, delete).
 *
 * Handles:
 * - Copy selected cells to clipboard as TSV
 * - Paste TSV data from clipboard
 * - Delete/clear selected cells
 * - TSV parsing with RFC 4180 support
 */
export class ClipboardController implements ReactiveController {
    host: ClipboardHost;

    constructor(host: ClipboardHost) {
        this.host = host;
        host.addController(this);
    }

    hostConnected() {}
    hostDisconnected() {}

    // Getters to access shared store
    get copiedRange() {
        return ClipboardStore.copiedRange;
    }

    get copiedData() {
        return ClipboardStore.copiedData;
    }

    get copyType() {
        return ClipboardStore.copyType;
    }

    /**
     * Clear the copied range indicator and data (only if this table owns it)
     */
    clearCopiedRange() {
        if (ClipboardStore.isFromTable(this.host.sheetIndex, this.host.tableIndex)) {
            ClipboardStore.clear();
            this.host.requestUpdate();
        }
    }

    /**
     * Save the current selection as the copied range for visual indicator
     */
    private _saveCopiedRange() {
        const { table, selectionCtrl } = this.host;
        if (!table) return;

        const numCols = table?.headers?.length || 0;
        const numRows = table.rows.length;

        const anchorRow = selectionCtrl.selectionAnchorRow;
        const anchorCol = selectionCtrl.selectionAnchorCol;
        const selRow = selectionCtrl.selectedRow;
        const selCol = selectionCtrl.selectedCol;

        let minR = -1,
            maxR = -1,
            minC = -1,
            maxC = -1;

        // Full table selection (corner click)
        if (selRow === -2 && selCol === -2) {
            minR = 0;
            maxR = numRows - 1;
            minC = 0;
            maxC = numCols - 1;
        } else if (selCol === -2 && selRow >= 0) {
            // Row selection
            if (anchorRow >= 0) {
                minR = Math.min(anchorRow, selRow);
                maxR = Math.max(anchorRow, selRow);
            } else {
                minR = maxR = selRow;
            }
            minC = 0;
            maxC = numCols - 1;
        } else if (selRow === -2 && selCol >= 0) {
            // Column selection
            if (anchorCol >= 0) {
                minC = Math.min(anchorCol, selCol);
                maxC = Math.max(anchorCol, selCol);
            } else {
                minC = maxC = selCol;
            }
            minR = 0;
            maxR = numRows - 1;
        } else if (selRow >= 0 && selCol >= 0) {
            // Cell or cell range selection
            if (anchorRow >= 0 && anchorCol >= 0) {
                minR = Math.min(anchorRow, selRow);
                maxR = Math.max(anchorRow, selRow);
                minC = Math.min(anchorCol, selCol);
                maxC = Math.max(anchorCol, selCol);
            } else {
                // Single cell (no anchor set)
                minR = maxR = selRow;
                minC = maxC = selCol;
            }
        }

        if (minR >= 0 && minC >= 0) {
            // Determine copy type based on selection
            const { selectionCtrl } = this.host;
            let copyType: 'cells' | 'rows' | 'columns';
            if (selectionCtrl.selectedCol === -2 && selectionCtrl.selectedRow >= 0) {
                copyType = 'rows';
            } else if (selectionCtrl.selectedRow === -2 && selectionCtrl.selectedCol >= 0) {
                copyType = 'columns';
            } else {
                copyType = 'cells';
            }

            // Build copied cell data
            const { table } = this.host;
            let data: string[][] | null = null;
            if (table) {
                data = [];

                // For column copy, include headers as first row
                if (copyType === 'columns' && table.headers) {
                    const headerRow: string[] = [];
                    for (let c = minC; c <= maxC; c++) {
                        headerRow.push(table.headers[c] || '');
                    }
                    data.push(headerRow);
                }

                // Add data rows
                for (let r = minR; r <= maxR; r++) {
                    const rowData: string[] = [];
                    for (let c = minC; c <= maxC; c++) {
                        rowData.push(table.rows[r]?.[c] || '');
                    }
                    data.push(rowData);
                }
            }

            // Store in shared ClipboardStore
            ClipboardStore.setCopiedData(data, copyType, {
                sheetIndex: this.host.sheetIndex,
                tableIndex: this.host.tableIndex,
                minR,
                maxR,
                minC,
                maxC
            });

            this.host.requestUpdate();
        }
    }

    /**
     * Insert copied rows at a target position
     * @param targetRow Row index where to insert
     * @param direction 'above' or 'below' the target row
     */
    insertCopiedRows(targetRow: number, direction: 'above' | 'below') {
        if (this.copyType !== 'rows' || !this.copiedData) {
            console.warn('No rows copied to insert');
            return;
        }

        const insertAt = direction === 'below' ? targetRow + 1 : targetRow;

        this.host.dispatchEvent(
            new CustomEvent('rows-insert-at', {
                bubbles: true,
                composed: true,
                detail: {
                    sheetIndex: this.host.sheetIndex,
                    tableIndex: this.host.tableIndex,
                    targetRow: insertAt,
                    rowsData: this.copiedData
                }
            })
        );
    }

    /**
     * Insert copied columns at a target position
     * @param targetCol Column index where to insert
     * @param direction 'left' or 'right' of the target column
     */
    insertCopiedColumns(targetCol: number, direction: 'left' | 'right') {
        if (this.copyType !== 'columns' || !this.copiedData) {
            console.warn('No columns copied to insert');
            return;
        }

        const insertAt = direction === 'right' ? targetCol + 1 : targetCol;

        // Transpose copiedData from row-major to column-major for column insertion
        const columnData: string[][] = [];
        if (this.copiedData.length > 0) {
            const numCols = this.copiedData[0].length;
            for (let c = 0; c < numCols; c++) {
                const colValues: string[] = [];
                for (let r = 0; r < this.copiedData.length; r++) {
                    colValues.push(this.copiedData[r][c] || '');
                }
                columnData.push(colValues);
            }
        }

        this.host.dispatchEvent(
            new CustomEvent('columns-insert-at', {
                bubbles: true,
                composed: true,
                detail: {
                    sheetIndex: this.host.sheetIndex,
                    tableIndex: this.host.tableIndex,
                    targetCol: insertAt,
                    columnsData: columnData
                }
            })
        );
    }

    /**
     * Parse TSV text that may contain quoted values with embedded newlines, tabs, or escaped quotes.
     * Follows RFC 4180 conventions: values containing special chars are quoted, quotes inside quoted values are doubled.
     */
    parseTsv(text: string): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        let i = 0;

        while (i < text.length) {
            const char = text[i];

            if (inQuotes) {
                if (char === '"') {
                    // Check if this is an escaped quote (doubled)
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        currentValue += '"';
                        i += 2;
                    } else {
                        // End of quoted value
                        inQuotes = false;
                        i++;
                    }
                } else {
                    currentValue += char;
                    i++;
                }
            } else {
                if (char === '"') {
                    // Start of quoted value
                    inQuotes = true;
                    i++;
                } else if (char === '\t') {
                    // Field delimiter - end current value
                    currentRow.push(currentValue);
                    currentValue = '';
                    i++;
                } else if (char === '\r') {
                    // Handle \r\n or standalone \r as row delimiter
                    currentRow.push(currentValue);
                    currentValue = '';
                    rows.push(currentRow);
                    currentRow = [];
                    if (i + 1 < text.length && text[i + 1] === '\n') {
                        i += 2;
                    } else {
                        i++;
                    }
                } else if (char === '\n') {
                    // Row delimiter
                    currentRow.push(currentValue);
                    currentValue = '';
                    rows.push(currentRow);
                    currentRow = [];
                    i++;
                } else {
                    currentValue += char;
                    i++;
                }
            }
        }

        // Add final value and row if any content remains
        if (currentValue !== '' || currentRow.length > 0) {
            currentRow.push(currentValue);
            rows.push(currentRow);
        }

        return rows;
    }

    /**
     * Escape a value for TSV format (quote if contains newline, tab, or quotes)
     */
    private _escapeTsvValue(val: string): string {
        if (val.includes('\n') || val.includes('\t') || val.includes('"')) {
            // Escape quotes by doubling them
            const escaped = val.replace(/"/g, '""');
            return `"${escaped}"`;
        }
        return val;
    }

    /**
     * Copy selected cells to clipboard as TSV
     */
    async copyToClipboard(): Promise<void> {
        const text = this._getTsvForSelection();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            this._saveCopiedRange();
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    }

    handleCopy(e: ClipboardEvent) {
        const text = this._getTsvForSelection();
        if (text) {
            e.clipboardData?.setData('text/plain', text);
            e.preventDefault();
            this._saveCopiedRange();
        }
    }

    handleCut(e: ClipboardEvent) {
        const text = this._getTsvForSelection();
        if (text) {
            e.clipboardData?.setData('text/plain', text);
            e.preventDefault();
            this.host.editCtrl.deleteSelection();
            // Clear copied range on cut (data is moved, not copied)
            this.clearCopiedRange();
        }
    }

    handlePaste(e: ClipboardEvent) {
        // Check for image files in clipboard (e.g. Ctrl+V screenshot)
        const files = e.clipboardData?.files;
        if (files && files.length > 0) {
            const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'));
            if (imageFile) {
                e.preventDefault();
                this._pasteImage(imageFile);
                return;
            }
        }

        const text = e.clipboardData?.getData('text/plain');
        if (text) {
            e.preventDefault();
            this._pasteTsvData(text);
        }
    }

    private async _pasteImage(file: File): Promise<void> {
        const { selectionCtrl, sheetIndex, tableIndex } = this.host;
        const row = selectionCtrl.selectedRow;
        const col = selectionCtrl.selectedCol;
        if (row < 0 || col < 0) return;

        await uploadImageAndGetUrl(
            file,
            (detail) => {
                window.dispatchEvent(new CustomEvent('toolbar-action', { detail }));
            },
            (url, altText) => {
                window.dispatchEvent(
                    new CustomEvent('paste-cells', {
                        detail: {
                            sheetIndex,
                            tableIndex,
                            startRow: row,
                            startCol: col,
                            data: [[`![${altText}](${url})`]],
                            includeHeaders: false
                        }
                    })
                );
            }
        );
    }

    private _getTsvForSelection(): string | null {
        const { table, selectionCtrl } = this.host;
        if (!table) return null;

        let minR = -100,
            maxR = -100,
            minC = -100,
            maxC = -100;
        // ... (existing logic)
        const numCols = table?.headers?.length || 0;
        const numRows = table.rows.length;

        const anchorRow = selectionCtrl.selectionAnchorRow;
        const anchorCol = selectionCtrl.selectionAnchorCol;
        const selRow = selectionCtrl.selectedRow;
        const selCol = selectionCtrl.selectedCol;

        // Full table selection (corner click)
        if (selRow === -2 && selCol === -2) {
            minR = 0;
            maxR = numRows - 1;
            minC = 0;
            maxC = numCols - 1;
        } else if (anchorRow !== -1 && anchorCol !== -1) {
            if (selCol === -2 || anchorCol === -2) {
                minR = Math.min(anchorRow, selRow);
                maxR = Math.max(anchorRow, selRow);
                minC = 0;
                maxC = numCols - 1;
            } else if (selRow === -2 || anchorRow === -2) {
                minR = 0;
                maxR = numRows - 1;
                minC = Math.min(anchorCol, selCol);
                maxC = Math.max(anchorCol, selCol);
            } else {
                minR = Math.min(anchorRow, selRow);
                maxR = Math.max(anchorRow, selRow);
                minC = Math.min(anchorCol, selCol);
                maxC = Math.max(anchorCol, selCol);
            }
        } else if (selRow !== -2 && selCol !== -2) {
            minR = maxR = selRow;
            minC = maxC = selCol;
        }

        if (minR < -1 || minC < -1) return null;

        const effectiveMinR = Math.max(0, minR);
        const effectiveMaxR = Math.min(numRows - 1, maxR);
        const effectiveMinC = Math.max(0, minC);
        const effectiveMaxC = Math.min(numCols - 1, maxC);

        const rows: string[] = [];

        // Column selection or full table selection - include header row first
        const isColumnSelection = selRow === -2 || anchorRow === -2;
        const isFullTableSelection = selRow === -2 && selCol === -2;
        if ((isColumnSelection || isFullTableSelection) && table.headers) {
            const headerData: string[] = [];
            for (let c = effectiveMinC; c <= effectiveMaxC; c++) {
                headerData.push(this._escapeTsvValue(table.headers[c] || ''));
            }
            rows.push(headerData.join('\t'));
        }

        for (let r = effectiveMinR; r <= effectiveMaxR; r++) {
            const rowData: string[] = [];
            for (let c = effectiveMinC; c <= effectiveMaxC; c++) {
                const cellVal = table.rows[r][c] || '';
                rowData.push(this._escapeTsvValue(cellVal));
            }
            rows.push(rowData.join('\t'));
        }

        return rows.join('\n');
    }

    /**
     * Paste TSV data from clipboard into the spreadsheet
     */
    async paste(): Promise<void> {
        try {
            // Check for image data in clipboard first
            if (navigator.clipboard.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find((t) => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const file = new File([blob], `image-${Date.now()}.png`, { type: imageType });
                        this._pasteImage(file);
                        return;
                    }
                }
            }

            const text = await navigator.clipboard.readText();
            if (text) {
                this._pasteTsvData(text);
            }
        } catch (err) {
            console.error('Paste failed', err);
        }
    }

    private _pasteTsvData(text: string): void {
        const { table, selectionCtrl, sheetIndex, tableIndex } = this.host;
        if (!table) return;

        const rows = this.parseTsv(text);

        let startRow = selectionCtrl.selectedRow;
        let startCol = selectionCtrl.selectedCol;

        if (selectionCtrl.selectedRow === -1 || selectionCtrl.selectedCol === -1) {
            return;
        }

        // Full table selection (corner click)
        const isFullTableSelection = selectionCtrl.selectedRow === -2 && selectionCtrl.selectedCol === -2;

        // Column selection (row header area)
        const isColumnSelection = selectionCtrl.selectedRow === -2 && selectionCtrl.selectedCol !== -2;

        if (isFullTableSelection) {
            startRow = 0;
            startCol = 0;
        } else if (isColumnSelection) {
            startRow = 0;
            // startCol stays at selected column
        } else if (selectionCtrl.selectedCol === -2) {
            // Row selection
            startRow = selectionCtrl.selectedRow;
            startCol = 0;
        } else if (
            selectionCtrl.selectionAnchorRow !== -1 &&
            selectionCtrl.selectedRow !== -2 &&
            selectionCtrl.selectedCol !== -2
        ) {
            startRow = Math.min(selectionCtrl.selectionAnchorRow, selectionCtrl.selectedRow);
            startCol = Math.min(selectionCtrl.selectionAnchorCol, selectionCtrl.selectedCol);
        }

        if (selectionCtrl.selectedRow >= (table?.rows.length || 0)) {
            startRow = table?.rows.length || 0;
            startCol = 0;
        }

        // Include headers when pasting at row 0 with column/full selection
        const includeHeaders = isFullTableSelection || isColumnSelection;

        this.host.dispatchEvent(
            new CustomEvent('paste-cells', {
                detail: {
                    sheetIndex: sheetIndex,
                    tableIndex: tableIndex,
                    startRow: startRow,
                    startCol: startCol,
                    data: rows,
                    includeHeaders: includeHeaders
                },
                bubbles: true,
                composed: true
            })
        );
    }

    /**
     * Delete/clear the current selection
     */
}
