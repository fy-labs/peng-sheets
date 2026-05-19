/**
 * Cursor Position Edit Tests - Issue #14
 *
 * Reproduces the bug where Backspace/Delete/insertText ignore cursor position
 * and always operate on the end of the string.
 *
 * These tests MUST FAIL before the fix is applied (TDD per DEVELOPMENT.md §6.9.1).
 *
 * Bug mechanism:
 * - event-controller.ts handleInput L668-672: `trackedValue.slice(0, -1)` always removes last char
 * - event-controller.ts handleInput L655-657: `currentValue + inputEvent.data` always appends at end
 * - event-controller.ts L757-766: caret restored to lastChild (always end) after DOM sync
 */
import { describe, it, expect, vi } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import { SpreadsheetTable } from '../../../components/spreadsheet-table';
import '../../../components/spreadsheet-table';
import { awaitView, queryView } from '../../helpers/test-helpers';

/**
 * Build a mock selection whose anchor/focus sit at offset `offset`
 * within the text content of `target`.
 *
 * We position the selection inside the first text node found, which is how
 * the browser reports a collapsed caret in a contenteditable element.
 *
 * For the purposes of these tests, the target element contains plain text
 * (no <br> nodes) so one text node covers the full content.
 */
function mockSelectionAt(target: HTMLElement, offset: number): Selection {
    // Find the text node inside target (first one)
    let textNode: Node | null = null;
    for (const child of target.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            textNode = child;
            break;
        }
    }

    const range = document.createRange();
    if (textNode) {
        const clampedOffset = Math.min(offset, (textNode.textContent || '').length);
        range.setStart(textNode, clampedOffset);
        range.setEnd(textNode, clampedOffset);
    } else {
        range.setStart(target, 0);
        range.setEnd(target, 0);
    }
    range.collapse(true);

    return {
        rangeCount: 1,
        getRangeAt: (_i: number) => range,
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
        deleteFromDocument: vi.fn(),
        anchorNode: range.startContainer,
        anchorOffset: range.startOffset,
        focusNode: range.endContainer,
        focusOffset: range.endOffset,
        isCollapsed: true
    } as unknown as Selection;
}

/**
 * Fire a synthetic input event on the editing cell that simulates a browser
 * input event for a given inputType and optional data string.
 *
 * After the event, the browser has already updated the DOM. We simulate this
 * by directly manipulating cell.textContent before dispatching the event so
 * that getDOMText reads the post-input DOM state.
 */
function dispatchInputEvent(
    el: SpreadsheetTable,
    cell: HTMLElement,
    inputType: string,
    data: string | null,
    postInputText: string,
    caretOffsetAfter: number
): void {
    // Simulate browser having updated DOM (browser does this before firing 'input')
    cell.textContent = postInputText;

    // Mock selection at the post-input caret position
    const sel = mockSelectionAt(cell, caretOffsetAfter);

    // Install selection mock on window (used by getCaretOffsetInElement)
    vi.spyOn(window, 'getSelection').mockReturnValue(sel);

    // Also install on shadowRoot (used by getEditSelection helper)
    if (el.shadowRoot) {
        (el.shadowRoot as unknown as { getSelection: () => Selection }).getSelection = () => sel;
    }
    // Install on viewShadowRoot too if available
    const viewShadowRoot = el.viewShadowRoot;
    if (viewShadowRoot) {
        (viewShadowRoot as unknown as { getSelection: () => Selection }).getSelection = () => sel;
    }

    // Create the InputEvent and patch its target to be the cell element.
    // In a real browser, InputEvent.target is set automatically when the event is dispatched
    // on the cell. In jsdom tests, we create the event manually and override target.
    const event = new InputEvent('input', {
        inputType,
        data,
        bubbles: true,
        composed: true,
        cancelable: true
    });
    Object.defineProperty(event, 'target', { value: cell, writable: false, configurable: true });

    // Dispatch via handleCellInput pathway to simulate real event flow
    // (matches production: ss-data-cell emits ss-cell-input → view-cell-input → handleCellInput → handleInput)
    el.eventCtrl.handleCellInput(
        new CustomEvent('view-cell-input', {
            detail: {
                row: 0,
                col: 0,
                target: cell,
                originalEvent: event
            }
        })
    );
}

