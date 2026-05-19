import { ReactiveController } from 'lit';
import { SpreadsheetTable } from '../components/spreadsheet-table';
import { getDOMText, getCaretOffsetInElement, setCaretAtOffset } from '../utils/spreadsheet-helpers';
import { getSelection as getEditSelection } from '../utils/edit-mode-helpers';
import { SelectionRange } from './selection-controller';
import { ClipboardStore } from '../stores/clipboard-store';
// import { normalizeEditContent, findEditingCell } from '../utils/edit-mode-helpers';

export class EventController implements ReactiveController {
    host: SpreadsheetTable;

    // Drag state tracking
    private _potentialDragStart: { x: number; y: number; type: 'row' | 'col' | 'cell'; index: number } | null = null;
    private _isDragging = false;
    private static readonly DRAG_THRESHOLD = 5; // pixels before drag starts

    constructor(host: SpreadsheetTable) {
        this.host = host;
        host.addController(this);
    }

    hostConnected() {
        window.addEventListener('click', this.handleGlobalClick);
    }

    hostDisconnected() {
        window.removeEventListener('click', this.handleGlobalClick);
        this._removeDragListeners();
    }

    private _addDragListeners() {
        window.addEventListener('mousemove', this._handleDragMouseMove);
        window.addEventListener('mouseup', this._handleDragMouseUp);
    }

    private _removeDragListeners() {
        window.removeEventListener('mousemove', this._handleDragMouseMove);
        window.removeEventListener('mouseup', this._handleDragMouseUp);
    }

    private _handleDragMouseMove = (e: MouseEvent) => {
        this.handleMouseMove(e);
    };

    private _handleDragMouseUp = (e: MouseEvent) => {
        this.handleMouseUp(e);
        this._removeDragListeners();
    };

    private _handleDragOver = (_e: DragEvent) => {
        const path = _e.composedPath();
        if (this.host.contextMenu) {
            // Check if click source is the context menu itself
            const isInside = path.some((el) => (el as HTMLElement).classList?.contains('context-menu'));
            if (!isInside) {
                this.closeContextMenu();
            }
        }
    };

    private handleGlobalClick = (e: MouseEvent) => {
        const path = e.composedPath();
        if (this.host.contextMenu) {
            // Check if click source is the context menu itself
            const isInside = path.some((el) => (el as HTMLElement).classList?.contains('context-menu'));
            if (!isInside) {
                this.closeContextMenu();
            }
        }
        if (this.host.filterCtrl.activeFilterMenu) {
            const isInside = path.some(
                (el) =>
                    (el as HTMLElement).tagName?.toLowerCase() === 'filter-menu' ||
                    (el as HTMLElement).classList?.contains('filter-icon')
            );
            if (!isInside) {
                this.host.filterCtrl.closeFilterMenu();
            }
        }
    };

    private closeContextMenu() {
        this.host.contextMenu = null;
    }

    private dispatchAction(action: string, detail: Record<string, unknown>) {
        this.host.dispatchEvent(
            new CustomEvent(action, {
                detail: {
                    sheetIndex: this.host.sheetIndex,
                    tableIndex: this.host.tableIndex,
                    ...detail
                },
                bubbles: true,
                composed: true
            })
        );
        this.closeContextMenu();
    }

    // ============================================================
    // Global Event Handlers (Bound in SpreadsheetTable)
    // ============================================================

    handleKeyDown = (e: KeyboardEvent) => {
        this.host.keyboardCtrl.handleKeyDown(e);
    };

    handleFocusOut = (_e: FocusEvent) => {
        // Delegate to specific logic if needed, or remove listener if unused
        // Currently SpreadsheetTable had _handleFocusIn?
        // _handleBlur logic was removed?
        // Let's assume generic blur handling if any
    };

    handleMouseDown = (_e: MouseEvent) => {
        // Global mousedown handling if needed
    };

    handleMouseUp = (e: MouseEvent) => {
        // Complete drag if dragging
        if (this._isDragging && this.host.dragCtrl.isDragging) {
            this._completeDrag();
        }
        // Reset drag state
        this._potentialDragStart = null;
        this._isDragging = false;
        this.host.selectionCtrl.handleMouseUp(e);
    };

