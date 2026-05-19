import { LitElement, html, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { provideVSCodeDesignSystem, vsCodeButton } from '@vscode/webview-ui-toolkit';
import { SelectionController, SelectionRange } from '../controllers/selection-controller';
import { EditController } from '../controllers/edit-controller';
import { ResizeController } from '../controllers/resize-controller';
import { NavigationController } from '../controllers/navigation-controller';
import { ClipboardController } from '../controllers/clipboard-controller';
import { FilterController } from '../controllers/filter-controller';
import { ToolbarController } from '../controllers/toolbar-controller';
import { FocusController } from '../controllers/focus-controller';
import { KeyboardController } from '../controllers/keyboard-controller';
import { EventController } from '../controllers/event-controller';
import { RowVisibilityController, VisualMetadata } from '../controllers/row-visibility-controller';
import { DragController } from '../controllers/drag-controller';
import { ClipboardStore } from '../stores/clipboard-store';
import { getDOMText } from '../utils/spreadsheet-helpers';
import { normalizeEditContent, findEditingCell } from '../utils/edit-mode-helpers';
import spreadsheetTableStyles from './styles/spreadsheet-table.css?inline';
import './filter-menu';
import './cells/ss-data-cell';
import './cells/ss-corner-cell';
import './cells/ss-row-header';
import './cells/ss-column-header';
import './cells/ss-ghost-cell';
import './menus/ss-context-menu';
import './menus/ss-metadata-editor';
import './menus/ss-validation-dialog';
import './menus/ss-formula-dialog';
import './spreadsheet-table-view';
import type { ValidationRule } from '../controllers/validation-controller';
import type { FormulaDefinition, TableMetadata } from '../services/types';
import codiconsStyles from '@vscode/codicons/dist/codicon.css?inline';

provideVSCodeDesignSystem().register(vsCodeButton());

import { TableJSON, WorkbookJSON } from '../types';

@customElement('spreadsheet-table')
export class SpreadsheetTable extends LitElement {
    static styles = [unsafeCSS(codiconsStyles), unsafeCSS(spreadsheetTableStyles)];

    @property({ type: Object })
    table: TableJSON | null = null;

    @property({ type: Number })
    sheetIndex: number = 0;

    @property({ type: Number })
    tableIndex: number = 0;

    @property({ type: String })
    dateFormat: string = 'YYYY-MM-DD';

    @property({ type: Object })
    workbook: WorkbookJSON | null = null;

    selectionCtrl = new SelectionController(this);
    editCtrl = new EditController(this);
    resizeCtrl = new ResizeController(this);
    navCtrl = new NavigationController(this, this.selectionCtrl);
    clipboardCtrl = new ClipboardController(this);
    filterCtrl = new FilterController(this);
    toolbarCtrl = new ToolbarController(this);
    keyboardCtrl = new KeyboardController(this);
    eventCtrl = new EventController(this);
    focusCtrl = new FocusController({
        getShadowRoot: () => this.shadowRoot?.querySelector('spreadsheet-table-view')?.shadowRoot || this.shadowRoot,
        getSelectedRow: () => this.selectionCtrl.selectedRow,
        getSelectedCol: () => this.selectionCtrl.selectedCol,
        isEditing: () => this.editCtrl.isEditing,
        getPendingEditValue: () => this.editCtrl.pendingEditValue,
        clearPendingEditValue: () => {
            this.editCtrl.pendingEditValue = null;
        }
    });
    rowVisibilityCtrl = new RowVisibilityController({
        getRows: () => this.table?.rows || null,
        getVisualMetadata: () => {
            if (!this.table?.metadata) return null;
            return ((this.table.metadata as Record<string, unknown>)?.visual as VisualMetadata) || null;
        }
    });
    dragCtrl = new DragController(this);

    @state()
    contextMenu: {
        x: number;
        y: number;
        type: 'row' | 'col' | 'cell';
        index: number;
        hasCopiedRows?: boolean;
        hasCopiedColumns?: boolean;
    } | null = null;

    @state()
    validationDialog: { colIndex: number; currentRule: ValidationRule | null } | null = null;

    @state()
    formulaDialog: { colIndex: number; currentFormula: FormulaDefinition | null } | null = null;

    private _shouldFocusCell: boolean = false;
    private _isCommitting: boolean = false; // Kept in host for now as it coordinates editCtrl and Events
    private _restoreCaretPos: number | null = null;
    private _wasFocusedBeforeUpdate: boolean = false;
    private _pendingSelection: {
        anchorRow: number;
        selectedRow: number;
        anchorCol: number;
        selectedCol: number;
    } | null = null;
    private _lastSelectedCol: number = -999; // Track last column for selection-change events
    private _hasRenderedOnce: boolean = false; // Skip selection-change on first render

    // Exposed for Controllers
    public focusCell() {
        this._shouldFocusCell = true;
        this.requestUpdate();
    }

    /**
     * Check if a column is a formula column (computed column).
     * Used to prevent editing of computed cells.
     */
    public isFormulaColumn(colIndex: number): boolean {
        if (!this.table?.metadata) return false;
        const meta = this.table.metadata as Record<string, unknown>;
        const visual = meta?.visual as Record<string, unknown> | undefined;
        const formulas = visual?.formulas as Record<string, unknown> | undefined;
        if (!formulas) return false;
        return colIndex.toString() in formulas;
    }

    /**
     * Open the description editor for this table.
     * Called from pane-view when user selects "Edit Table Description" from context menu.
     */
    public openDescriptionEditor() {
        const view = this.shadowRoot?.querySelector('spreadsheet-table-view');
        if (view) {
            const editor = view.shadowRoot?.querySelector('ss-metadata-editor') as { openEditor?: () => void } | null;
            if (editor?.openEditor) {
                editor.openEditor();
            }
        }
    }

    willUpdate(changedProperties: PropertyValues) {
        // Track focus before update to prevent focus stealing/loss across re-renders
        // If we currently have focus (or a child has focus), we want to try to restore it after update
        // unless _shouldFocusCell explicitly requested a focus change.
        const active = this.shadowRoot?.activeElement;
        this._wasFocusedBeforeUpdate =
            !!active &&
            (active.classList.contains('cell') ||
                active.classList.contains('cell-content') ||
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA');

        if (changedProperties.has('sheetIndex') || changedProperties.has('tableIndex')) {
            this.editCtrl.cancelEditing(); // Reset edit
            this.selectionCtrl.reset();
            this._shouldFocusCell = false;
            this.contextMenu = null;
        }

        if (changedProperties.has('table')) {
            const oldTable = changedProperties.get('table');
            // Only restore focus if we had it before, or if we are the only thing?
            // Actually, if we are editing, _wasFocusedBeforeUpdate is handled above.
            // This block forces focus on data reload. We should ONLY do it if we were focused.
            if (oldTable && this._wasFocusedBeforeUpdate) {
                this._shouldFocusCell = true;
            }
        }

        if (changedProperties.has('table') && this.table) {
            const visual = (this.table.metadata as Record<string, unknown>)?.visual as VisualMetadata;

            // Prioritize new "columns" structure for width
            if (visual && visual.columns) {
                const widths: Record<number, number> = {};
                const cols = visual.columns;
                Object.entries(cols).forEach(([k, v]) => {
                    if (v.width !== undefined) {
                        const colIdx = Number(k);
                        if (!isNaN(colIdx)) {
                            widths[colIdx] = v.width;
                        }
                    }
                });
                this.resizeCtrl.setColumnWidths(widths);
            } else if (visual && visual.column_widths) {
                if (Array.isArray(visual.column_widths)) {
                    const widths: Record<number, number> = {};
                    visual.column_widths.forEach((w: number, i: number) => (widths[i] = w));
                    this.resizeCtrl.setColumnWidths(widths);
                } else {
                    this.resizeCtrl.setColumnWidths(visual.column_widths as Record<number, number>);
                }
            } else {
                this.resizeCtrl.setColumnWidths({});
            }

            const colCount = this.table.headers ? this.table.headers.length : this.table.rows[0]?.length || 0;
            const rowCount = this.table.rows.length;

            // Apply pending selection if table now has enough columns/rows
            if (this._pendingSelection) {
                const ps = this._pendingSelection;
                const needsCol = Math.max(ps.anchorCol, ps.selectedCol);
                const needsRow = Math.max(ps.anchorRow, ps.selectedRow);
                if ((needsCol < 0 || needsCol < colCount) && (needsRow < 0 || needsRow < rowCount)) {
                    this.selectionCtrl.selectionAnchorCol = ps.anchorCol;
                    this.selectionCtrl.selectedCol = ps.selectedCol;
                    this.selectionCtrl.selectionAnchorRow = ps.anchorRow;
                    this.selectionCtrl.selectedRow = ps.selectedRow;
                    this._pendingSelection = null;
                }
            }

            if (this.selectionCtrl.selectedCol !== -2 && this.selectionCtrl.selectedCol >= colCount) {
                this.selectionCtrl.selectedCol = Math.max(0, colCount - 1);
            }
            if (this.selectionCtrl.selectionAnchorCol !== -2 && this.selectionCtrl.selectionAnchorCol >= colCount) {
                this.selectionCtrl.selectionAnchorCol = Math.max(0, colCount - 1);
            }
            if (
                this.selectionCtrl.selectedRow !== -2 &&
                this.selectionCtrl.selectedRow !== -1 &&
                this.selectionCtrl.selectedRow > rowCount
            ) {
                this.selectionCtrl.selectedRow = rowCount;
            }
        }
    }

    private _getColumnTemplate(colCount: number) {
        let template = '30px';
        for (let i = 0; i < colCount; i++) {
            const width = this.resizeCtrl.colWidths[i];
            template += width ? ` ${width}px` : ' 100px';
        }
        return template;
    }

    updated(_changedProperties: PropertyValues) {
        if (this._restoreCaretPos !== null) {
            const cell = this.shadowRoot?.querySelector('.cell.editing');
            if (cell) {
                // Removed firstChild check, _setCaretPosition handles it
                try {
                    (cell as HTMLElement).focus(); // Ensure focus
                    this.focusCtrl.setCaretPosition(cell, this._restoreCaretPos);
                } catch (e) {
                    console.warn('Failed to restore caret:', e);
                }
            }
            this._restoreCaretPos = null;
            this._shouldFocusCell = false; // Prevent focus override
        }

        // Focus Retention Logic
        // Focus Retention Logic
        if (this._shouldFocusCell) {
            const view = this.shadowRoot?.querySelector('spreadsheet-table-view');
            if (view) {
                (view as LitElement).updateComplete.then(() => {
                    setTimeout(() => {
                        this.focusCtrl.focusSelectedCell();
                    }, 0);
                });
            }
            this._shouldFocusCell = false;
            this._wasFocusedBeforeUpdate = false;
        } else if (this._wasFocusedBeforeUpdate) {
            const view = this.shadowRoot?.querySelector('spreadsheet-table-view');
            if (view) {
                (view as LitElement).updateComplete.then(() => {
                    setTimeout(() => {
                        this.focusCtrl.focusSelectedCell();
                    }, 0);
                });
            }
            this._wasFocusedBeforeUpdate = false;
        }

        // Dispatch selection-change event if selected column changed
        // Skip on first render to prevent toolbar from showing active state on initial load
        const currentCol = this.selectionCtrl.selectedCol;
        if (this._hasRenderedOnce && currentCol !== this._lastSelectedCol) {
            this._lastSelectedCol = currentCol;
            this.dispatchEvent(
                new CustomEvent('selection-change', {
                    detail: {
                        sheetIndex: this.sheetIndex,
                        tableIndex: this.tableIndex,
                        selectedCol: currentCol
                    },
                    bubbles: true,
                    composed: true
                })
            );
        }
        this._hasRenderedOnce = true;
    }

    // Existing Focus Listeners
    private _handleFocusIn = () => {
        (window as unknown as { activeSpreadsheetTable: SpreadsheetTable }).activeSpreadsheetTable = this;
    };

    // Handle insert-value-at-selection events (e.g., date/time shortcuts from extension)
    private _handleInsertValueAtSelection = (e: CustomEvent<{ value: string }>) => {
        // Only handle if this table is the active one (prevents multi-table insertion)
        const activeTable = (window as unknown as { activeSpreadsheetTable: SpreadsheetTable }).activeSpreadsheetTable;
        if (activeTable !== this) return;

        const { value } = e.detail;
        const row = this.selectionCtrl.selectedRow;
        const col = this.selectionCtrl.selectedCol;

        // Only insert if we have a valid cell selection (not row/col header selection)
        if (row >= -1 && col >= 0) {
            // Dispatch to window so GlobalEventController can pick it up
            window.dispatchEvent(
                new CustomEvent('cell-edit', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        sheetIndex: this.sheetIndex,
                        tableIndex: this.tableIndex,
                        rowIndex: row,
                        colIndex: col,
                        newValue: value
                    }
                })
            );
        }
    };

    // Handle insert-copied-cells-at-selection events (Ctrl+Shift+= from extension)
    private _handleInsertCopiedCellsAtSelection = () => {
        // Only handle if this table is the active one (prevents multi-table insertion)
        const activeTable = (window as unknown as { activeSpreadsheetTable: SpreadsheetTable }).activeSpreadsheetTable;
        if (activeTable !== this) return;

        const { clipboardCtrl, selectionCtrl } = this;

        // Only works when something is copied
        if (!clipboardCtrl.copiedData) {
            return;
        }

        // Row selection: insert copied rows above
        if (selectionCtrl.selectedCol === -2 && selectionCtrl.selectedRow >= 0) {
            if (clipboardCtrl.copyType === 'rows') {
                const copiedRowCount = clipboardCtrl.copiedData.length;
                const insertAt = selectionCtrl.selectedRow; // 'above' = same index
                clipboardCtrl.insertCopiedRows(selectionCtrl.selectedRow, 'above');

                // Store pending selection - same as context menu
                if (copiedRowCount > 0) {
                    const endRow = insertAt + copiedRowCount - 1;
                    this._pendingSelection = {
                        anchorRow: endRow,
                        selectedRow: insertAt,
                        anchorCol: -2,
                        selectedCol: -2
                    };
                }
            }
            return;
        }

        // Column selection: insert copied columns to the right
        if (selectionCtrl.selectedRow === -2 && selectionCtrl.selectedCol >= 0) {
            if (clipboardCtrl.copyType === 'columns') {
                const copiedColCount = clipboardCtrl.copiedData[0]?.length || 0;
                const insertAt = selectionCtrl.selectedCol + 1; // 'right' = index + 1
                clipboardCtrl.insertCopiedColumns(selectionCtrl.selectedCol, 'right');

                // Store pending selection - same as context menu
                if (copiedColCount > 0) {
                    const endCol = insertAt + copiedColCount - 1;
                    this._pendingSelection = {
                        anchorRow: -2,
                        selectedRow: -2,
                        anchorCol: insertAt,
                        selectedCol: endCol
                    };
                }
            }
            return;
        }
    };

    // Delegate to RowVisibilityController
    get visibleRowIndices(): number[] {
        return this.rowVisibilityCtrl.visibleRowIndices;
    }

    // Wrapper for backward compatibility (used by NavigationController)
    getNextVisibleRowIndex(currentDataRowIndex: number, delta: number): number {
        const ghostRowIndex = this.table ? this.table.rows.length : -1;
        return this.rowVisibilityCtrl.getNextVisibleRowIndex(currentDataRowIndex, delta, ghostRowIndex);
    }

    connectedCallback() {
        super.connectedCallback();
        // MouseMove/Up handled by SelectionController
        // Register focus tracker
        this.addEventListener('focusin', this._handleFocusIn);
        // Listen for insert-value-at-selection events (from extension commands like date/time shortcuts)
        window.addEventListener('insert-value-at-selection', this._handleInsertValueAtSelection as EventListener);
        // Listen for insert-copied-cells-at-selection events (from extension Ctrl+Shift+= shortcut)
        window.addEventListener(
            'insert-copied-cells-at-selection',
            this._handleInsertCopiedCellsAtSelection as EventListener
        );
        // Listen for clipboard store changes for cross-table copy/paste
        ClipboardStore.addEventListener('change', this._handleClipboardStoreChange);
    }

    /**
     * Helper to get the View component's shadow root.
     * This is where the cells actually live.
     */
    get viewShadowRoot(): ShadowRoot | null {
        return this.shadowRoot?.querySelector('spreadsheet-table-view')?.shadowRoot || null;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('focusin', this._handleFocusIn);
        window.removeEventListener('insert-value-at-selection', this._handleInsertValueAtSelection as EventListener);
        window.removeEventListener(
            'insert-copied-cells-at-selection',
            this._handleInsertCopiedCellsAtSelection as EventListener
        );
        ClipboardStore.removeEventListener('change', this._handleClipboardStoreChange);
    }

    /**
     * Handle ClipboardStore change event: re-render to update context menu options
     */
    private _handleClipboardStoreChange = () => {
        this.requestUpdate();
    };

    /**
     * Commits the current edit if one is active.
     * Call this before changing cell selection to ensure edits are saved.
     */
    public async commitEdit(e: Event) {
        if (this._isCommitting) return;
        // Guard: Do not commit if we are not in edit mode (prevent ghost commits from stale events)
        if (!this.editCtrl.isEditing && !this.editCtrl.isReplacementMode) return;

        this._isCommitting = true;

        try {
            const target = e.target as HTMLElement;
            // Use View's shadowRoot since cells are in the View component
            const view = this.shadowRoot?.querySelector('spreadsheet-table-view');
            const viewShadowRoot = view?.shadowRoot ?? null;
            const result = findEditingCell(
                target,
                viewShadowRoot,
                this.selectionCtrl.selectedRow,
                this.selectionCtrl.selectedCol
            );
            if (!result) return;

            const { cell, row: editRow, col: editCol } = result;
            const contentSpan = cell.querySelector('.cell-content') as HTMLElement;
            let newValue = '';

            // Use tracked value (updated via input events) as primary source
            // This avoids issues with contenteditable phantom BR elements
            if (this.editCtrl.trackedValue !== null) {
                newValue = this.editCtrl.trackedValue;
            } else {
                // Fallback to DOM parsing if trackedValue is not available
                const targetEl = contentSpan || cell;
                newValue = getDOMText(targetEl);
                // Normalize content (strip trailing newlines, handle empty content)
                newValue = normalizeEditContent(newValue, this.editCtrl.hasUserInsertedNewline);
            }

            // In replacement mode, pendingEditValue is the authoritative value.
            // DOM may be empty or stale due to timing between mousedown and commit.
            // In non-replacement mode (dblclick), DOM is authoritative - user edits are preserved.
            if (this.editCtrl.isReplacementMode && this.editCtrl.pendingEditValue !== null) {
                newValue = normalizeEditContent(this.editCtrl.pendingEditValue, this.editCtrl.hasUserInsertedNewline);
            }

            if (this.table && editCol >= 0) {
                // Optimistic Update
                if (editRow === -1) {
                    if (this.table.headers && editCol < this.table.headers.length) {
                        this.table.headers[editCol] = newValue;
                    }
                } else if (editRow >= 0 && editRow < this.table.rows.length) {
                    if (editCol < this.table.rows[editRow].length) {
                        this.table.rows[editRow][editCol] = newValue;
                    }
                } else if (editRow === this.table.rows.length) {
                    // Ghost row: Only add a new row if the value is non-empty
                    if (newValue.trim() !== '') {
                        const width = this.table.headers ? this.table.headers.length : this.table.rows[0]?.length || 0;
                        const newRow = new Array(width).fill('');
                        if (editCol < width) newRow[editCol] = newValue;
                        // Use immutable update to trigger Lit re-render
                        this.table = { ...this.table, rows: [...this.table.rows, newRow] };
                    } else {
                        // Empty value on ghost row: just cancel editing, don't add row
                        this.editCtrl.cancelEditing();
                        this._isCommitting = false;
                        return;
                    }
                }
                this.requestUpdate();

                // Dispatch update
                this.dispatchEvent(
                    new CustomEvent('cell-edit', {
                        detail: {
                            sheetIndex: this.sheetIndex,
                            tableIndex: this.tableIndex,
                            rowIndex: editRow,
                            colIndex: editCol,
                            newValue: newValue
                        },
                        bubbles: true,
                        composed: true
                    })
                );
                this.editCtrl.cancelEditing(); // Reset state
                this.focusCell();
            }
        } finally {
            this._isCommitting = false;
        }
    }

    /**
     * Handle opening the validation dialog from context menu.
     */
    private _handleOpenValidationDialog = (e: CustomEvent<{ index: number }>) => {
        const colIndex = e.detail.index;
        // Get current validation rule from visual metadata
        const meta = this.table?.metadata as TableMetadata | undefined;
        const visual = meta?.visual;
        const validation = visual?.validation;
        const currentRule = validation?.[colIndex.toString()] || null;
        this.validationDialog = { colIndex, currentRule };
        this.contextMenu = null; // Close context menu
    };

    /**
     * Handle validation rule update from dialog.
     */
    private _handleValidationUpdate = (e: CustomEvent<{ colIndex: number; rule: ValidationRule | null }>) => {
        const { colIndex, rule } = e.detail;
        // Dispatch event to window for GlobalEventController
        window.dispatchEvent(
            new CustomEvent('validation-update', {
                detail: {
                    sheetIndex: this.sheetIndex,
                    tableIndex: this.tableIndex,
                    colIndex,
                    rule
                }
            })
        );
        this.validationDialog = null;
    };

    /**
     * Handle closing validation dialog.
     */
    private _handleValidationDialogClose = () => {
        this.validationDialog = null;
    };

    /**
     * Handle opening the formula dialog from context menu.
     */
    private _handleOpenFormulaDialog = (e: CustomEvent<{ index: number }>) => {
        const colIndex = e.detail.index;
        // Get current formula from visual metadata
        const meta = this.table?.metadata as TableMetadata | undefined;
        const visual = meta?.visual;
        const formulas = visual?.formulas;
        const currentFormula = formulas?.[colIndex.toString()] || null;
        this.formulaDialog = { colIndex, currentFormula };
        this.contextMenu = null; // Close context menu
    };

    /**
     * Handle formula update from dialog.
     */
    private _handleFormulaUpdate = (
        e: CustomEvent<{
            colIndex: number;
            formula: FormulaDefinition | null;
            sourceTableMetadata?: { sheetIndex: number; tableIndex: number; visual: unknown } | null;
        }>
    ) => {
        const { colIndex, formula, sourceTableMetadata } = e.detail;
        // Dispatch event to window for GlobalEventController
        window.dispatchEvent(
            new CustomEvent('formula-update', {
                detail: {
                    sheetIndex: this.sheetIndex,
                    tableIndex: this.tableIndex,
                    colIndex,
                    formula,
                    sourceTableMetadata
                }
            })
        );
        this.formulaDialog = null;
    };

    /**
     * Handle closing formula dialog.
     */
    private _handleFormulaDialogClose = () => {
        this.formulaDialog = null;
    };

    /**
     * Calculate the selection range boundaries based on current selection state.
     * Delegates to SelectionController for the actual logic.
     */
    private _getSelectionRange(): SelectionRange {
        const table = this.table;
        if (!table) return { minR: -1, maxR: -1, minC: -1, maxC: -1 };

        const numRows = table.rows.length || 1;
        const numCols = table.headers ? table.headers.length : table.rows[0]?.length || 0;
        return this.selectionCtrl.getSelectionRange(numRows, numCols);
    }

    render() {
        if (!this.table) return html``;
        const table = this.table;

        const { minR, maxR, minC, maxC } = this._getSelectionRange();
        const editState = {
            isEditing: this.editCtrl.isEditing,
            pendingEditValue: this.editCtrl.pendingEditValue
        };

        // Build filter menu state from FilterController
        // Get hiddenValues from metadata to ensure sync on Undo/reopen
        const getHiddenValuesFromMetadata = (colIndex: number): string[] => {
            const visual = (table.metadata?.['visual'] as Record<string, unknown>) || {};
            const filters = (visual.filters as Record<string, string[]>) || {};
            return filters[colIndex.toString()] || [];
        };

        const filterMenu = this.filterCtrl.activeFilterMenu
            ? {
                  x: this.filterCtrl.activeFilterMenu.x,
                  y: this.filterCtrl.activeFilterMenu.y,
                  col: this.filterCtrl.activeFilterMenu.colIndex,
                  values: this.filterCtrl.getUniqueValues(this.filterCtrl.activeFilterMenu.colIndex),
                  hiddenValues: getHiddenValuesFromMetadata(this.filterCtrl.activeFilterMenu.colIndex)
              }
            : null;

        return html`
            <spreadsheet-table-view
                .table="${table}"
                .visibleRowIndices="${this.rowVisibilityCtrl.visibleRowIndices}"
                .columnWidths="${this.resizeCtrl.colWidths}"
                .selectedRow="${this.selectionCtrl.selectedRow}"
                .selectedCol="${this.selectionCtrl.selectedCol}"
                .selectionRange="${{ minR, maxR, minC, maxC }}"
                .editState="${editState}"
                .contextMenu="${this.contextMenu}"
                .filterMenu="${filterMenu}"
                .resizingCol="${this.resizeCtrl.resizingCol}"
                .rowCount="${table.rows.length}"
                .isDragging="${this.dragCtrl.isDragging}"
                .dragType="${this.dragCtrl.dragType}"
                .dropTargetIndex="${this.dragCtrl.dropTargetIndex}"
                .cellDropRow="${this.dragCtrl.cellDropRow}"
                .cellDropCol="${this.dragCtrl.cellDropCol}"
                .dragSourceRange="${this.dragCtrl.sourceRange}"
                .dateFormat="${this.dateFormat}"
                .sheetIndex="${this.sheetIndex}"
                .tableIndex="${this.tableIndex}"
                .copiedRange="${this.clipboardCtrl.copiedRange}"
                .copyType="${this.clipboardCtrl.copyType}"
                @view-insert-row="${this.eventCtrl.handleInsertRow}"
                @view-delete-row="${this.eventCtrl.handleDeleteRow}"
                @view-insert-col="${this.eventCtrl.handleInsertCol}"
                @view-delete-col="${this.eventCtrl.handleDeleteCol}"
                @view-insert-copied-rows="${(e: CustomEvent<{ index: number; position: string }>) => {
                    const copiedRowCount = this.clipboardCtrl.copiedData?.length || 0;
                    const insertAt = e.detail.position === 'below' ? e.detail.index + 1 : e.detail.index;
                    this.clipboardCtrl.insertCopiedRows(e.detail.index, e.detail.position as 'above' | 'below');
                    // Store pending selection - will be applied in willUpdate when table has enough rows
                    if (copiedRowCount > 0) {
                        const endRow = insertAt + copiedRowCount - 1;
                        this._pendingSelection = {
                            anchorRow: endRow,
                            selectedRow: insertAt,
                            anchorCol: -2,
                            selectedCol: -2
                        };
                    }
                    this.contextMenu = null;
                }}"
                @view-insert-copied-cols="${(e: CustomEvent<{ index: number; position: string }>) => {
                    const copiedColCount = this.clipboardCtrl.copiedData?.[0]?.length || 0;
                    const insertAt = e.detail.position === 'right' ? e.detail.index + 1 : e.detail.index;
                    this.clipboardCtrl.insertCopiedColumns(e.detail.index, e.detail.position as 'left' | 'right');
                    // Store pending selection - will be applied in willUpdate when table has enough cols
                    if (copiedColCount > 0) {
                        const endCol = insertAt + copiedColCount - 1;
                        this._pendingSelection = {
                            anchorRow: -2,
                            selectedRow: -2,
                            anchorCol: insertAt,
                            selectedCol: endCol
                        };
                    }
                    this.contextMenu = null;
                }}"
                @view-menu-close="${() => {
                    this.contextMenu = null;
                }}"
                @view-filter-apply="${this.eventCtrl.handleFilterApply}"
                @view-filter-close="${this.eventCtrl.handleFilterClose}"
                @view-col-click="${this.eventCtrl.handleColClick}"
                @view-col-mousedown="${this.eventCtrl.handleColMousedown}"
                @view-col-dblclick="${this.eventCtrl.handleColDblclick}"
                @view-col-contextmenu="${this.eventCtrl.handleColContextMenu}"
                @view-col-input="${this.eventCtrl.handleColInput}"
                @view-col-blur="${this.eventCtrl.handleColBlur}"
                @view-col-keydown="${this.eventCtrl.handleColKeydown}"
                @view-row-click="${this.eventCtrl.handleRowClick}"
                @view-row-mousedown="${this.eventCtrl.handleRowMousedown}"
                @view-row-contextmenu="${this.eventCtrl.handleRowContextMenu}"
                @view-row-keydown="${this.eventCtrl.handleRowKeydown}"
                @view-cell-click="${this.eventCtrl.handleCellClick}"
                @view-cell-mousedown="${this.eventCtrl.handleCellMousedown}"
                @view-cell-dblclick="${this.eventCtrl.handleCellDblclick}"
                @view-cell-input="${this.eventCtrl.handleCellInput}"
                @view-cell-blur="${this.eventCtrl.handleCellBlur}"
                @view-cell-keydown="${this.eventCtrl.handleCellKeydown}"
                @view-cell-mousemove="${this.eventCtrl.handleCellMousemove}"
                @view-corner-click="${this.eventCtrl.handleCornerClick}"
                @view-corner-keydown="${this.eventCtrl.handleCornerKeydown}"
                @view-corner-contextmenu="${this.eventCtrl.handleCornerContextMenu}"
                @view-filter-click="${this.eventCtrl.handleFilterClick}"
                @view-resize-start="${this.eventCtrl.handleResizeStart}"
                @ss-metadata-change="${this.eventCtrl.handleMetadataChange}"
                @view-sort="${this.filterCtrl.handleSort}"
                @view-filter-change="${this.filterCtrl.handleFilterChange}"
                @view-clear-filter="${this.filterCtrl.handleClearFilter}"
                @view-data-validation="${this._handleOpenValidationDialog}"
                @view-formula-column="${this._handleOpenFormulaDialog}"
                @view-formula-click="${(e: CustomEvent<{ col: number }>) =>
                    this._handleOpenFormulaDialog(
                        new CustomEvent('ss-formula-click', { detail: { index: e.detail.col } })
                    )}"
                @view-cell-contextmenu="${this.eventCtrl.handleCellContextMenu}"
                @view-copy="${() => {
                    this.clipboardCtrl.copyToClipboard();
                    this.contextMenu = null;
                }}"
                @view-cut="${async () => {
                    await this.clipboardCtrl.copyToClipboard();
                    this.editCtrl.deleteSelection();
                    this.contextMenu = null;
                }}"
                @view-paste="${async () => {
                    await this.clipboardCtrl.paste();
                    this.contextMenu = null;
                }}"
                @view-validation-input="${this.eventCtrl.handleValidationInput}"
            ></spreadsheet-table-view>
            ${this.validationDialog
                ? html`
                      <ss-validation-dialog
                          .colIndex="${this.validationDialog.colIndex}"
                          .currentRule="${this.validationDialog.currentRule}"
                          @ss-validation-update="${this._handleValidationUpdate}"
                          @ss-dialog-close="${this._handleValidationDialogClose}"
                      ></ss-validation-dialog>
                  `
                : ''}
            ${this.formulaDialog
                ? html`
                      <ss-formula-dialog
                          .colIndex="${this.formulaDialog.colIndex}"
                          .currentFormula="${this.formulaDialog.currentFormula}"
                          .headers="${this.table?.headers ?? []}"
                          .rows="${this.table?.rows ?? []}"
                          .workbook="${this.workbook}"
                          .currentSheetIndex="${this.sheetIndex}"
                          .currentTableIndex="${this.tableIndex}"
                          @ss-formula-update="${this._handleFormulaUpdate}"
                          @ss-formula-cancel="${this._handleFormulaDialogClose}"
                      ></ss-formula-dialog>
                  `
                : ''}
        `;
    }

    public handleToolbarAction(action: string) {
        this.toolbarCtrl.handleAction(action);
    }
}
