/**
 * Tests for arrow key navigation during edit mode.
 * Arrow keys should commit the current edit and navigate to adjacent cells,
 * similar to Enter/Tab behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import '../../../components/spreadsheet-table';
import { queryView, awaitView } from '../../helpers/test-helpers';
import { SpreadsheetTable, TableJSON } from '../../../components/spreadsheet-table';

function mockSelectionAt(target: HTMLElement, offset: number): Selection {
    let textNode: Node | null = null;
    for (const child of target.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            textNode = child;
            break;
        }
    }

    const range = document.createRange();
    if (textNode) {
        const clampedOffset = Math.min(offset, textNode.textContent?.length ?? 0);
        range.setStart(textNode, clampedOffset);
        range.setEnd(textNode, clampedOffset);
    } else {
        range.setStart(target, 0);
        range.setEnd(target, 0);
    }
    range.collapse(true);

    return {
        rangeCount: 1,
        getRangeAt: () => range,
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

describe('Edit Mode Arrow Key Navigation', () => {
    const createMockTable = (): TableJSON => ({
        name: 'Test Table',
        description: 'Test Description',
        headers: ['A', 'B', 'C'],
        rows: [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9']
        ],
        metadata: {},
        start_line: 0,
        end_line: 5
    });

    describe('ArrowDown in edit mode', () => {
        it('commits edit and moves down', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [1, 1]
            const cell = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);

            // Press ArrowDown
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })
            );
            await awaitView(el);

            // Should have committed and moved down
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedRow).toBe(2);
            expect(el.selectionCtrl.selectedCol).toBe(1);
        });
    });

    describe('ArrowUp in edit mode', () => {
        it('commits edit and moves up', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [2, 1]
            const cell = queryView(el, '.cell[data-row="2"][data-col="1"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);

            // Press ArrowUp
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
            await awaitView(el);

            // Should have committed and moved up
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedRow).toBe(1);
            expect(el.selectionCtrl.selectedCol).toBe(1);
        });
    });

    describe('ArrowRight in edit mode', () => {
        it('commits edit and moves right', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [1, 0]
            const cell = queryView(el, '.cell[data-row="1"][data-col="0"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);

            // Press ArrowRight
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelectionAt(editingCell, 1));
            editingCell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true })
            );
            await awaitView(el);

            // Should have committed and moved right
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedRow).toBe(1);
            expect(el.selectionCtrl.selectedCol).toBe(1);
            selectionSpy.mockRestore();
        });
    });

    describe('ArrowLeft in edit mode', () => {
        it('commits edit and moves left', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [1, 2]
            const cell = queryView(el, '.cell[data-row="1"][data-col="2"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);

            // Press ArrowLeft
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true })
            );
            await awaitView(el);

            // Should have committed and moved left
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedRow).toBe(1);
            expect(el.selectionCtrl.selectedCol).toBe(1);
        });
    });

    describe('Boundary behavior in edit mode', () => {
        it('does not move past top boundary on ArrowUp', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [0, 1]
            const cell = queryView(el, '.cell[data-row="0"][data-col="1"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            // Press ArrowUp
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }));
            await awaitView(el);

            // Should have committed but stay at row 0
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedRow).toBe(0);
        });

        it('does not move past left boundary on ArrowLeft', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Enter edit mode on cell [1, 0]
            const cell = queryView(el, '.cell[data-row="1"][data-col="0"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            // Press ArrowLeft
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true })
            );
            await awaitView(el);

            // Should have committed but stay at col 0
            expect(el.editCtrl.isEditing).toBe(false);
            expect(el.selectionCtrl.selectedCol).toBe(0);
        });
    });

    describe('Column header edit mode', () => {
        it('keeps editing when ArrowLeft is pressed in the middle of header text', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const headerContent = queryView(el, '.cell.header-col[data-col="0"] .cell-content') as HTMLElement;
            headerContent.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            const editingContent = queryView(el, '.cell.header-col.editing .cell-content') as HTMLElement;
            expect(editingContent).toBeTruthy();

            const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelectionAt(editingContent, 1));
            editingContent.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true })
            );
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);
            expect(el.selectionCtrl.selectedRow).toBe(-1);
            expect(el.selectionCtrl.selectedCol).toBe(0);

            selectionSpy.mockRestore();
        });

        it('keeps editing when ArrowUp or ArrowDown is pressed in a header', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const headerContent = queryView(el, '.cell.header-col[data-col="0"] .cell-content') as HTMLElement;
            headerContent.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            const editingContent = queryView(el, '.cell.header-col.editing .cell-content') as HTMLElement;
            const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelectionAt(editingContent, 1));

            editingContent.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })
            );
            editingContent.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true })
            );
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);
            expect(el.selectionCtrl.selectedRow).toBe(-1);
            expect(el.selectionCtrl.selectedCol).toBe(0);

            selectionSpy.mockRestore();
        });

        it('does not override browser caret placement when clicking the edited header', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const headerContent = queryView(el, '.cell.header-col[data-col="0"] .cell-content') as HTMLElement;
            headerContent.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            const focusSpy = vi.spyOn(el, 'focusCell');
            const editingHeader = queryView(el, '.cell.header-col.editing') as HTMLElement;
            editingHeader.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
            editingHeader.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);
            expect(focusSpy).not.toHaveBeenCalled();
            focusSpy.mockRestore();
        });
    });

    describe('Data cell edit mode click handling', () => {
        it('does not override browser caret placement when clicking the edited cell', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const cell = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            await awaitView(el);

            const focusSpy = vi.spyOn(el, 'focusCell');
            const editingCell = queryView(el, '.cell.editing') as HTMLElement;
            editingCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
            editingCell.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
            await awaitView(el);

            expect(el.editCtrl.isEditing).toBe(true);
            expect(focusSpy).not.toHaveBeenCalled();
            focusSpy.mockRestore();
        });
    });
});