    handleMouseMove = (e: MouseEvent) => {
        // Check if we should initiate drag
        if (this._potentialDragStart && !this._isDragging) {
            const dx = Math.abs(e.clientX - this._potentialDragStart.x);
            const dy = Math.abs(e.clientY - this._potentialDragStart.y);
            if (dx > EventController.DRAG_THRESHOLD || dy > EventController.DRAG_THRESHOLD) {
                this._startDrag();
            }
        }

        // Update drag target while dragging
        if (this._isDragging && this.host.dragCtrl.isDragging) {
            this._updateDragTarget(e);
        } else {
            this.host.selectionCtrl.handleMouseMove(e);
        }
    };

    handleDblClick = (_e: MouseEvent) => {
        // Global dblclick
    };

    handlePaste = (e: ClipboardEvent) => {
        this.host.keyboardCtrl.handlePaste(e);
    };

    handleCut = (e: ClipboardEvent) => {
        this.host.keyboardCtrl.handleCut(e);
    };

    handleCopy = (e: ClipboardEvent) => {
        this.host.keyboardCtrl.handleCopy(e);
    };

    // Public wrapper for context menu
    handleContextMenuGlobal = (_e: MouseEvent) => {
        // Logic for global context menu if any
    };

    // Note: handleContextMenu is private helper currently.
    // SpreadsheetTable uses this.eventCtrl.handleContextMenu in connectedCallback.
    // We should expose it or rename it.
    // 'contextmenu' event listener expects a handler.

    // Changing private handleContextMenu to public arrow function
    handleContextMenu = (e: MouseEvent, type?: 'row' | 'col', index?: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (!type || index === undefined) return;

        this.host.contextMenu = {
            x: e.clientX,
            y: e.clientY,
            type: type,
            index: index,
            hasCopiedRows: ClipboardStore.hasCopiedRows,
            hasCopiedColumns: ClipboardStore.hasCopiedColumns
        };

        // Check if index is within current selection
        let isInsideSelection = false;
        const { selectedCol, selectionAnchorCol, selectedRow, selectionAnchorRow } = this.host.selectionCtrl;

        if (type === 'col') {
            if (selectedRow === -2 && selectedCol !== -2 && selectionAnchorCol !== -2) {
                const minC = Math.min(selectedCol, selectionAnchorCol);
                const maxC = Math.max(selectedCol, selectionAnchorCol);
                if (index >= minC && index <= maxC) {
                    isInsideSelection = true;
                }
            }
        } else if (type === 'row') {
            if (selectedCol === -2 && selectedRow !== -2 && selectionAnchorRow !== -2) {
                const minR = Math.min(selectedRow, selectionAnchorRow);
                const maxR = Math.max(selectedRow, selectionAnchorRow);
                if (index >= minR && index <= maxR) {
                    isInsideSelection = true;
                }
            }
        }

        // Only reset selection if clicked outside
        if (!isInsideSelection) {
            if (type === 'row') {
                this.host.selectionCtrl.selectCell(index, -2);
            } else {
                this.host.selectionCtrl.selectCell(-2, index);
            }
        }
        this.host.focusCell();
    };

    // ============================================================
    // Handler Implementations
    // ============================================================

    handleColClick = (e: CustomEvent<{ col: number; shiftKey: boolean }>) => {
        this.host.selectionCtrl.selectCell(-2, e.detail.col, e.detail.shiftKey);
        this.host.focusCell();
    };

    handleColMousedown = (e: CustomEvent<{ col: number; shiftKey: boolean; originalEvent?: MouseEvent }>) => {
        const col = e.detail.col;
        const shiftKey = e.detail.shiftKey;

        // Check if this column is already in selection (potential drag)
        const { selectedRow, selectedCol, selectionAnchorCol } = this.host.selectionCtrl;
        if (selectedRow === -2 && selectedCol !== -2 && selectionAnchorCol !== -2) {
            const minC = Math.min(selectedCol, selectionAnchorCol);
            const maxC = Math.max(selectedCol, selectionAnchorCol);
            if (col >= minC && col <= maxC && !shiftKey) {
                // Clicked on selected column - prepare for potential drag
                const mouseEvent = e.detail.originalEvent;
                if (mouseEvent) {
                    this._potentialDragStart = {
                        x: mouseEvent.clientX,
                        y: mouseEvent.clientY,
                        type: 'col',
                        index: col
                    };
                    this._addDragListeners();
                }
                return; // Don't start selection, wait for drag or click
            }
        }

        // Normal selection start
        this._potentialDragStart = null;
        this.host.selectionCtrl.startSelection(-2, col, shiftKey);
    };

