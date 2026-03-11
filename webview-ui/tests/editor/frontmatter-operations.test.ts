/**
 * Frontmatter Operations Integration Tests
 *
 * Scope: Integration tests for updateFrontmatterContent, renameFrontmatterTitle,
 *        and deleteFrontmatter editor APIs.
 * Uses real module instances: initializeWorkbook → frontmatter APIs.
 * No mocks — exercises the full parser → editor → text manipulation pipeline.
 *
 * Test Blueprint:
 * - updateFrontmatterContent: body between --- and first H1 is replaced
 * - renameFrontmatterTitle: YAML title field is updated, other fields preserved
 * - deleteFrontmatter: YAML block + body up to first H1 are removed
 * - Error states: no frontmatter, no title field
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    initializeWorkbook,
    getState,
    resetContext,
    updateFrontmatterContent,
    renameFrontmatterTitle,
    deleteFrontmatter
} from '../../../src/editor';

const DEFAULT_CONFIG = JSON.stringify({});

// Scenario B: frontmatter + H1 workbook (creates pinned frontmatter tab)
const FRONTMATTER_WITH_H1 = `---
id: 1234
title: Frontmatter Document
desc: ""
updated: 1605266684036
created: 1595961348801
---

This is the root doc.

## Document Example

This document is a fixed position document tab.

# Workbook

## Sheet 1

### MyTable

| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  | 200 | 100 |

<!-- md-spreadsheet-sheet-metadata: {"layout": {"type": "pane", "id": "root", "tables": [0], "activeTableIndex": 0}} -->

## Document 1

`;

// Edge case: frontmatter with empty body (YAML block only)
const FRONTMATTER_EMPTY_BODY = `---
id: 5678
title: Empty Body Doc
---

# Workbook

## Sheet 1

### Table1

| A | B |
| --- | --- |
| 1 | 2 |
`;

// Edge case: frontmatter-only file (no H1 at all)
const FRONTMATTER_ONLY = `---
title: Standalone
---

Some body content.
`;

describe('Frontmatter Operations Integration Tests', () => {
    beforeEach(() => {
        resetContext();
    });

    // =========================================================================
    // updateFrontmatterContent
    // =========================================================================
    describe('updateFrontmatterContent', () => {
        it('should replace body content between --- and first H1', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = updateFrontmatterContent('New body content.\n\nSecond paragraph.');

            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            // YAML block preserved
            expect(result.content).toContain('---');
            expect(result.content).toContain('title: Frontmatter Document');
            expect(result.content).toContain('id: 1234');

            // New body content present
            expect(result.content).toContain('New body content.');
            expect(result.content).toContain('Second paragraph.');

            // Old body content removed
            expect(result.content).not.toContain('This is the root doc.');
            expect(result.content).not.toContain('## Document Example');
            expect(result.content).not.toContain('fixed position document tab');

            // Workbook section preserved
            expect(result.content).toContain('# Workbook');
            expect(result.content).toContain('## Sheet 1');
            expect(result.content).toContain('## Document 1');

            // CRITICAL: blank line must exist between body and H1 header
            const lines = result.content!.split('\n');
            const h1Idx = lines.findIndex((l) => l === '# Workbook');
            expect(h1Idx).toBeGreaterThan(0);
            // The line immediately before H1 should be empty (blank line separator)
            expect(lines[h1Idx - 1]).toBe('');
        });

        it('should preserve blank line between empty body and H1', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = updateFrontmatterContent('');

            expect(result.error).toBeUndefined();
            expect(result.content).toContain('# Workbook');

            // Even with empty body, blank line before H1 is required
            const lines = result.content!.split('\n');
            const h1Idx = lines.findIndex((l) => l === '# Workbook');
            expect(h1Idx).toBeGreaterThan(0);
            expect(lines[h1Idx - 1]).toBe('');
        });

        it('should normalize trailing newlines in content to exactly one blank line before H1', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            // User enters content with multiple trailing newlines
            const result = updateFrontmatterContent('Some content\n\n\n\n');

            expect(result.error).toBeUndefined();
            expect(result.content).toContain('Some content');
            expect(result.content).toContain('# Workbook');

            // Must have exactly 1 blank line before H1, not 4+
            const lines = result.content!.split('\n');
            const h1Idx = lines.findIndex((l) => l === '# Workbook');
            expect(h1Idx).toBeGreaterThan(0);
            // Line before H1 must be empty (blank line)
            expect(lines[h1Idx - 1]).toBe('');
            // But the line before that must NOT be empty (no double blank lines)
            expect(lines[h1Idx - 2].trim()).not.toBe('');
        });

        it('should handle empty content (clearing body)', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = updateFrontmatterContent('');

            expect(result.error).toBeUndefined();

            // YAML preserved
            expect(result.content).toContain('title: Frontmatter Document');

            // Body cleared
            expect(result.content).not.toContain('This is the root doc.');

            // Workbook preserved
            expect(result.content).toContain('# Workbook');
        });

        it('should return error when no frontmatter exists', () => {
            const noFrontmatter = `# Workbook\n\n## Sheet 1\n\n| A |\n|---|\n| 1 |\n`;
            initializeWorkbook(noFrontmatter, DEFAULT_CONFIG);

            const result = updateFrontmatterContent('test');

            expect(result.error).toBe('No frontmatter found');
        });
    });

    // =========================================================================
    // renameFrontmatterTitle
    // =========================================================================
    describe('renameFrontmatterTitle', () => {
        it('should update the title field in YAML frontmatter', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = renameFrontmatterTitle('New Title');

            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            // New title present
            expect(result.content).toContain('title: New Title');

            // Old title removed
            expect(result.content).not.toContain('title: Frontmatter Document');

            // Other YAML fields preserved
            expect(result.content).toContain('id: 1234');
            expect(result.content).toContain('desc: ""');
            expect(result.content).toContain('updated: 1605266684036');

            // Body preserved
            expect(result.content).toContain('This is the root doc.');

            // Workbook preserved
            expect(result.content).toContain('# Workbook');

            // STRUCTURAL: blank line after closing --- (before body)
            const lines = result.content!.split('\n');
            const closingDashIdx = lines.indexOf('---', 1); // skip opening ---
            expect(closingDashIdx).toBeGreaterThan(0);
            expect(lines[closingDashIdx + 1]).toBe(''); // blank line after ---

            // STRUCTURAL: blank line before H1 header
            const h1Idx = lines.findIndex((l) => l === '# Workbook');
            expect(h1Idx).toBeGreaterThan(0);
            expect(lines[h1Idx - 1]).toBe(''); // blank line before # Workbook
        });

        it('should return error when no frontmatter exists', () => {
            const noFrontmatter = `# Workbook\n\n## Sheet 1\n\n| A |\n|---|\n| 1 |\n`;
            initializeWorkbook(noFrontmatter, DEFAULT_CONFIG);

            const result = renameFrontmatterTitle('test');

            expect(result.error).toBe('No frontmatter found');
        });

        it('should return error when no title field exists', () => {
            const noTitle = `---\nid: 1234\ndesc: ""\n---\n\nbody\n\n# Workbook\n`;
            initializeWorkbook(noTitle, DEFAULT_CONFIG);

            const result = renameFrontmatterTitle('test');

            expect(result.error).toBe('No title field found in frontmatter');
        });
    });

    // =========================================================================
    // deleteFrontmatter
    // =========================================================================
    describe('deleteFrontmatter', () => {
        it('should remove YAML block and body up to first H1', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = deleteFrontmatter();

            expect(result.error).toBeUndefined();
            expect(result.content).toBeDefined();

            // YAML block removed (check for --- as a standalone line, not in table separators)
            const lines = result.content!.split('\n');
            const yamlDelimiters = lines.filter((l) => l.trim() === '---');
            expect(yamlDelimiters).toHaveLength(0);
            expect(result.content).not.toContain('title: Frontmatter Document');
            expect(result.content).not.toContain('id: 1234');

            // Body removed
            expect(result.content).not.toContain('This is the root doc.');
            expect(result.content).not.toContain('## Document Example');

            // Workbook section preserved intact
            expect(result.content).toContain('# Workbook');
            expect(result.content).toContain('## Sheet 1');
            expect(result.content).toContain('### MyTable');
            expect(result.content).toContain('## Document 1');

            // STRUCTURAL: first line should be the H1 (no leading blank lines)
            expect(lines[0]).toBe('# Workbook');

            // STRUCTURAL: blank line after H1 preserved
            expect(lines[1]).toBe('');

            // Table data preserved with exact values
            expect(result.content).toContain('| 200 |');
            expect(result.content).toContain('| 100 |');

            // Sheet metadata comment preserved
            expect(result.content).toContain('md-spreadsheet-sheet-metadata');
        });

        it('delete result should re-parse as valid workbook', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            const result = deleteFrontmatter();
            expect(result.error).toBeUndefined();

            // Re-init with deleted content (simulates VS Code re-parse)
            resetContext();
            initializeWorkbook(result.content!, DEFAULT_CONFIG);
            const state = JSON.parse(getState());

            // Should parse as valid workbook
            expect(state.workbook).toBeDefined();
            expect(state.workbook.name).toBe('Workbook');

            // Sheets preserved (Sheet 1 = spreadsheet + Document 1 = doc sheet)
            expect(state.workbook.sheets).toHaveLength(2);
            expect(state.workbook.sheets[0].name).toBe('Sheet 1');

            // Table data preserved
            const table = state.workbook.sheets[0].tables[0];
            expect(table).toBeDefined();
            expect(table.rows[0][1]).toBe('200');
            expect(table.rows[0][2]).toBe('100');

            // No frontmatter section in structure
            const fmSections = state.structure.filter((s: { type: string }) => s.type === 'frontmatter');
            expect(fmSections).toHaveLength(0);

            // Document 1 is a doc sheet within the workbook (sheets[1]), not a structure section
            expect(state.workbook.sheets[1].name).toBe('Document 1');
        });

        it('should handle frontmatter with empty body', () => {
            initializeWorkbook(FRONTMATTER_EMPTY_BODY, DEFAULT_CONFIG);

            const result = deleteFrontmatter();

            expect(result.error).toBeUndefined();

            // YAML removed
            expect(result.content).not.toContain('title: Empty Body Doc');

            // Workbook preserved
            expect(result.content).toContain('# Workbook');
            expect(result.content).toContain('| 1 | 2 |');

            // First line is H1
            const lines = result.content!.split('\n');
            expect(lines[0]).toBe('# Workbook');
        });

        it('should handle frontmatter-only file (no H1)', () => {
            initializeWorkbook(FRONTMATTER_ONLY, DEFAULT_CONFIG);

            const result = deleteFrontmatter();

            expect(result.error).toBeUndefined();

            // Everything removed — content should be empty or whitespace-only
            expect(result.content!.trim()).toBe('');
        });

        it('should return error when no frontmatter exists', () => {
            const noFrontmatter = `# Workbook\n\n## Sheet 1\n\n| A |\n|---|\n| 1 |\n`;
            initializeWorkbook(noFrontmatter, DEFAULT_CONFIG);

            const result = deleteFrontmatter();

            expect(result.error).toBe('No frontmatter found');
        });
    });

    // =========================================================================
    // Idempotency / round-trip
    // =========================================================================
    describe('round-trip stability', () => {
        it('update then rename should produce consistent result', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            // Update body
            const result1 = updateFrontmatterContent('Updated body');
            expect(result1.error).toBeUndefined();

            // Then rename title
            const result2 = renameFrontmatterTitle('Renamed');
            expect(result2.error).toBeUndefined();

            // Both changes should be present
            expect(result2.content).toContain('title: Renamed');
            expect(result2.content).toContain('Updated body');

            // Workbook intact
            expect(result2.content).toContain('# Workbook');
            expect(result2.content).toContain('## Sheet 1');
        });

        it('rename → re-init → edit body should preserve blank lines', () => {
            initializeWorkbook(FRONTMATTER_WITH_H1, DEFAULT_CONFIG);

            // Step 1: Rename
            const renameResult = renameFrontmatterTitle('Renamed Title');
            expect(renameResult.error).toBeUndefined();

            // Step 2: Re-init with renamed content (simulates VS Code re-parse)
            resetContext();
            initializeWorkbook(renameResult.content!, DEFAULT_CONFIG);

            // Step 3: Edit body content
            const editResult = updateFrontmatterContent('New body after rename');
            expect(editResult.error).toBeUndefined();

            // Verify structural integrity
            const lines = editResult.content!.split('\n');

            // YAML block preserved with new title
            expect(editResult.content).toContain('title: Renamed Title');

            // Blank line after closing ---
            const closingDashIdx = lines.indexOf('---', 1);
            expect(closingDashIdx).toBeGreaterThan(0);
            expect(lines[closingDashIdx + 1]).toBe('');

            // Body content present
            expect(editResult.content).toContain('New body after rename');

            // Blank line before H1
            const h1Idx = lines.findIndex((l) => l === '# Workbook');
            expect(h1Idx).toBeGreaterThan(0);
            expect(lines[h1Idx - 1]).toBe('');
        });
    });
});
