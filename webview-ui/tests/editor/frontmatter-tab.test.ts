/**
 * Tests for extractFrontmatter utility function.
 *
 * Verifies YAML frontmatter detection and title extraction for
 * creating pinned document tabs.
 */

import { describe, it, expect } from 'vitest';
import { extractFrontmatter } from '../../../src/editor/utils/structure';

describe('extractFrontmatter', () => {
    it('should extract title from valid frontmatter', () => {
        const md = `---
title: My Daily Journal
date: 2024-01-01
---

Some body content.

# Workbook
`;
        const result = extractFrontmatter(md);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('My Daily Journal');
        expect(result!.content).not.toContain('title: My Daily Journal');
        expect(result!.content).not.toContain('---');
        expect(result!.content).toContain('Some body content.');
    });

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

    it('should return null for unclosed frontmatter', () => {
        const md = `---
title: Test
This is not closed properly.

# Workbook
`;
        expect(extractFrontmatter(md)).toBeNull();
    });

    it('should stop body content at first H1', () => {
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
        expect(result!.content).toContain('Body before H1.');
        expect(result!.content).toContain('## This is H2, not H1.');
        expect(result!.content).not.toContain('# Workbook');
    });

    it('should handle empty body after frontmatter', () => {
        const md = `---
title: root
---
# Workbook
`;
        const result = extractFrontmatter(md);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('root');
        // Content should NOT include the frontmatter block
        expect(result!.content).not.toContain('title: root');
        expect(result!.content).not.toContain('---');
    });

    it('should handle frontmatter with special YAML characters', () => {
        const md = `---
title: "My: Special & Title"
tags: [a, b, c]
---

Content here.

# Workbook
`;
        const result = extractFrontmatter(md);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('My: Special & Title');
    });
});