    handleColDblclick = (e: CustomEvent<{ col: number }>) => {
        const col = e.detail.col;
        const value = this.host.table?.headers?.[col] ?? String(col + 1);
        this.host.selectionCtrl.selectCell(-1, col);
        this.host.editCtrl.startEditing(value);
        this.host.focusCell();
    };

    handleColContextMenu = (e: CustomEvent<{ type: string; index: number; x: number; y: number }>) => {
        this.handleContextMenu(
            {
                clientX: e.detail.x,
                clientY: e.detail.y,
                preventDefault: () => {},
                stopPropagation: () => {}
            } as MouseEvent,
            'col',
            e.detail.index
        );
    };

    handleColInput = (e: CustomEvent<{ col: number; target: EventTarget | null }>) => {
        this.handleInput({ target: e.detail.target } as Event);
    };

    handleColBlur = (e: CustomEvent<{ col: number; originalEvent: FocusEvent }>) => {
        this.handleBlur(e.detail.originalEvent);
    };

    handleColKeydown = (e: CustomEvent<{ col: number; originalEvent: KeyboardEvent }>) => {
        this.host.keyboardCtrl.handleKeyDown(e.detail.originalEvent);
    };

    handleFilterClick = (e: CustomEvent<{ col: number; x: number; y: number }>) => {
        this.host.filterCtrl.toggleFilterMenu(
            {
                clientX: e.detail.x,
                clientY: e.detail.y,
                stopPropagation: () => {},
                target: {
                    getBoundingClientRect: () => ({
                        left: e.detail.x,
                        right: e.detail.x,
                        bottom: e.detail.y
                    })
                }
            } as unknown as MouseEvent,
            e.detail.col
        );
    };

    handleResizeStart = (e: CustomEvent<{ col: number; x: number; width: number }>) => {
        this.host.resizeCtrl.startResize(
            { clientX: e.detail.x, preventDefault: () => {}, stopPropagation: () => {} } as MouseEvent,
            e.detail.col,
            e.detail.width
        );
    };

    handleRowClick = (e: CustomEvent<{ row: number; shiftKey: boolean }>) => {
        this.host.selectionCtrl.selectCell(e.detail.row, -2, e.detail.shiftKey);
        this.host.focusCell();
    };

    handleRowMousedown = (e: CustomEvent<{ row: number; shiftKey: boolean; originalEvent?: MouseEvent }>) => {
        const row = e.detail.row;
        const shiftKey = e.detail.shiftKey;

        // Check if this row is already in selection (potential drag)
        const { selectedRow, selectedCol, selectionAnchorRow } = this.host.selectionCtrl;
        if (selectedCol === -2 && selectedRow !== -2 && selectionAnchorRow !== -2) {
            const minR = Math.min(selectedRow, selectionAnchorRow);
            const maxR = Math.max(selectedRow, selectionAnchorRow);
            if (row >= minR && row <= maxR && !shiftKey) {
                // Clicked on selected row - prepare for potential drag
                const mouseEvent = e.detail.originalEvent;
                if (mouseEvent) {
                    this._potentialDragStart = {
                        x: mouseEvent.clientX,
                        y: mouseEvent.clientY,
                        type: 'row',
                        index: row
                    };
                    this._addDragListeners();
                }
                return; // Don't start selection, wait for drag or click
            }
        }

        // Normal selection start
        this._potentialDragStart = null;
        this.host.selectionCtrl.startSelection(row, -2, shiftKey);
    };

    handleRowContextMenu = (e: CustomEvent<{ type: string; index: number; x: number; y: number }>) => {
        this.handleContextMenu(
            {
                clientX: e.detail.x,
                clientY: e.detail.y,
                preventDefault: () => {},
                stopPropagation: () => {}
            } as MouseEvent,
            'row',
            e.detail.index
        );
    };

    handleRowKeydown = (e: CustomEvent<{ row: number; col: number; originalEvent: KeyboardEvent }>) => {
        this.host.keyboardCtrl.handleKeyDown(e.detail.originalEvent);
    };

