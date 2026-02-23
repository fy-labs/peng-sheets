/**
 * SpreadsheetService Tests (TypeScript Implementation)
 *
 * Tests the TypeScript-based SpreadsheetService which wraps the editor module.
 * The editor module itself is tested separately in webview-ui/tests/editor/.
 * These tests focus on the service layer behavior:
 * - Initialization
 * - Message posting to VS Code
 * - Batching behavior
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpreadsheetService } from '../../services/spreadsheet-service';
import { IVSCodeApi } from '../../services/types';
import * as editor from '../../../src/editor';

describe('SpreadsheetService (TypeScript)', () => {
    let service: SpreadsheetService;
    let mockVscode: IVSCodeApi;

    beforeEach(async () => {
        mockVscode = {
            postMessage: vi.fn(),
            getState: vi.fn(),
            setState: vi.fn()
        };

        // Initialize editor context with sample markdown
        const sampleMd = `# Tables

## Sheet1

### Products

| Name | Price |
| ---- | ----- |
| Apple | 100 |
| Banana | 200 |
`;
        editor.initializeWorkbook(sampleMd, JSON.stringify({ rootMarker: '# Tables' }));

        service = new SpreadsheetService(mockVscode);
        await service.initialize();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- Initialization Tests ---

    describe('initialization', () => {
        it('should be initialized after calling initialize()', async () => {
            const newService = new SpreadsheetService(mockVscode);
            expect(newService.isInitialized).toBe(false);

            await newService.initialize();

            expect(newService.isInitialized).toBe(true);
        });

        it('should return itself from initialize() for chaining', async () => {
            const newService = new SpreadsheetService(mockVscode);
            const result = await newService.initialize();

            expect(result).toBe(newService);
        });
    });

    // --- Operation Tests ---

    describe('operations', () => {
        it('should post message when updating a cell', async () => {
            service.updateRange(0, 0, 0, 0, 0, 0, 'Orange');

            // Wait for queue processing
            await new Promise((r) => setTimeout(r, 50));

            expect(mockVscode.postMessage).toHaveBeenCalled();
            const call = (mockVscode.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(call.content).toBeDefined();
            expect(call.startLine).toBeDefined();
        });

        it('should post message when adding a table', async () => {
            service.addTable(0, 'New Table');

            await new Promise((r) => setTimeout(r, 50));

            expect(mockVscode.postMessage).toHaveBeenCalled();
        });

        it('should post message when inserting a row', async () => {
            service.insertRow(0, 0, 1);

            await new Promise((r) => setTimeout(r, 50));

            expect(mockVscode.postMessage).toHaveBeenCalled();
        });

        it('should post message when deleting rows', async () => {
            service.deleteRows(0, 0, [0]);

            await new Promise((r) => setTimeout(r, 50));

            expect(mockVscode.postMessage).toHaveBeenCalled();
        });
    });

    // --- Batching Tests ---

    describe('batching', () => {
        it('should not post messages during batch', async () => {
            service.startBatch();

            // Use updateRangeBatch for explicit batch control (updateRange manages its own batch)
            service.updateRangeBatch(0, 0, 0, 0, 'Value1');
            service.updateRangeBatch(0, 0, 1, 0, 'Value2');

            await new Promise((r) => setTimeout(r, 50));

            // No messages should be posted during batch
            expect(mockVscode.postMessage).not.toHaveBeenCalled();
        });

        it('should post single message with final update when batch ends', async () => {
            service.startBatch();

            // Use updateRangeBatch for explicit batch control (updateRange manages its own batch)
            service.updateRangeBatch(0, 0, 0, 0, 'Value1');
            service.updateRangeBatch(0, 0, 1, 0, 'Value2');

            await new Promise((r) => setTimeout(r, 50));

            service.endBatch();

            // Should send a single updateRange message with the final cumulative update
            const calls = (mockVscode.postMessage as ReturnType<typeof vi.fn>).mock.calls;
            expect(calls.length).toBe(1);

            const message = calls[0][0];
            expect(message.type).toBe('updateRange');
            // Final update should have both undo stops
            expect(message.undoStopBefore).toBe(true);
            expect(message.undoStopAfter).toBe(true);
        });
    });

    // --- State Query Tests ---

    describe('initializeWorkbook', () => {
        it('should return state after initialization', async () => {
            const sampleMd = `# Tables

## Sheet1

### Table1

| A | B |
| - | - |
| 1 | 2 |
`;
            const state = await service.initializeWorkbook(sampleMd, { rootMarker: '# Tables' });

            expect(state).toBeDefined();
            expect(state.workbook).toBeDefined();
            expect(state.workbook.sheets).toBeDefined();
        });

        it('should return structure in state', async () => {
            const sampleMd = `# Tables

## Sheet1

### Table1

| A | B |
| - | - |
| 1 | 2 |
`;
            const state = await service.initializeWorkbook(sampleMd, { rootMarker: '# Tables' });

            expect(state.structure).toBeDefined();
        });
    });
});
