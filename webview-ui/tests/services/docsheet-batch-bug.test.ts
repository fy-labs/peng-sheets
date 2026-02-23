/**
 * Accurate reproduction test for Doc Sheet save bug
 *
 * This test mocks vscode.postMessage to verify the actual messages sent
 * to VS Code, and simulates exactly how message-dispatcher.ts applies them.
 *
 * Bug: Two updateRange messages are sent - first with stale content,
 * second with new content but wrong range, causing old content to remain.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SpreadsheetService } from '../../services/spreadsheet-service';

describe('DocSheet Batch Bug - VS Code Mock', () => {
    let messages: any[];
    let mockVscode: { postMessage: (msg: any) => void };
    let service: SpreadsheetService;

    // Exact content from workbook.md: '# Doc\n\n## Document 1\n\nbefore' (no trailing newline)
    const initialMd = '# Doc\n\n## Document 1\n\nbefore';

    beforeEach(() => {
        messages = [];
        mockVscode = { postMessage: (msg: any) => messages.push(msg) };
        service = new SpreadsheetService(mockVscode as any);
        service.initialize();
        service.initializeWorkbook(initialMd, '{}');
        messages = []; // Clear init messages
    });

    /**
     * Simulates exactly how message-dispatcher.ts applies updateRange messages
     * to a text document, matching VS Code's Range behavior including validateRange.
     */
    function applyUpdateRange(fileContent: string, msg: any): string {
        const lines = fileContent.split('\n');
        const lineCount = lines.length;

        // Match message-dispatcher.ts line 87-89
        const safeEndLine = Math.min(msg.endLine, lineCount - 1);
        // VS Code validateRange clamps endCol to line length
        const lineLength = lines[safeEndLine].length;
        const rawEndCol = msg.endCol ?? lineLength;
        const endCol = Math.min(rawEndCol, lineLength);

        // Calculate character offsets
        let startOffset = 0;
        for (let i = 0; i < msg.startLine; i++) {
            startOffset += lines[i].length + 1; // +1 for '\n'
        }

        let endOffset = 0;
        for (let i = 0; i < safeEndLine; i++) {
            endOffset += lines[i].length + 1;
        }
        endOffset += endCol;

        return fileContent.substring(0, startOffset) + msg.content + fileContent.substring(endOffset);
    }

    it('BUG REPRO: should send only ONE updateRange message', () => {
        // Simulate _handleDocSheetChange: startBatch, updateSheetName, updateDocSheetContent, endBatch
        service.startBatch();
        service.updateSheetName(0, 'Document 1');
        service.updateDocSheetContent(0, 'after');
        service.endBatch();

        const updateRangeMessages = messages.filter((m) => m.type === 'updateRange');

        console.log('=== BUG REPRO TEST ===');
        console.log('UpdateRange messages sent:', updateRangeMessages.length);
        for (let i = 0; i < updateRangeMessages.length; i++) {
            console.log(`Message ${i + 1}:`, {
                startLine: updateRangeMessages[i].startLine,
                endLine: updateRangeMessages[i].endLine,
                endCol: updateRangeMessages[i].endCol,
                content: JSON.stringify(updateRangeMessages[i].content)
            });
        }

        // BUG: Should be 1, but is 2 before fix
        expect(updateRangeMessages.length).toBe(1);

        // NEW: Verify content has correct formatting (exactly 1 blank line after header)
        // User's expected output: '# Doc\n\n## Document 1\n\nafter\n'
        // Bug output:             '# Doc\n\n## Document 1\n\n\nafter\n' (2 blank lines)
        const msg = updateRangeMessages[0];
        console.log('Generated content:', JSON.stringify(msg.content));
        // Content should have exactly 1 blank line between header and 'after'
        // That is: '# Doc\n\n## Document 1\n\nafter\n' (6 lines)
        const expectedContent = '# Doc\n\n## Document 1\n\nafter\n';
        expect(msg.content).toBe(expectedContent);
    });

    it('BUG REPRO: simulates exact file corruption matching user report', () => {
        service.startBatch();
        service.updateSheetName(0, 'Document 1');
        service.updateDocSheetContent(0, 'after');
        service.endBatch();

        const updateRangeMessages = messages.filter((m) => m.type === 'updateRange');

        console.log('=== FILE CORRUPTION SIMULATION ===');
        console.log('Initial file:', JSON.stringify(initialMd));

        let fileContent = initialMd;

        for (let idx = 0; idx < updateRangeMessages.length; idx++) {
            const msg = updateRangeMessages[idx];
            const lines = fileContent.split('\n');

            console.log(`\n--- Applying message ${idx + 1} ---`);
            console.log(`File has ${lines.length} lines`);
            console.log(`Message: startLine=${msg.startLine}, endLine=${msg.endLine}, endCol=${msg.endCol}`);

            const safeEndLine = Math.min(msg.endLine, lines.length - 1);
            console.log(`safeEndLine: ${safeEndLine}`);
            console.log(`Line at safeEndLine: ${JSON.stringify(lines[safeEndLine])}`);

            fileContent = applyUpdateRange(fileContent, msg);
            console.log(`Result: ${JSON.stringify(fileContent)}`);
        }

        console.log('\n=== FINAL RESULT ===');
        console.log('Final file content:', JSON.stringify(fileContent));
        console.log('Formatted:');
        console.log(fileContent);
        console.log('--- END ---');

        // User's expected buggy output:
        // # Doc
        //
        // ## Document 1
        //
        //
        // after
        //
        // before
        //
        // This is: '# Doc\n\n## Document 1\n\n\nafter\n\nbefore\n'

        // Verify the bug is reproduced
        expect(fileContent).toContain('after');
        expect(fileContent).not.toContain('before'); // FAILS before fix
    });

    it('BUG REPRO: using exact values from user VS Code logs', () => {
        // This test uses the EXACT values from user's debug logs:
        // Message 1: {startLine: 0, endLine: 5, endCol: 0, content: '# Doc\n\n## Document 1\n\n\nbefore\n'}
        // Message 2: {startLine: 0, endLine: 5, endCol: 0, content: '# Doc\n\n## Document 1\n\n\nafter\n'}
        // Document lineCount: 6 initially, then 7 after first message

        // User's initial file: 5 lines, NO trailing newline (user confirmed this)
        // VS Code lineCount would be 5 for this file
        const userInitialFile = '# Doc\n\n## Document 1\n\nbefore';

        // Messages have endLine: 4 (for 5-line file, last line index is 4)
        // But the generated content has 7 lines, so endLine on second message
        // points beyond the original file structure
        const userMessages = [
            {
                startLine: 0,
                endLine: 4, // Changed from 5 to 4 for 5-line file
                endCol: 6, // 'before' length
                content: '# Doc\n\n## Document 1\n\n\nbefore\n'
            },
            {
                startLine: 0,
                endLine: 4, // Same - this is where things go wrong
                endCol: 6, // But file is now 7 lines, line 4 is empty, length 0
                content: '# Doc\n\n## Document 1\n\n\nafter\n'
            }
        ];

        console.log('=== EXACT USER SCENARIO (no trailing newline) ===');
        console.log('Initial file:', JSON.stringify(userInitialFile));
        console.log('Initial line count:', userInitialFile.split('\n').length);

        let fileContent = userInitialFile;

        for (let idx = 0; idx < userMessages.length; idx++) {
            const msg = userMessages[idx];
            const lines = fileContent.split('\n');

            console.log(`\n--- Message ${idx + 1} ---`);
            console.log(`File line count: ${lines.length}`);
            console.log(`Message: startLine=${msg.startLine}, endLine=${msg.endLine}, endCol=${msg.endCol}`);

            fileContent = applyUpdateRange(fileContent, msg);
            console.log(`Result: ${JSON.stringify(fileContent)}`);
        }

        console.log('\n=== EXPECTED USER OUTPUT ===');
        console.log('Final:', JSON.stringify(fileContent));
        console.log('Formatted:');
        console.log(fileContent);

        // User's reported output (with extra blank line between after and before):
        // # Doc
        //
        // ## Document 1
        //
        //
        // after
        //
        // before
        const expectedBuggyOutput = '# Doc\n\n## Document 1\n\n\nafter\n\nbefore\n';
        expect(fileContent).toBe(expectedBuggyOutput);
    });
});