    handleCellClick = async (e: CustomEvent<{ row: number; col: number; shiftKey: boolean }>) => {
        // Commit current edit if active
        // Logic from _commitCurrentEdit (moved/adapted)
        if (this.host.editCtrl.isEditing) {
            const syntheticEvent = new CustomEvent('commit', { bubbles: true, composed: true });
            await this.host.commitEdit(syntheticEvent);
            this.host.requestUpdate();
        }

        this.host.selectionCtrl.selectCell(e.detail.row, e.detail.col, e.detail.shiftKey);
        this.host.focusCell();
    };

    handleCellMousedown = (
        e: CustomEvent<{
            row: number;
            col: number;
            shiftKey: boolean;
            originalEvent?: MouseEvent;
        }>
    ) => {
        // Commit any pending edit before changing selection (click-away commit)
        if (this.host.editCtrl.isEditing) {
            // Editing cell is in View's shadow DOM
            const view = this.host.shadowRoot?.querySelector('spreadsheet-table-view');
            const editingCell = view?.shadowRoot?.querySelector('.cell.editing') as HTMLElement | null;

            if (editingCell) {
                const syntheticEvent = new FocusEvent('blur', { bubbles: true });
                Object.defineProperty(syntheticEvent, 'target', { value: editingCell, writable: false });
                this.host.commitEdit(syntheticEvent);
            } else if (this.host.editCtrl.isReplacementMode && this.host.editCtrl.pendingEditValue !== null) {
                // Replacement mode without DOM update yet - directly apply pending value
                const row = this.host.selectionCtrl.selectedRow;
                const col = this.host.selectionCtrl.selectedCol;
                if (this.host.table && row >= 0 && col >= 0 && row < this.host.table.rows.length) {
                    this.host.table.rows[row][col] = this.host.editCtrl.pendingEditValue;
                    this.host.dispatchEvent(
                        new CustomEvent('cell-edit', {
                            detail: {
                                sheetIndex: this.host.sheetIndex,
                                tableIndex: this.host.tableIndex,
                                rowIndex: row,
                                colIndex: col,
                                newValue: this.host.editCtrl.pendingEditValue
                            },
                            bubbles: true,
                            composed: true
                        })
                    );
                    this.host.requestUpdate();
                }
                this.host.editCtrl.cancelEditing();
            }
        }

        const { row, col, shiftKey } = e.detail;

        // Check if this cell is already in selection (potential drag)
        const { selectedRow, selectedCol, selectionAnchorRow, selectionAnchorCol } = this.host.selectionCtrl;
        // In normal cell selection mode (not row/column mode)
        if (selectedRow >= 0 && selectedCol >= 0 && selectionAnchorRow >= 0 && selectionAnchorCol >= 0) {
            const minR = Math.min(selectedRow, selectionAnchorRow);
            const maxR = Math.max(selectedRow, selectionAnchorRow);
            const minC = Math.min(selectedCol, selectionAnchorCol);
            const maxC = Math.max(selectedCol, selectionAnchorCol);
            // Check if clicked cell is within selection
            if (row >= minR && row <= maxR && col >= minC && col <= maxC && !shiftKey) {
                // Clicked on selected cell range - prepare for potential drag
                const mouseEvent = e.detail.originalEvent;
                if (mouseEvent) {
                    this._potentialDragStart = {
                        x: mouseEvent.clientX,
                        y: mouseEvent.clientY,
                        type: 'cell',
                        index: row // Not really used for cell, just for consistency
                    };
                    this._addDragListeners();
                }
                return; // Don't start selection, wait for drag or click
            }
        }

        if (shiftKey) {
            this.host.selectionCtrl.selectCell(row, col, true);
        } else {
            this.host.selectionCtrl.startSelection(row, col);
        }
        this.host.focusCell();
    };

    handleCellDblclick = (e: CustomEvent<{ row: number; col: number }>) => {
        const { row, col } = e.detail;

        // Prevent editing formula columns
        if (this.host.isFormulaColumn(col)) {
            this.host.selectionCtrl.selectCell(row, col);
            this.host.focusCell();
            return;
        }

        const value = this.host.table?.rows?.[row]?.[col] ?? '';
        this.host.selectionCtrl.selectCell(row, col);
        this.host.editCtrl.startEditing(value);
        this.host.focusCell();
    };

    handleCellInput = (
        e: CustomEvent<{ row: number; col: number; target: EventTarget | null; originalEvent: InputEvent }>
    ) => {
        this.handleInput(e.detail.originalEvent);
    };

