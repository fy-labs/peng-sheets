/**
 * Tests for extractFrontmatter utility function.
 *
 * Scope: Unit tests for extractFrontmatter() in isolation.
 * No mocks needed — pure function with string input/output.
 *
 * Verifies YAML frontmatter detection and title extraction for
 * creating pinned document tabs.
 */

import { describe, it, expect } from 'vitest';
import { extractFrontmatter } from '../../../src/editor/utils/structure';

describe('extractFrontmatter', () => {
    describe('valid frontmatter with title', () => {
        it('should return title and body content excluding YAML block', () => {
            const md = `---
title: My Daily Journal
date: 2024-01-01
---

Some body content.

# Workbook
`;
            const result = extractFrontmatter(md);

            // Precondition: result exists
            expect(result).not.toBeNull();
            // Strict: exact title value
            expect(result!.title).toBe('My Daily Journal');
            // Strict: body content present, YAML frontmatter excluded
            expect(result!.content).toContain('Some body content.');
            expect(result!.content).not.toContain('title: My Daily Journal');
            expect(result!.content).not.toContain('---');
        });

        it('should stop body content at first H1 and include H2', () => {
            const md = `---
title: root
---

Body before H1.

## This is H2, not H1.

# Workbook

## Sheet 1
`;
            const result = extractFrontmatter(md);

            expect(result).not.toBeNull();
            expect(result!.title).toBe('root');
            // Body includes text before H1
            expect(result!.content).toContain('Body before H1.');
            // H2 is NOT an H1 boundary — should be included
            expect(result!.content).toContain('## This is H2, not H1.');
            // H1 and everything after it should be excluded
            expect(result!.content).not.toContain('# Workbook');
            expect(result!.content).not.toContain('## Sheet 1');
        });

        it('should return empty content when frontmatter is immediately followed by H1', () => {
            const md = `---
title: root
---
# Workbook
`;
            const result = extractFrontmatter(md);

            expect(result).not.toBeNull();
            expect(result!.title).toBe('root');
            // No body between frontmatter and H1 → content is empty
            expect(result!.content).toBe('');
        });

        it('should parse YAML with special characters in title', () => {
            const md = `---
title: "My: Special & Title"
tags: [a, b, c]
---

Content here.

# Workbook
`;
            const result = extractFrontmatter(md);

            expect(result).not.toBeNull();
            // Strict: exact title with colon and ampersand
            expect(result!.title).toBe('My: Special & Title');
            // Verify content is also captured
            expect(result!.content).toContain('Content here.');
        });

        it('should trim whitespace from title', () => {
            const md = `---
title: "  Padded Title  "
---

Body.
# Workbook
`;
            const result = extractFrontmatter(md);

            expect(result).not.toBeNull();
            // Title should be trimmed
            expect(result!.title).toBe('Padded Title');
        });
    });

    describe('null return cases', () => {
        it('should return null when no frontmatter exists', () => {
            const md = `# Workbook

## Sheet 1

| A |
|---|
| 1 |
`;
            expect(extractFrontmatter(md)).toBeNull();
        });

        it('should return null when frontmatter has no title', () => {
            const md = `---
date: 2024-01-01
author: Test
---

# Workbook
`;
            expect(extractFrontmatter(md)).toBeNull();
        });

        it('should return null for unclosed frontmatter delimiters', () => {
            const md = `---
title: Test
This is not closed properly.

# Workbook
`;
            expect(extractFrontmatter(md)).toBeNull();
        });

        it('should return null for empty string input', () => {
            expect(extractFrontmatter('')).toBeNull();
        });

        it('should return null when title is empty string', () => {
            const md = `---
title: ""
---

Body.
`;
            // Empty title should not create a document tab
            expect(extractFrontmatter(md)).toBeNull();
        });

        it('should return null when title is non-string type', () => {
            const md = `---
title: 42
---

Body.
`;
            // Numeric title should be rejected (must be a string)
            expect(extractFrontmatter(md)).toBeNull();
        });
    });
});
