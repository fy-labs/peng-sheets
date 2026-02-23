/**
 * Reproduction test for root tab save bug.
 * Symptom: Saving root tab content causes workbook.md to become empty.
 * Expected: Workbook.toMarkdown should correctly round-trip root content.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as editor from '../../../src/editor/api';

describe('Root Tab Save Bug Reproduction', () => {
    const SCHEMA = JSON.stringify({});

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('updateRootContent round-trip', () => {
        it('should preserve root content after updateRootContent', () => {
            // Initial markdown with root content only
            const initialMd = `# Doc

test text
`;

            editor.initializeWorkbook(initialMd, SCHEMA);

            // Get initial workbook state
            const initialState = JSON.parse(editor.getState());
            expect(initialState.workbook).not.toBeNull();
            expect(initialState.workbook.rootContent).toBe('test text');

            // Update root content
            const result = editor.updateRootContent('updated content');

            console.log('updateRootContent result:', JSON.stringify(result, null, 2));

            // Check result
            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            // Content should not be empty
            expect(result.content).not.toBe('');
            expect(result.content).not.toBe('\n');

            // Content should contain the updated content
            expect(result.content).toContain('updated content');
        });

        it('should generate valid markdown after updateRootContent', () => {
            const initialMd = `# Doc

test text
`;

            editor.initializeWorkbook(initialMd, SCHEMA);

            // Update root content
            const result = editor.updateRootContent('new root content');

            console.log('Generated markdown:', result.content);

            // Verify the generated content
            expect(result.content).toBeDefined();
            expect(result.content!.length).toBeGreaterThan(0);

            // Should contain workbook header
            expect(result.content).toContain('# Doc');

            // Should contain the new root content
            expect(result.content).toContain('new root content');
        });

        it('should round-trip correctly when parsing the generated markdown', () => {
            const initialMd = `# Doc

original content
`;

            editor.initializeWorkbook(initialMd, SCHEMA);

            // Update root content
            const updateResult = editor.updateRootContent('modified content');
            expect(updateResult.error).toBeUndefined();
            expect(updateResult.content).toBeDefined();

            console.log('Round-trip: Generated markdown:', updateResult.content);

            // Re-init with the generated markdown
            editor.initializeWorkbook(updateResult.content!, SCHEMA);

            // Verify round-trip
            const newState = JSON.parse(editor.getState());
            expect(newState.workbook).not.toBeNull();
            expect(newState.workbook.rootContent).toBe('modified content');
        });
    });

    describe('Workbook.toMarkdown with rootContent', () => {
        it('should include rootContent in toMarkdown output', () => {
            const initialMd = `# Doc

root content here
`;

            editor.initializeWorkbook(initialMd, SCHEMA);

            // Get state and verify workbook is parsed correctly
            const state = JSON.parse(editor.getState());
            expect(state.workbook).not.toBeNull();
            expect(state.workbook.rootContent).toBe('root content here');

            // Now update rootContent to trigger toMarkdown
            const result = editor.updateRootContent('root content here');

            console.log('Workbook update result:', JSON.stringify(result, null, 2));

            // Should contain root content in output
            expect(result.content).toBeDefined();
            expect(result.content).toContain('root content here');
        });
    });
});