    handleCellBlur = (e: CustomEvent<{ row: number; col: number; originalEvent: FocusEvent }>) => {
        this.handleBlur(e.detail.originalEvent);
    };

    handleCellKeydown = (e: CustomEvent<{ row: number; col: number; originalEvent: KeyboardEvent }>) => {
        this.host.keyboardCtrl.handleKeyDown(e.detail.originalEvent);
    };

    handleCellContextMenu = (e: CustomEvent<{ row: number; col: number; x: number; y: number }>) => {
        const { row, col, x, y } = e.detail;

        // Set context menu state with 'cell' type
        this.host.contextMenu = {
            x,
            y,
            type: 'cell',
            index: row // row is used for index in cell context
        };

        // Check if this cell is within current selection
        const { selectedRow, selectedCol, selectionAnchorRow, selectionAnchorCol } = this.host.selectionCtrl;
        let isInsideSelection = false;

        if (selectedRow >= 0 && selectedCol >= 0 && selectionAnchorRow >= 0 && selectionAnchorCol >= 0) {
            const minR = Math.min(selectedRow, selectionAnchorRow);
            const maxR = Math.max(selectedRow, selectionAnchorRow);
            const minC = Math.min(selectedCol, selectionAnchorCol);
            const maxC = Math.max(selectedCol, selectionAnchorCol);

            if (row >= minR && row <= maxR && col >= minC && col <= maxC) {
                isInsideSelection = true;
            }
        }

        // Only update selection if clicked outside current selection
        if (!isInsideSelection) {
            this.host.selectionCtrl.selectCell(row, col);
        }

        this.host.focusCell();
    };

    handleValidationInput = (e: CustomEvent<{ row: number; col: number; value: string }>) => {
        // Dispatch cell-edit event to commit the new value
        this.dispatchAction('cell-edit', {
            rowIndex: e.detail.row,
            colIndex: e.detail.col,
            newValue: e.detail.value
        });

        // Ensure focus remains on the table/cell (optional but good for UX)
        // this.host.focusCell();
    };

    handleCellMousemove = (e: CustomEvent<{ row: number; col: number }>) => {
        if (this.host.selectionCtrl.isSelecting) {
            this.host.selectionCtrl.selectCell(e.detail.row, e.detail.col, true);
        }
    };

    handleCornerClick = () => {
        this.host.selectionCtrl.selectCell(-2, -2);
        this.host.focusCell();
    };

    handleCornerKeydown = (e: CustomEvent<{ originalEvent: KeyboardEvent }>) => {
        this.host.keyboardCtrl.handleKeyDown(e.detail.originalEvent);
    };

    handleCornerContextMenu = (e: CustomEvent<{ originalEvent: MouseEvent }>) => {
        e.detail.originalEvent.preventDefault();
        const { clientX, clientY } = e.detail.originalEvent;

        // Force select all cells
        this.host.selectionCtrl.selectCell(-2, -2);
        this.host.focusCell();

        // Show context menu with 'cell' type
        // Use dummy index -1 as 'cell' type context menu operations (copy/paste) don't rely on index
        // but rather on the current selection or clipboard state.
        this.host.contextMenu = {
            x: clientX,
            y: clientY,
            type: 'cell',
            index: -1,
            hasCopiedRows: ClipboardStore.hasCopiedRows,
            hasCopiedColumns: ClipboardStore.hasCopiedColumns
        };
    };

    handleMenuAction = (e: CustomEvent<{ action: string; type: string; index: number }>) => {
        const { action, type, index } = e.detail;
        if (action === 'insert') {
            if (type === 'row') {
                this.dispatchAction('row-insert', { rowIndex: index });
            } else {
                this.dispatchAction('column-insert', { colIndex: index });
            }
        } else if (action === 'delete') {
            if (type === 'row') {
                this.dispatchAction('row-delete', { rowIndex: index });
            } else {
                // Check for multi-column selection
                const { selectedCol, selectionAnchorCol, selectedRow } = this.host.selectionCtrl;
                if (selectedRow === -2 && selectedCol !== -2 && selectionAnchorCol !== -2) {
                    const minC = Math.min(selectedCol, selectionAnchorCol);
                    const maxC = Math.max(selectedCol, selectionAnchorCol);
                    const colIndices = [];
                    for (let i = minC; i <= maxC; i++) {
                        colIndices.push(i);
                    }
                    this.dispatchAction('columns-delete', { colIndices: colIndices });
                } else {
                    this.dispatchAction('column-delete', { colIndex: index });
                }
            }
        }
        this.host.contextMenu = null;
    };

