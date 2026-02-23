import { ReactiveController } from 'lit';
import { SpreadsheetTable } from '../components/spreadsheet-table';
import {
    getSelection as getEditSelection,
    insertLineBreakAtSelection,
    handleBackspaceAtZWS,
    handleSelectionDeletion
} from '../utils/edit-mode-helpers';
import { isRealEnterKey } from '../utils/keyboard-utils';

export class KeyboardController implements ReactiveController {
    host: SpreadsheetTable;

    constructor(host: SpreadsheetTable) {
        this.host = host;
        host.addController(this);
    }

    hostConnected() {}
    hostDisconnected() {}

    handleKeyDown(e: KeyboardEvent) {
        if (this.host.editCtrl.isEditing) {
            this.handleEditModeKey(e);
            return;
        }

        if (e.isComposing) return;

        const isControl = e.ctrlKey || e.metaKey || e.altKey;

        // Header Edit
        if (
            this.host.selectionCtrl.selectedRow === -2 &&
            this.host.selectionCtrl.selectedCol >= 0 &&
            !isControl &&
            e.key.length === 1
        ) {
            e.preventDefault();
            this.host.selectionCtrl.selectedRow = -1;
            this.host.editCtrl.startEditing(e.key, true);
            this.host.focusCell();
            return;
        }

        const isRangeSelection =
            this.host.selectionCtrl.selectedCol === -2 || this.host.selectionCtrl.selectedRow === -2;

        // F2 - Start Editing
        if (e.key === 'F2') {
            e.preventDefault();
            if (isRangeSelection) return;

            const r = this.host.selectionCtrl.selectedRow;
            const c = this.host.selectionCtrl.selectedCol;

            // Prevent editing formula columns (except header row)
            if (r >= 0 && this.host.isFormulaColumn(c)) {
                return;
            }

            // Fetch current value
            let currentVal = '';

            // Header logic ?
            if (r === -1 && c >= 0 && this.host.table?.headers) {
                currentVal = this.host.table.headers[c] || '';
            } else if (r >= 0 && c >= 0 && this.host.table?.rows && this.host.table.rows[r]) {
                currentVal = this.host.table.rows[r][c] || '';
            }

            this.host.editCtrl.startEditing(currentVal);
            this.host.focusCell();
            return;
        }

        if (!isControl && e.key.length === 1 && !isRangeSelection) {
            // Prevent editing formula columns (except header row)
            const r = this.host.selectionCtrl.selectedRow;
            const c = this.host.selectionCtrl.selectedCol;
            if (r >= 0 && this.host.isFormulaColumn(c)) {
                e.preventDefault();
                return;
            }

            e.preventDefault();
            this.host.editCtrl.startEditing(e.key, true);
            this.host.focusCell();
            return;
        }

        // Note: Ctrl+S is handled by GlobalEventController at window level
        // Do NOT add duplicate handling here!

        // Excel-compatible date/time shortcuts
        // Ctrl + ; inserts current date, Ctrl + Shift + ; inserts current time
        if ((e.ctrlKey || e.metaKey) && e.key === ';') {
            e.preventDefault();
            const now = new Date();
            let value: string;
            if (e.shiftKey) {
                // Ctrl + Shift + ; → current time (HH:MM)
                value = now.toTimeString().slice(0, 5);
            } else {
                // Ctrl + ; → current date (YYYY-MM-DD)
                value = now.toISOString().slice(0, 10);
            }
            this.host.dispatchEvent(
                new CustomEvent('cell-change', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        row: this.host.selectionCtrl.selectedRow,
                        col: this.host.selectionCtrl.selectedCol,
                        value: value
                    }
                })
            );
            return;
        }

        if (isControl && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            this.host.clipboardCtrl.copyToClipboard();
            return;
        }

        if (isControl && (e.key === 'x' || e.key === 'X')) {
            e.preventDefault();
            this.host.clipboardCtrl.copyToClipboard().then(() => {
                this.host.editCtrl.deleteSelection();
            });
            return;
        }

        if (isControl && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            this.host.clipboardCtrl.paste();
            return;
        }

        // Ctrl+A: Select entire table (same as clicking corner cell)
        if (isControl && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            this.host.selectionCtrl.selectCell(-2, -2);
            this.host.focusCell();
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            // Request skip parse for flicker prevention (optimistic UI for delete)
            window.dispatchEvent(new CustomEvent('request-skip-parse'));
            this.host.editCtrl.deleteSelection();
            return;
        }

        // Escape clears copy range indicator
        if (e.key === 'Escape') {
            e.preventDefault();
            this.host.clipboardCtrl.clearCopiedRange();
            return;
        }

        // NOTE: Ctrl/Cmd + Shift + + (insert copied rows/columns) is handled by
        // extension command → GlobalEventController → insert-copied-cells-at-selection event
        // → SpreadsheetTable._handleInsertCopiedCellsAtSelection
        // Do NOT add duplicate handling here!

        // Nav
        const rowCount = this.host.table?.rows.length || 0;
        const colCount = this.host.table?.headers
            ? this.host.table.headers.length
            : this.host.table?.rows[0]?.length || 0;
        this.host.navCtrl.handleKeyDown(e, rowCount + 1, colCount); // +1 because we allow ghost row (rowCount)
        this.host.focusCell();
    }

    private handleEditModeKey(e: KeyboardEvent) {
        e.stopPropagation();

        // Ctrl+A (Select All) in edit mode: explicitly select all text in cell
        // Browser default might not work properly in Shadow DOM
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault(); // Take control of selection
            const root = this.host.viewShadowRoot || this.host.shadowRoot;
            const editingCell = root?.querySelector('.cell.editing') as HTMLElement | null;
            if (editingCell) {
                const selection = window.getSelection();
                if (selection) {
                    const range = document.createRange();
                    range.selectNodeContents(editingCell);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
            return;
        }

        if (isRealEnterKey(e)) {
            if (e.altKey || e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();

                // Note: getEditSelection now expects shadowRoot.
                // Since cells are in View's shadowRoot, we should ideally access View's shadowRoot.
                // But SpreadsheetTable.getShadowRoot() might return Container's.
                // However, we rely on the implementation of getEditSelection to handle it or host to provide correct root.
                // In SpreadsheetTable, this points to this.shadowRoot.
                // NOTE: We should update host to expose the relevant shadowRoot or pass it.
                // For now, using host.shadowRoot as per original code.
                // If the View is separate, host.shadowRoot might NOT find the cell if it's in View's shadow DOM.
                // But I should check if I fixed this in container-view refactoring previously?
                // The previous finding (Step 5313 in history) said:
                // "Modified _commitEdit to query the View's shadowRoot instead of the Container's shadowRoot"
                // So I should do the same here.
                // But how to get View's shadowRoot?
                // `this.host.shadowRoot?.querySelector('spreadsheet-table-view')?.shadowRoot`
                // This is ugly.
                // Impl plan: `this.host` should probably expose a helper or we accept it's complex.
                // Let's rely on `this.host.shadowRoot` for now and if it fails (it will), I'll fix it similarly to _commitEdit.
                // Wait, `getEditSelection` uses `root.getSelection()`. ShadowRoot has `getSelection`.
                // If cell is in View, selection interacts with View's shadowRoot?
                // Actually `getSelection(shadowRoot)`:
                // "Gets selection from either shadow root (if supported) or window."
                // Standard Selection API works on document level mostly unless Shadow DOM selection is specific.
                // If I use `this.host.shadowRoot` it might be fine if selection crosses boundary?
                // Use View's shadowRoot because cells are rendered there
                const root = this.host.viewShadowRoot || this.host.shadowRoot;
                const selection = getEditSelection(root);
                const element = e.target as HTMLElement;
                const inserted = insertLineBreakAtSelection(selection, element);

                // Programmatic DOM changes don't fire 'input' events, so we must
                // manually update trackedValue to preserve the intentional newline.
                // We APPEND '\n' to existing trackedValue instead of reading from DOM,
                // because DOM includes both our inserted BR AND phantom BR from contenteditable.
                if (inserted) {
                    this.host.editCtrl.hasUserInsertedNewline = true;
                    // Append newline at cursor position (simplified: append at end)
                    // TODO: For mid-content newline insertion, we'd need cursor position tracking
                    const currentValue = this.host.editCtrl.trackedValue || '';
                    this.host.editCtrl.trackedValue = currentValue + '\n';
                }
                return;
            }

            e.preventDefault();

            // Calling a public-exposed commitEdit
            this.host.commitEdit(e);

            if (!e.shiftKey) {
                this.host.selectionCtrl.selectionAnchorRow = -1;
                this.host.selectionCtrl.selectionAnchorCol = -1;
            }

            const rowCount = this.host.table?.rows.length || 0;
            const colCount = this.host.table?.headers
                ? this.host.table.headers.length
                : this.host.table?.rows[0]?.length || 0;
            this.host.navCtrl.handleKeyDown(e, rowCount + 1, colCount);
            this.host.focusCell(); // Focus new cell

            // Sync anchor
            if (!e.shiftKey) {
                this.host.selectionCtrl.selectionAnchorRow = this.host.selectionCtrl.selectedRow;
                this.host.selectionCtrl.selectionAnchorCol = this.host.selectionCtrl.selectedCol;
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();

            this.host.commitEdit(e);

            if (!e.shiftKey) {
                this.host.selectionCtrl.selectionAnchorRow = -1;
                this.host.selectionCtrl.selectionAnchorCol = -1;
            }
            const colCount = this.host.table?.headers
                ? this.host.table.headers.length
                : this.host.table?.rows[0]?.length || 0;

            // Delegate Tab wrapping to NavigationController
            this.host.navCtrl.handleTabWrap(e.shiftKey, colCount);
            this.host.focusCell();

            if (!e.shiftKey) {
                this.host.selectionCtrl.selectionAnchorRow = this.host.selectionCtrl.selectedRow;
                this.host.selectionCtrl.selectionAnchorCol = this.host.selectionCtrl.selectedCol;
            }
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            // Handle Backspace/Delete with selection spanning newlines
            // Browser's native contenteditable handling may fail with <br> elements
            const root = this.host.viewShadowRoot || this.host.shadowRoot;
            const selection = getEditSelection(root);

            // First, check for selection that spans content (applies to both keys)
            if (handleSelectionDeletion(selection)) {
                e.preventDefault();

                // Update trackedValue from the DOM after deletion
                // Note: We do NOT dispatch an input event here because:
                // 1. The DOM is already updated via deleteContents()
                // 2. Dispatching input would trigger re-render from original data, causing flicker
                // trackedValue update is sufficient for commit to work correctly
                const editingCell = root?.querySelector('.cell.editing') as HTMLElement | null;
                if (editingCell) {
                    const newValue = this.host.getDOMTextFromElement(editingCell);
                    this.host.editCtrl.trackedValue = newValue;
                }
                return;
            }

            // For Backspace only: handle ZWS + BR boundary specially
            if (e.key === 'Backspace' && handleBackspaceAtZWS(selection)) {
                e.preventDefault();
                return;
            }

            // Let browser handle normal single-character deletion
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // In edit mode: allow text selection and cursor movement within cell

            // Shift+Arrow: let browser handle text selection
            if (e.shiftKey) {
                return;
            }

            // Ctrl/Cmd+Arrow: let browser handle word-by-word movement
            if (e.ctrlKey || e.metaKey) {
                return;
            }

            // Get the editing cell's text content to determine behavior
            const root = this.host.viewShadowRoot || this.host.shadowRoot;
            const editingCell = root?.querySelector('.cell.editing') as HTMLElement | null;
            const cellText = editingCell?.textContent || '';
            const isMultiline = cellText.includes('\n') || editingCell?.querySelector('br') !== null;

            // ArrowUp/Down in multiline cells: always stay in cell (prevent accidental exit)
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isMultiline) {
                return; // Let browser handle
            }

            // Check if cursor is at boundary for committing and navigating
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const isCollapsed = range.collapsed;

                if (isCollapsed && editingCell) {
                    // ArrowLeft at position 0: commit & navigate left
                    if (e.key === 'ArrowLeft') {
                        const atStart =
                            range.startOffset === 0 &&
                            (range.startContainer === editingCell ||
                                range.startContainer === editingCell.firstChild ||
                                (range.startContainer.nodeType === Node.TEXT_NODE &&
                                    range.startContainer === editingCell.childNodes[0]));
                        if (!atStart) {
                            return; // Let browser move cursor within text
                        }
                    }

                    // ArrowRight at end of text: commit & navigate right
                    if (e.key === 'ArrowRight') {
                        const lastChild = editingCell.lastChild;
                        const atEnd =
                            (range.startContainer === editingCell &&
                                range.startOffset === editingCell.childNodes.length) ||
                            (range.startContainer === lastChild &&
                                range.startOffset === (lastChild.textContent?.length || 0)) ||
                            (range.startContainer.nodeType === Node.TEXT_NODE &&
                                range.startOffset === range.startContainer.textContent?.length &&
                                !range.startContainer.nextSibling);
                        if (!atEnd) {
                            return; // Let browser move cursor within text
                        }
                    }
                }
            }

            // At boundary or single-line ArrowUp/Down: commit edit and navigate
            e.preventDefault();

            this.host.commitEdit(e);

            const rowCount = this.host.table?.rows.length || 0;
            const colCount = this.host.table?.headers
                ? this.host.table.headers.length
                : this.host.table?.rows[0]?.length || 0;
            this.host.navCtrl.handleKeyDown(e, rowCount + 1, colCount);
            this.host.focusCell();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.host.editCtrl.cancelEditing();
            this.host.focusCell();
        }
    }

    handlePaste(e: ClipboardEvent) {
        this.host.clipboardCtrl.handlePaste(e);
    }

    handleCopy(e: ClipboardEvent) {
        this.host.clipboardCtrl.handleCopy(e);
    }

    handleCut(e: ClipboardEvent) {
        this.host.clipboardCtrl.handleCut(e);
    }
}