describe('Cursor Position Edit (Issue #14)', () => {
    const baseTable = {
        name: 'Test',
        description: '',
        headers: ['A'],
        rows: [['ABCDE']],
        metadata: {},
        start_line: 0,
        end_line: 0
    };

    async function setupEditing(initialValue: string) {
        const el = await fixture<SpreadsheetTable>(html`<spreadsheet-table></spreadsheet-table>`);
        el.table = { ...baseTable, rows: [[initialValue]] };
        await awaitView(el);

        el.selectionCtrl.selectedRow = 0;
        el.selectionCtrl.selectedCol = 0;
        el.editCtrl.startEditing(initialValue);
        await awaitView(el);

        const cell = queryView(el, '.cell.editing') as HTMLElement;
        expect(cell).toBeTruthy();

        return { el, cell };
    }

    it('a. Backspace at middle: removes char before cursor, caret stays at offset', async () => {
        // "ABCDE" with caret at offset 3 (after 'C'), Backspace → "ABDE", caret at 2
        const { el, cell } = await setupEditing('ABCDE');

        // Initialize trackedCaretStart/End to match the initial caret position
        // (In real browser, user clicks to position caret at 3)
        el.editCtrl.trackedCaretStart = 3;
        el.editCtrl.trackedCaretEnd = 3;

        dispatchInputEvent(el, cell, 'deleteContentBackward', null, 'ABDE', 2);

        expect(el.editCtrl.trackedValue).toBe('ABDE');
        expect(el.editCtrl.trackedCaretStart).toBe(2);
        expect(el.editCtrl.trackedCaretEnd).toBe(2);
    });

    it('b. Delete at middle: removes char after cursor, caret stays at same offset', async () => {
        // "ABCDE" with caret at offset 2 (after 'B'), Delete → "ABDE", caret stays at 2
        const { el, cell } = await setupEditing('ABCDE');

        el.editCtrl.trackedCaretStart = 2;
        el.editCtrl.trackedCaretEnd = 2;

        dispatchInputEvent(el, cell, 'deleteContentForward', null, 'ABDE', 2);

        expect(el.editCtrl.trackedValue).toBe('ABDE');
        expect(el.editCtrl.trackedCaretStart).toBe(2);
        expect(el.editCtrl.trackedCaretEnd).toBe(2);
    });

    it('c. insertText at middle: inserts at cursor, caret advances past inserted char', async () => {
        // "ABCE" with caret at offset 3 (after 'C'), type 'D' → "ABCDE", caret at 4
        const { el, cell } = await setupEditing('ABCE');

        el.editCtrl.trackedCaretStart = 3;
        el.editCtrl.trackedCaretEnd = 3;

        dispatchInputEvent(el, cell, 'insertText', 'D', 'ABCDE', 4);

        expect(el.editCtrl.trackedValue).toBe('ABCDE');
        expect(el.editCtrl.trackedCaretStart).toBe(4);
        expect(el.editCtrl.trackedCaretEnd).toBe(4);
    });

    it('d. Backspace at start: no change to trackedValue', async () => {
        // "ABCDE" with caret at offset 0, Backspace → "ABCDE" (no change), caret at 0
        const { el, cell } = await setupEditing('ABCDE');

        el.editCtrl.trackedCaretStart = 0;
        el.editCtrl.trackedCaretEnd = 0;

        // Browser would not delete anything at offset 0, DOM unchanged
        dispatchInputEvent(el, cell, 'deleteContentBackward', null, 'ABCDE', 0);

        expect(el.editCtrl.trackedValue).toBe('ABCDE');
        expect(el.editCtrl.trackedCaretStart).toBe(0);
    });

    it('e. Delete at end: no change to trackedValue', async () => {
        // "ABCDE" with caret at end (offset 5), Delete → "ABCDE" (no change), caret at 5
        const { el, cell } = await setupEditing('ABCDE');

        el.editCtrl.trackedCaretStart = 5;
        el.editCtrl.trackedCaretEnd = 5;

        dispatchInputEvent(el, cell, 'deleteContentForward', null, 'ABCDE', 5);

        expect(el.editCtrl.trackedValue).toBe('ABCDE');
        expect(el.editCtrl.trackedCaretStart).toBe(5);
    });

    it('g. empty cell + insertText: value becomes the inserted char, caret at 1', async () => {
        // Risk R1: empty cell (trackedValue === '') with insertText (data='X')
        // → trackedValue === 'X', caret at 1
        const { el, cell } = await setupEditing('');

        el.editCtrl.trackedCaretStart = 0;
        el.editCtrl.trackedCaretEnd = 0;

        dispatchInputEvent(el, cell, 'insertText', 'X', 'X', 1);

        expect(el.editCtrl.trackedValue).toBe('X');
        expect(el.editCtrl.trackedCaretStart).toBe(1);
        expect(el.editCtrl.trackedCaretEnd).toBe(1);
    });

    it('h. BR-containing string: Backspace just after newline removes it', async () => {
        // Risk R1: 'A\nB' (DOM: A<br>B), caret at offset 2 (just after \n),
        // Backspace → 'AB', caret at 1
        const { el, cell } = await setupEditing('A\nB');

        el.editCtrl.trackedCaretStart = 2;
        el.editCtrl.trackedCaretEnd = 2;

        // Browser removes the BR: DOM becomes 'AB' (plain text node)
        dispatchInputEvent(el, cell, 'deleteContentBackward', null, 'AB', 1);

        expect(el.editCtrl.trackedValue).toBe('AB');
        expect(el.editCtrl.trackedCaretStart).toBe(1);
        expect(el.editCtrl.trackedCaretEnd).toBe(1);
    });

    it('f. column header: handleColInput uses same cursor-position-aware logic', async () => {
        // Column header editing via handleColInput should also respect cursor position
        const el = await fixture<SpreadsheetTable>(html`<spreadsheet-table></spreadsheet-table>`);
        el.table = {
            name: 'Test',
            description: '',
            headers: ['ABCDE'],
            rows: [['']],
            metadata: {},
            start_line: 0,
            end_line: 0
        };
        await awaitView(el);

        // Start editing the column header
        el.selectionCtrl.selectedRow = -1;
        el.selectionCtrl.selectedCol = 0;
        el.editCtrl.startEditing('ABCDE');
        await awaitView(el);

        // Find the editing header cell
        const headerCell = queryView(el, '.cell.header-col.editing .cell-content') as HTMLElement;
        expect(headerCell).toBeTruthy();

        // Set initial caret position in trackedCaret
        el.editCtrl.trackedCaretStart = 3;
        el.editCtrl.trackedCaretEnd = 3;

        // Simulate browser updating DOM and position selection
        headerCell.textContent = 'ABDE';
        const sel = mockSelectionAt(headerCell, 2);
        vi.spyOn(window, 'getSelection').mockReturnValue(sel);

        // Dispatch via handleColInput pathway
        el.eventCtrl.handleColInput(
            new CustomEvent('col-input', {
                detail: {
                    col: 0,
                    target: headerCell
                }
            })
        );

        expect(el.editCtrl.trackedValue).toBe('ABDE');
        expect(el.editCtrl.trackedCaretStart).toBe(2);
    });
});