    handleFilterApply = (e: CustomEvent) => {
        this.host.filterCtrl.handleFilterChange(e);
    };

    handleFilterClose = () => {
        this.host.filterCtrl.closeFilterMenu();
    };

    handleMetadataChange = (e: CustomEvent<{ description: string }>) => {
        this.dispatchAction('metadata-update', { description: e.detail.description });
    };

    handleInsertRow = (e: CustomEvent<{ index: number }>) => {
        this.dispatchAction('row-insert', { rowIndex: e.detail.index });
    };

    handleDeleteRow = (e: CustomEvent<{ index: number }>) => {
        this.dispatchAction('row-delete', { rowIndex: e.detail.index });
    };

    handleInsertCol = (e: CustomEvent<{ index: number }>) => {
        this.dispatchAction('column-insert', { colIndex: e.detail.index });
    };

    handleDeleteCol = (e: CustomEvent<{ index: number }>) => {
        this.dispatchAction('column-delete', { colIndex: e.detail.index });
    };

    private _handleDrop = (_e: DragEvent) => {
        const inputEvent = _e as unknown as InputEvent;
        // const target = _e.target as HTMLElement;

        if (inputEvent.inputType === 'insertLineBreak') {
            this.host.editCtrl.hasUserInsertedNewline = true;
        }
    };

    // Helper: Input
    private handleInput(e: Event) {
        const inputEvent = e as InputEvent;
        const target = e.target as HTMLElement;

        // Skip during IME composition - browser manages DOM internally; we update on compositionend
        if (inputEvent.isComposing) {
            return;
        }

        // 1. Re-read trackedValue from DOM (post-input state).
        //    This is more reliable than operation-based tracking because the browser
        //    has already made the correct DOM change. The only problem is phantom BRs,
        //    which getDOMText handles by counting them as '\n', and we strip any
        //    single trailing '\n' that contenteditable always appends.
        if (target) {
            let text = getDOMText(target);
            if (text.endsWith('\n')) {
                text = text.slice(0, -1);
            }
            this.host.editCtrl.trackedValue = text;
        }

        // 2. Sync caret position from DOM selection into trackedCaret*.
        //    We read the selection AFTER the input event so it reflects the browser's
        //    post-input caret position.
        const root = this.host.viewShadowRoot || this.host.shadowRoot;
        const selection = getEditSelection(root);
        if (selection && target) {
            const { start, end } = getCaretOffsetInElement(target, selection);
            this.host.editCtrl.trackedCaretStart = start;
            this.host.editCtrl.trackedCaretEnd = end;
        }

        // 3. inputType-specific side effects (flags only, no string manipulation).
        switch (inputEvent.inputType) {
            case 'insertLineBreak':
            case 'insertParagraph':
                this.host.editCtrl.hasUserInsertedNewline = true;
                break;
            default:
                break;
        }

        // 4. DOM sync: only rewrite innerHTML when phantom BRs are present.
        //    Phantom BRs occur when the DOM has more BRs than trackedValue's '\n' count.
        //    When we rewrite, we restore the caret to the tracked position (not end-of-content).
        if (target && this.host.editCtrl.trackedValue !== null) {
            const trackedValue = this.host.editCtrl.trackedValue;
            const expectedHTML = trackedValue.replace(/\n/g, '<br>');
            const normalizedCurrent = target.innerHTML.replace(/<br\s*\/?>/gi, '<br>');

            const expectedBRCount = (expectedHTML.match(/<br>/g) || []).length;
            const currentBRCount = (normalizedCurrent.match(/<br>/g) || []).length;
            const hasPhantomBRs = currentBRCount > expectedBRCount;

            if (hasPhantomBRs) {
                target.innerHTML = expectedHTML;
                // Restore caret to tracked position (not end-of-content)
                setCaretAtOffset(target, this.host.editCtrl.trackedCaretEnd);
            }
        }

        // 5. Empty content cleanup
        if (target && target.innerHTML) {
            const stripped = target.innerHTML
                .replace(/<br\s*\/?>/gi, '')
                .replace(/\u200B/g, '')
                .trim();
            if (stripped === '' && !this.host.editCtrl.hasUserInsertedNewline) {
                target.innerHTML = '';
            }
        }

        if (this.host.editCtrl.isReplacementMode && target) {
            this.host.editCtrl.pendingEditValue = getDOMText(target);
        }
    }

