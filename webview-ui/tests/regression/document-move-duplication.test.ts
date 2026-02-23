/**
 * Regression test: Document move duplication bug
 *
 * When moving a document via UI with no trailing newline at EOF,
 * the last document gets duplicated/concatenated.
 *
 * Root cause investigation: _mergeWithWorkbookSection may be
 * incorrectly calculating the slice ranges.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as editor from '../../../src/editor';

describe('Document Move Duplication Bug', () => {
    beforeEach(() => {
        editor.resetContext();
    });

    describe('Exact reproduction of user scenario', () => {
        it('BUG REPRO: Move Doc to before Workbook when file has no trailing newline', () => {
            // Exact content of workbook.md - 11 lines, no trailing newline
            const mdText = `# Workbook

## Sheet 1

| 列名1 | 列名2 | 列名3 |
| --- | --- | --- |
|  |  |  |

# Doc

# Doc2`; // No trailing newline!

            const lines = mdText.split('\n');
            console.log('=== INITIAL STATE ===');
            console.log('Line count:', lines.length);
            console.log('Last line:', JSON.stringify(lines[lines.length - 1]));
            console.log('Has trailing newline:', mdText.endsWith('\n'));

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Step 1: Move Doc (docIndex 0) to before Workbook
            const moveResult = editor.moveDocumentSection(0, 0, false, true);

            console.log('\n=== AFTER moveDocumentSection ===');
            console.log('error:', moveResult.error);
            console.log('startLine:', moveResult.startLine);
            console.log('endLine:', moveResult.endLine);
            console.log('content line count:', moveResult.content?.split('\n').length);
            console.log('content:\n---START---');
            console.log(moveResult.content);
            console.log('---END---');

            // Verify no duplication after pure move
            const moveDoc2Count = (moveResult.content?.match(/# Doc2/g) || []).length;
            console.log('\n# Doc2 count after move:', moveDoc2Count);

            // Check if Doc2 appears more than once - this is the bug!
            if (moveDoc2Count !== 1) {
                console.error('BUG: Doc2 appears', moveDoc2Count, 'times after moveDocumentSection!');
            }
            expect(moveDoc2Count).toBe(1);

            // Step 2: Simulate what _mergeWithWorkbookSection does
            const wbUpdate = editor.generateAndGetRange();

            console.log('\n=== generateAndGetRange result ===');
            console.log('error:', wbUpdate.error);
            console.log('startLine:', wbUpdate.startLine);
            console.log('endLine:', wbUpdate.endLine);
            console.log('content line count:', wbUpdate.content?.split('\n').length);

            if (wbUpdate.content && moveResult.content) {
                const mergedLines = moveResult.content.split('\n');
                const wbStart = wbUpdate.startLine ?? 0;
                const wbEnd = wbUpdate.endLine ?? 0;
                const wbContentLines = wbUpdate.content.trimEnd().split('\n');
                if (wbUpdate.content) {
                    wbContentLines.push('');
                }

                console.log('\n=== Merge calculation ===');
                console.log('mergedLines.length:', mergedLines.length);
                console.log('wbStart:', wbStart);
                console.log('wbEnd:', wbEnd);
                console.log('lines.slice(0, wbStart):', JSON.stringify(mergedLines.slice(0, wbStart)));
                console.log('lines.slice(wbEnd + 1):', JSON.stringify(mergedLines.slice(wbEnd + 1)));
                console.log('wbContentLines.length:', wbContentLines.length);

                const finalLines = [
                    ...mergedLines.slice(0, wbStart),
                    ...wbContentLines,
                    ...mergedLines.slice(wbEnd + 1)
                ];
                const finalContent = finalLines.join('\n');

                console.log('\n=== FINAL MERGED CONTENT ===');
                console.log('Final line count:', finalLines.length);
                console.log(finalContent);

                // Check for duplication in final merged content
                const finalDoc2Count = (finalContent.match(/# Doc2/g) || []).length;
                console.log('\n# Doc2 count in final:', finalDoc2Count);

                // This is the assertion that should fail if bug exists
                expect(finalDoc2Count).toBe(1);
                expect(finalContent).not.toMatch(/# Doc2# Doc2/);
            }
        });

        it('BUG REPRO: Move Doc2 to before Workbook when file has no trailing newline', () => {
            const mdText = `# Workbook

## Sheet 1

| 列名1 | 列名2 | 列名3 |
| --- | --- | --- |
|  |  |  |

# Doc

# Doc2`; // No trailing newline!

            editor.initializeWorkbook(mdText, JSON.stringify({ rootMarker: '# Workbook' }));

            // Move Doc2 (docIndex 1) to before Workbook
            const moveResult = editor.moveDocumentSection(1, 0, false, true);

            console.log('\n=== Move Doc2 to before WB ===');
            console.log('content:', moveResult.content);

            // Simulate merge
            const wbUpdate = editor.generateAndGetRange();
            console.log('wbUpdate.startLine:', wbUpdate.startLine);
            console.log('wbUpdate.endLine:', wbUpdate.endLine);

            if (wbUpdate.content && moveResult.content) {
                const mergedLines = moveResult.content.split('\n');
                const wbStart = wbUpdate.startLine ?? 0;
                const wbEnd = wbUpdate.endLine ?? 0;
                const wbContentLines = wbUpdate.content.trimEnd().split('\n');
                if (wbUpdate.content) {
                    wbContentLines.push('');
                }

                console.log('mergedLines.slice(wbEnd + 1):', mergedLines.slice(wbEnd + 1));

                const finalLines = [
                    ...mergedLines.slice(0, wbStart),
                    ...wbContentLines,
                    ...mergedLines.slice(wbEnd + 1)
                ];
                const finalContent = finalLines.join('\n');

                console.log('\n=== FINAL CONTENT ===');
                console.log(finalContent);

                // Should have each document exactly once
                const doc1Count = (finalContent.match(/# Doc\n/g) || []).length;
                const doc2Count = (finalContent.match(/# Doc2/g) || []).length;
                console.log('# Doc count:', doc1Count);
                console.log('# Doc2 count:', doc2Count);

                expect(doc1Count).toBe(1);
                expect(doc2Count).toBe(1);
            }
        });
    });
});
