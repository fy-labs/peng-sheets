/**
 * Phase 0: Clipboard Verification Tests
 *
 * These tests verify the current copy/paste behavior in SpreadsheetTable.
 * They must pass BEFORE refactoring begins and serve as regression tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import '../../../components/spreadsheet-table';
import { queryView, awaitView } from '../../helpers/test-helpers';
import { SpreadsheetTable } from '../../../components/spreadsheet-table';
import type { TableJSON } from '../../../types';

describe('Clipboard Verification', () => {
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
        alignments: ['left', 'left', 'left'],
        start_line: 0,
        end_line: 5
    });

    let clipboardData: string = '';

    beforeEach(() => {
        // Mock clipboard API
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn((text: string) => {
                    clipboardData = text;
                    return Promise.resolve();
                }),
                readText: vi.fn(() => Promise.resolve(clipboardData))
            },
            configurable: true
        });
    });

    afterEach(() => {
        clipboardData = '';
    });

    describe('Copy', () => {
        it('copies single cell on Ctrl+C', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Select cell [1, 1] with value "5"
            const cell = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+C
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, composed: true })
            );

            // Wait for async clipboard operation
            await new Promise((r) => setTimeout(r, 50));

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('5');
        });

        it('copies range as TSV on Ctrl+C', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Select range [0,0] to [1,1]
            const cell00 = queryView(el, '.cell[data-row="0"][data-col="0"]') as HTMLElement;
            cell00.click();
            await awaitView(el);

            const cell11 = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell11.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true }));
            await awaitView(el);

            // Press Ctrl+C
            cell11.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            // TSV format: "1\t2\n4\t5"
            expect(navigator.clipboard.writeText).toHaveBeenCalled();
            const writtenText = (navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock
                .calls[0][0];
            expect(writtenText).to.include('1');
            expect(writtenText).to.include('2');
            expect(writtenText).to.include('4');
            expect(writtenText).to.include('5');
        });

        it('includes headers when column selected', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Select column 0
            const colHeader = queryView(el, '.cell.header-col[data-col="0"]') as HTMLElement;
            colHeader.click();
            await awaitView(el);

            // Press Ctrl+C
            colHeader.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(navigator.clipboard.writeText).toHaveBeenCalled();
            const writtenText = (navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock
                .calls[0][0];
            // Should include header "A" and data "1", "4", "7"
            expect(writtenText).to.include('A');
        });

        it('escapes values with newlines in TSV format', async () => {
            const table = createMockTable();
            table.rows[0][0] = 'line1\nline2';

            const el = await fixture<SpreadsheetTable>(html`<spreadsheet-table .table="${table}"></spreadsheet-table>`);
            await awaitView(el);

            // Select cell with newline
            const cell = queryView(el, '.cell[data-row="0"][data-col="0"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+C
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(navigator.clipboard.writeText).toHaveBeenCalled();
            const writtenText = (navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock
                .calls[0][0];
            // Value with newline should be quoted
            expect(writtenText).to.include('"');
        });

        it('escapes values with tabs in TSV format', async () => {
            const table = createMockTable();
            table.rows[0][0] = 'col1\tcol2';

            const el = await fixture<SpreadsheetTable>(html`<spreadsheet-table .table="${table}"></spreadsheet-table>`);
            await awaitView(el);

            // Select cell with tab
            const cell = queryView(el, '.cell[data-row="0"][data-col="0"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+C
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(navigator.clipboard.writeText).toHaveBeenCalled();
            const writtenText = (navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock
                .calls[0][0];
            // Value with tab should be quoted
            expect(writtenText).to.include('"');
        });
    });

    describe('Cut', () => {
        it('copies to clipboard and deletes cell content on Ctrl+X', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            // Select cell [1, 1] with value "5"
            const cell = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Spy on the range-edit event to verify deletion
            const editSpy = vi.fn();
            el.addEventListener('range-edit', editSpy);

            // Press Ctrl+X
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, composed: true })
            );

            // Wait for async clipboard operation and state updates
            await new Promise((r) => setTimeout(r, 50));

            // Verify copy
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('5');

            // Verify deletion (range-edit event dispatched with empty string)
            expect(editSpy).toHaveBeenCalled();
            expect(editSpy.mock.calls[0][0].detail.newValue).toBe('');
            expect(editSpy.mock.calls[0][0].detail.startRow).toBe(1);
            expect(editSpy.mock.calls[0][0].detail.startCol).toBe(1);
        });
    });

    describe('Paste', () => {
        it('pastes single value to selected cell', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const pasteSpy = vi.fn();
            el.addEventListener('paste-cells', pasteSpy);

            // Set clipboard content
            clipboardData = 'new value';

            // Select cell [1, 1]
            const cell = queryView(el, '.cell[data-row="1"][data-col="1"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+V
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(pasteSpy).toHaveBeenCalled();
            const detail = pasteSpy.mock.calls[0][0].detail;
            expect(detail.startRow).to.equal(1);
            expect(detail.startCol).to.equal(1);
            expect(detail.data).to.deep.equal([['new value']]);
        });

        it('pastes TSV range to cells', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const pasteSpy = vi.fn();
            el.addEventListener('paste-cells', pasteSpy);

            // Set clipboard content (2x2 TSV)
            clipboardData = 'a\tb\nc\td';

            // Select cell [0, 0]
            const cell = queryView(el, '.cell[data-row="0"][data-col="0"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+V
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(pasteSpy).toHaveBeenCalled();
            const detail = pasteSpy.mock.calls[0][0].detail;
            expect(detail.startRow).to.equal(0);
            expect(detail.startCol).to.equal(0);
            expect(detail.data).to.deep.equal([
                ['a', 'b'],
                ['c', 'd']
            ]);
        });

        it('handles quoted TSV with embedded newlines', async () => {
            const el = await fixture<SpreadsheetTable>(
                html`<spreadsheet-table .table="${createMockTable()}"></spreadsheet-table>`
            );
            await awaitView(el);

            const pasteSpy = vi.fn();
            el.addEventListener('paste-cells', pasteSpy);

            // Set clipboard content with quoted value containing newline
            clipboardData = '"line1\nline2"\tvalue';

            // Select cell [0, 0]
            const cell = queryView(el, '.cell[data-row="0"][data-col="0"]') as HTMLElement;
            cell.click();
            await awaitView(el);

            // Press Ctrl+V
            cell.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, composed: true })
            );

            await new Promise((r) => setTimeout(r, 50));

            expect(pasteSpy).toHaveBeenCalled();
            const detail = pasteSpy.mock.calls[0][0].detail;
            // Newline inside quoted value should be preserved
            expect(detail.data[0][0]).to.include('\n');
        });
    });
});