    // Helper: Blur
    private handleBlur(e: FocusEvent) {
        if (e.relatedTarget && (e.target as Element).contains(e.relatedTarget as Node)) {
            return;
        }
        if (this.host.editCtrl.isEditing) {
            this.host.commitEdit(e);
        }
    }

    // ============================================================
    // Drag Helper Methods
    // ============================================================

    private _startDrag(): void {
        if (!this._potentialDragStart) return;

        const { type } = this._potentialDragStart;
        const { selectedRow, selectedCol, selectionAnchorRow, selectionAnchorCol } = this.host.selectionCtrl;

        // Build source range based on drag type
        let sourceRange: SelectionRange;
        if (type === 'row') {
            const minR = Math.min(selectedRow, selectionAnchorRow);
            const maxR = Math.max(selectedRow, selectionAnchorRow);
            sourceRange = {
                minR,
                maxR,
                minC: 0,
                maxC: (this.host.table?.headers?.length ?? 1) - 1
            };
        } else if (type === 'col') {
            const minC = Math.min(selectedCol, selectionAnchorCol);
            const maxC = Math.max(selectedCol, selectionAnchorCol);
            sourceRange = {
                minR: 0,
                maxR: (this.host.table?.rows?.length ?? 1) - 1,
                minC,
                maxC
            };
        } else {
            // Cell range
            const minR = Math.min(selectedRow, selectionAnchorRow);
            const maxR = Math.max(selectedRow, selectionAnchorRow);
            const minC = Math.min(selectedCol, selectionAnchorCol);
            const maxC = Math.max(selectedCol, selectionAnchorCol);
            sourceRange = { minR, maxR, minC, maxC };
        }

        this._isDragging = true;
        this.host.dragCtrl.startDrag(type, sourceRange);
        this.host.requestUpdate();
    }

    private _updateDragTarget(e: MouseEvent): void {
        const dragType = this.host.dragCtrl.dragType;
        if (!dragType) return;

        // Find the row/column header under the mouse
        // Need to traverse shadow DOM to find elements
        let target: Element | null = document.elementFromPoint(e.clientX, e.clientY);

        // Traverse into shadow roots to find the deepest element
        while (target && target.shadowRoot) {
            const deeper = target.shadowRoot.elementFromPoint(e.clientX, e.clientY);
            if (!deeper || deeper === target) break;
            target = deeper;
        }

        if (!target) {
            // If no target found during column drag, check if mouse is past the last column
            if (dragType === 'col') {
                const table = this.host.table;
                const numCols = table?.headers?.length ?? table?.rows?.[0]?.length ?? 0;
                if (numCols > 0) {
                    this.host.dragCtrl.updateDropTarget(numCols);
                    this.host.requestUpdate();
                }
            }
            return;
        }

        // Look for row or column header
        const cell = target.closest('[data-row], [data-col]') as HTMLElement | null;
        if (!cell) {
            // No cell found - for column drag, allow end-of-columns drop
            if (dragType === 'col') {
                const table = this.host.table;
                const numCols = table?.headers?.length ?? table?.rows?.[0]?.length ?? 0;
                if (numCols > 0) {
                    this.host.dragCtrl.updateDropTarget(numCols);
                    this.host.requestUpdate();
                }
            }
            return;
        }

        if (dragType === 'row') {
            const rowAttr = cell.getAttribute('data-row');
            if (rowAttr !== null) {
                const row = parseInt(rowAttr, 10);
                if (!isNaN(row) && row >= 0) {
                    this.host.dragCtrl.updateDropTarget(row);
                    this.host.requestUpdate();
                }
            }
        } else if (dragType === 'col') {
            const colAttr = cell.getAttribute('data-col');
            if (colAttr !== null) {
                const col = parseInt(colAttr, 10);
                if (!isNaN(col) && col >= 0) {
                    this.host.dragCtrl.updateDropTarget(col);
                    this.host.requestUpdate();
                }
            }
        } else if (dragType === 'cell') {
            // For cell drag, we need both row and col
            const rowAttr = cell.getAttribute('data-row');
            const colAttr = cell.getAttribute('data-col');
            if (rowAttr !== null && colAttr !== null) {
                const row = parseInt(rowAttr, 10);
                const col = parseInt(colAttr, 10);
                if (!isNaN(row) && !isNaN(col) && row >= 0 && col >= 0) {
                    this.host.dragCtrl.updateCellDropTarget(row, col);
                    this.host.requestUpdate();
                }
            }
        }
    }

