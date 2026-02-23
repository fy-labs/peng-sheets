/**
 * Regression test for Doc Sheet save bug - content prepending issue
 * Bug: When editing a Doc Sheet and saving, new content is prepended
 * to old content instead of replacing it (e.g., "after before" instead of "after")
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    resetContext,
    initializeWorkbook,
    getState,
    updateDocSheetContent,
    getFullMarkdown
} from '../../../src/editor';

describe('Doc Sheet Save Bug', () => {
    beforeEach(() => {
        resetContext();
    });

    it('should replace Doc Sheet content, not prepend to it', () => {
        // Setup: Initialize workbook with Doc Sheet containing "before"
        const initialMd = `# Doc

## Document 1

before
`;
        initializeWorkbook(initialMd, '{}');

        // Get initial state
        const initialState = JSON.parse(getState());
        const sheet = initialState.workbook?.sheets?.[0];
        expect(sheet).toBeDefined();
        expect(sheet.name).toBe('Document 1');
        expect(sheet.sheetType).toBe('doc');
        console.log('Initial content:', JSON.stringify(sheet.content));
        expect(sheet.content).toContain('before');

        // Act: Update the Doc Sheet content to "after"
        const result = updateDocSheetContent(0, 'after');
        console.log('Update result:', result);

        // Get the generated markdown
        const newMd = getFullMarkdown();
        console.log('Generated markdown:', JSON.stringify(newMd));

        // Assert: The markdown should contain ONLY "after", not "after before"
        expect(newMd).toContain('after');
        expect(newMd).not.toContain('before');
    });

    it('should correctly update range when Doc Sheet has leading blank lines', () => {
        // Setup: Initialize workbook with Doc Sheet that has blank lines before content
        const initialMd = `# Doc

## Document 1


before
`;
        initializeWorkbook(initialMd, '{}');

        // Get initial state
        const initialState = JSON.parse(getState());
        const sheet = initialState.workbook?.sheets?.[0];
        expect(sheet).toBeDefined();
        console.log('Initial content with blanks:', JSON.stringify(sheet.content));

        // The content should have preserved leading blank lines (from rstrip() fix)
        // Act: Update the Doc Sheet content to "\n\nafter"
        const result = updateDocSheetContent(0, '\n\nafter');
        console.log('Update result:', result);

        // Get the generated markdown
        const newMd = getFullMarkdown();
        console.log('Generated markdown:', JSON.stringify(newMd));

        // Assert: The markdown should contain "after", not "before"
        expect(newMd).toContain('after');
        expect(newMd).not.toContain('before');
    });

    it('should return correct range after updating Doc Sheet content', () => {
        // This test checks the range calculation issue
        const initialMd = `# Doc

## Document 1

before
`;
        initializeWorkbook(initialMd, '{}');

        // Update the Doc Sheet content
        const result = updateDocSheetContent(0, 'after');
        console.log('Update result:', JSON.stringify(result));

        // Verify the result contains expected range
        expect(result).toBeDefined();
        expect(result.error).toBeUndefined();
        expect(result.startLine).toBeDefined();
        expect(result.endLine).toBeDefined();
        expect(result.content).toBeDefined();

        // Log the actual values for debugging
        console.log('startLine:', result.startLine);
        console.log('endLine:', result.endLine);
        console.log('endCol:', result.endCol);
        console.log('content:', JSON.stringify(result.content));

        // The content should not contain 'before' - it should be the full workbook markdown
        expect(result.content).toContain('after');
        expect(result.content).not.toContain('before');

        // Verify the range makes sense
        // startLine should be 0 (the workbook header line)
        expect(result.startLine).toBe(0);
    });

    it('should correctly replace content when new content is shorter than original', () => {
        // This simulates the real bug scenario:
        // Original file has blank lines, making content longer
        // User replaces with shorter content
        // Result should NOT leave old content behind

        // Original file: 8 lines (0-7)
        const initialMd = `# Doc

## Document 1


before
`;
        initializeWorkbook(initialMd, '{}');

        // Get the initial state to verify parsing
        const initialState = JSON.parse(getState());
        const sheet = initialState.workbook?.sheets?.[0];
        console.log('Initial content:', JSON.stringify(sheet?.content));

        // Simulate what happens when user changes "before" to "after"
        // The new content does NOT have leading blank lines
        const result = updateDocSheetContent(0, 'after');

        console.log('Update result:', JSON.stringify(result, null, 2));
        console.log('Initial file lines:', initialMd.split('\n').length);
        console.log('New content lines:', result.content?.split('\n').length);

        // Simulate the file replacement that VS Code would do
        // VS Code Range is exclusive on the end position
        const originalText = initialMd;
        const startLine = result.startLine ?? 0;
        const endLine = result.endLine ?? 0;
        const endCol = result.endCol ?? 0;

        // Split into lines to calculate offsets
        const originalLines = originalText.split('\n');

        // Calculate the character offset for the start position (startLine, col 0)
        let startOffset = 0;
        for (let i = 0; i < startLine; i++) {
            startOffset += originalLines[i].length + 1; // +1 for newline
        }

        // Calculate the character offset for the end position (endLine, endCol)
        let endOffset = 0;
        for (let i = 0; i < endLine; i++) {
            endOffset += originalLines[i].length + 1;
        }
        endOffset += endCol;

        console.log('Original text:', JSON.stringify(originalText));
        console.log('startOffset:', startOffset, 'endOffset:', endOffset);
        console.log('Replacing characters', startOffset, 'to', endOffset);
        console.log('Text being replaced:', JSON.stringify(originalText.substring(startOffset, endOffset)));
        console.log('Text remaining after endOffset:', JSON.stringify(originalText.substring(endOffset)));

        // Perform the replacement (VS Code style: exclusive end)
        const beforeReplacement = originalText.substring(0, startOffset);
        const afterReplacement = originalText.substring(endOffset);
        const finalContent = beforeReplacement + result.content + afterReplacement;

        console.log('Final content:', JSON.stringify(finalContent));

        // The final content should NOT contain 'before'
        expect(finalContent).toContain('after');
        expect(finalContent).not.toContain('before');
    });

    /**
     * CRITICAL: This test reproduces the actual bug that was occurring.
     *
     * The bug was in _handleDocSheetChange which did:
     * 1. updateDocSheetContent() - updates workbook and sends updateRange message
     * 2. _parseWorkbook() - re-initializes workbook from OLD markdownInput
     * 3. _handleSave() - triggers VS Code to save
     *
     * Step 2 was the problem: it resets the workbook state using the old markdown,
     * which meant the updateRange message contained the OLD content mixed with new.
     *
     * This test verifies that after updateDocSheetContent, we should NOT
     * re-initialize the workbook with the old markdown.
     */
    it('BUG REPRO: re-initializing workbook after updateDocSheetContent should preserve changes', () => {
        const initialMd = `# Doc

## Document 1


before
`;
        // Step 1: Initialize with initial content
        initializeWorkbook(initialMd, '{}');

        // Verify initial content
        let state = JSON.parse(getState());
        expect(state.workbook?.sheets?.[0]?.content).toContain('before');

        // Step 2: Update the Doc Sheet content (simulates user editing)
        const updateResult = updateDocSheetContent(0, 'after');
        console.log('After updateDocSheetContent:', JSON.stringify(updateResult));

        // The updateRange content should contain 'after' and NOT 'before'
        expect(updateResult.content).toContain('after');
        expect(updateResult.content).not.toContain('before');

        // Step 3: Get current state - it should have the new content
        state = JSON.parse(getState());
        expect(state.workbook?.sheets?.[0]?.content).toBe('after');

        // Step 4: BUG SIMULATION - This is what _parseWorkbook() was doing!
        // Re-initialize with OLD markdown (simulating _parseWorkbook with stale markdownInput)
        initializeWorkbook(initialMd, '{}');

        // This would have been the bug: state is now reset to 'before'
        state = JSON.parse(getState());
        console.log('After re-initialize with old markdown:', state.workbook?.sheets?.[0]?.content);

        // IMPORTANT: After the fix, we no longer call _parseWorkbook() in _handleDocSheetChange,
        // so this test documents the bug behavior but doesn't assert it as "correct".
        // The fix was to NOT call _parseWorkbook() after updateDocSheetContent.

        // This assertion shows what WAS happening (state reset to old content):
        expect(state.workbook?.sheets?.[0]?.content).toContain('before');

        // The fix in main.ts prevents this scenario by not calling _parseWorkbook()
        // after updateDocSheetContent in _handleDocSheetChange.
    });

    /**
     * PRECISE VS Code Range Simulation
     *
     * This test simulates EXACTLY how VS Code's editBuilder.replace works:
     * - Range end position is EXCLUSIVE
     * - Position(line, col) means the character at (line, col) is NOT included
     *
     * Bug scenario:
     * - Original file: 7 lines (0-6), line 6 is empty (trailing newline)
     * - endLine: 6, endCol: 0
     * - Range(0:0, 6:0) should include lines 0-5, NOT line 6
     * - BUT line 6 is empty, so this should replace the entire file
     */
    it('PRECISE: VS Code Range simulation with trailing newline edge case', () => {
        // This is the EXACT file content from user's scenario
        const originalFile = '# Doc\n\n## Document 1\n\n\nbefore\n';

        // This is what generateAndGetRange returns
        const updateSpec = {
            startLine: 0,
            endLine: 6,
            endCol: 0,
            content: '# Doc\n\n## Document 1\n\n\nafter\n'
        };

        // Simulate VS Code's Range calculation (message-dispatcher.ts)
        const lines = originalFile.split('\n');
        console.log('Original lines:', lines.length, JSON.stringify(lines));

        // VS Code lineCount would be the same as lines.length for this file
        const vsCodeLineCount = lines.length;

        // message-dispatcher.ts does this:
        const safeEndLine = Math.min(updateSpec.endLine, vsCodeLineCount - 1); // min(6, 6) = 6
        // endCol: 0 is NOT null/undefined, so ?? doesn't trigger
        const endCol = updateSpec.endCol; // 0

        console.log('safeEndLine:', safeEndLine, 'endCol:', endCol);

        // Calculate what characters this Range covers
        // Position(startLine, 0) to Position(endLine, endCol)
        let startCharOffset = 0;
        for (let i = 0; i < updateSpec.startLine; i++) {
            startCharOffset += lines[i].length + 1; // +1 for newline
        }

        let endCharOffset = 0;
        for (let i = 0; i < safeEndLine; i++) {
            endCharOffset += lines[i].length + 1;
        }
        endCharOffset += endCol;

        console.log('Character offsets - start:', startCharOffset, 'end:', endCharOffset);
        console.log('Original file length:', originalFile.length);
        console.log('Text being replaced:', JSON.stringify(originalFile.substring(startCharOffset, endCharOffset)));
        console.log('Text remaining:', JSON.stringify(originalFile.substring(endCharOffset)));

        // Perform the replacement
        const before = originalFile.substring(0, startCharOffset);
        const after = originalFile.substring(endCharOffset);
        const result = before + updateSpec.content + after;

        console.log('Final result:', JSON.stringify(result));

        // THE BUG: If endCharOffset < originalFile.length, old content remains!
        if (endCharOffset < originalFile.length) {
            console.log(
                'BUG DETECTED: endCharOffset (' + endCharOffset + ') < file length (' + originalFile.length + ')'
            );
            console.log('Remaining content will be appended:', JSON.stringify(after));
        }

        // Assert: result should NOT contain 'before'
        expect(result).toContain('after');
        expect(result).not.toContain('before');
    });

    /**
     * EXACT USER SCENARIO
     *
     * User's log shows: content: '\nafter'
     * This is from _extractTitleAndBody which separates title from body.
     * The body starts with a newline after the title line.
     */
    it('EXACT USER SCENARIO: content with leading newline from _extractTitleAndBody', () => {
        // Original file: exactly as user has
        const originalFile = '# Doc\n\n## Document 1\n\n\nbefore\n';
        initializeWorkbook(originalFile, '{}');

        // Get initial state to verify parsing
        const initialState = JSON.parse(getState());
        const sheet = initialState.workbook?.sheets?.[0];
        console.log('Initial parsed content:', JSON.stringify(sheet?.content));

        // User's log shows content: '\nafter' (with leading newline!)
        // This is what _extractTitleAndBody returns when user types "after" in the editor
        const userContent = '\nafter';
        const result = updateDocSheetContent(0, userContent);

        console.log('Update result with leading newline:', JSON.stringify(result, null, 2));

        // Simulate VS Code replacement
        const lines = originalFile.split('\n');
        const safeEndLine = Math.min(result.endLine ?? 0, lines.length - 1);
        const endCol = result.endCol ?? 0;

        let startOffset = 0;
        for (let i = 0; i < (result.startLine ?? 0); i++) {
            startOffset += lines[i].length + 1;
        }

        let endOffset = 0;
        for (let i = 0; i < safeEndLine; i++) {
            endOffset += lines[i].length + 1;
        }
        endOffset += endCol;

        console.log('Offsets - start:', startOffset, 'end:', endOffset, 'fileLen:', originalFile.length);

        const finalContent =
            originalFile.substring(0, startOffset) + result.content + originalFile.substring(endOffset);
        console.log('Final content:', JSON.stringify(finalContent));

        // BUG CHECK
        if (finalContent.includes('before')) {
            console.log('BUG REPRODUCED: "before" still in content!');
        }

        expect(finalContent).toContain('after');
        expect(finalContent).not.toContain('before');
    });
});