    private _completeDrag(): void {
        const result = this.host.dragCtrl.completeDrag();
        if (!result) return;

        // Build the appropriate event based on drag type
        if (result.type === 'row') {
            this.host.dispatchEvent(
                new CustomEvent('move-rows', {
                    detail: {
                        sheetIndex: this.host.sheetIndex,
                        tableIndex: this.host.tableIndex,
                        rowIndices: result.sourceIndices,
                        targetRowIndex: result.targetIndex
                    },
                    bubbles: true,
                    composed: true
                })
            );

            // Update selection to the new row position after move
            const sourceMin = Math.min(...result.sourceIndices);
            const targetIndex = result.targetIndex;
            // Calculate where the moved rows will end up
            let newStartRow: number;
            if (targetIndex <= sourceMin) {
                // Moving up: rows end up at targetIndex
                newStartRow = targetIndex;
            } else {
                // Moving down: rows end up at targetIndex - count
                newStartRow = targetIndex - result.sourceIndices.length;
            }
            const newEndRow = newStartRow + result.sourceIndices.length - 1;
            // Update selection to new row range (row selection mode: col = -2)
            // SelectionController uses anchorRow/anchorCol and selectedRow/selectedCol
            // Range is calculated from min/max of anchor and selected
            this.host.selectionCtrl.selectionAnchorRow = newStartRow;
            this.host.selectionCtrl.selectionAnchorCol = -2;
            this.host.selectionCtrl.selectedRow = newEndRow;
            this.host.selectionCtrl.selectedCol = -2;
            this.host.requestUpdate();
        } else if (result.type === 'col') {
            this.host.dispatchEvent(
                new CustomEvent('move-columns', {
                    detail: {
                        sheetIndex: this.host.sheetIndex,
                        tableIndex: this.host.tableIndex,
                        colIndices: result.sourceIndices,
                        targetColIndex: result.targetIndex
                    },
                    bubbles: true,
                    composed: true
                })
            );

            // Update selection to the new column position after move
            const sourceMin = Math.min(...result.sourceIndices);
            const targetIndex = result.targetIndex;
            // Calculate where the moved columns will end up
            let newStartCol: number;
            if (targetIndex <= sourceMin) {
                // Moving left: columns end up at targetIndex
                newStartCol = targetIndex;
            } else {
                // Moving right: columns end up at targetIndex - count
                newStartCol = targetIndex - result.sourceIndices.length;
            }
            const newEndCol = newStartCol + result.sourceIndices.length - 1;
            // Update selection to new column range (column selection mode: row = -2)
            this.host.selectionCtrl.selectionAnchorRow = -2;
            this.host.selectionCtrl.selectionAnchorCol = newStartCol;
            this.host.selectionCtrl.selectedRow = -2;
            this.host.selectionCtrl.selectedCol = newEndCol;
            this.host.requestUpdate();
        } else if (result.type === 'cell') {
            this.host.dispatchEvent(
                new CustomEvent('move-cells', {
                    detail: {
                        sheetIndex: this.host.sheetIndex,
                        tableIndex: this.host.tableIndex,
                        sourceRange: result.sourceRange,
                        destRow: result.destRow,
                        destCol: result.destCol
                    },
                    bubbles: true,
                    composed: true
                })
            );

            // Update selection to the new cell range after move
            const sourceRange = result.sourceRange!;
            const rangeHeight = sourceRange.maxR - sourceRange.minR;
            const rangeWidth = sourceRange.maxC - sourceRange.minC;
            const newStartRow = result.destRow;
            const newStartCol = result.destCol;
            const newEndRow = newStartRow + rangeHeight;
            const newEndCol = newStartCol + rangeWidth;

            // Update selection to new cell range
            this.host.selectionCtrl.selectionAnchorRow = newStartRow;
            this.host.selectionCtrl.selectionAnchorCol = newStartCol;
            this.host.selectionCtrl.selectedRow = newEndRow;
            this.host.selectionCtrl.selectedCol = newEndCol;
            this.host.requestUpdate();
        }

        this.host.requestUpdate();
    }
}
