/**
 * Structure utilities for extracting document/workbook structure from markdown.
 * Converted from python-modules/src/md_spreadsheet_editor/utils_structure.py
 */

import type { StructureSection, DocumentSection, WorkbookSection } from '../types';

/**
 * Extract document and workbook structure from markdown text.
 * Returns a JSON string of StructureSection array.
 */
export function extractStructure(
    mdText: string,
    rootMarker: string,
    workbookStartLine?: number,
    workbookEndLine?: number
): string {
    const sections: StructureSection[] = [];
    const lines = mdText.split('\n');

    // Determine workbook range
    let wbStart: number;
    let wbEnd: number;
    if (workbookStartLine !== undefined && workbookEndLine !== undefined) {
        wbStart = workbookStartLine;
        wbEnd = workbookEndLine;
    } else {
        // Fallback: scan for rootMarker
        wbStart = lines.length;
        wbEnd = lines.length;
        let inCB = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('```')) inCB = !inCB;
            if (!inCB && lines[i].trim() === rootMarker) {
                wbStart = i;
                // Find end: next H1 or EOF
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim().startsWith('```')) inCB = !inCB;
                    if (!inCB && lines[j].startsWith('# ') && !lines[j].startsWith('## ')) {
                        wbEnd = j;
                        break;
                    }
                }
                if (wbEnd === lines.length) wbEnd = lines.length;
                break;
            }
        }
    }

    let currentType: 'document' | 'workbook' | null = null;
    let currentTitle: string | null = null;
    let currentLines: string[] = [];
    let inCodeBlock = false;
    let workbookInserted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        // At workbook start, flush current doc and insert workbook section
        if (i === wbStart && !workbookInserted) {
            if (currentTitle && currentType === 'document') {
                sections.push({
                    type: 'document',
                    title: currentTitle,
                    content: currentLines.join('\n')
                } as DocumentSection);
                currentTitle = null;
            }
            sections.push({ type: 'workbook' } as WorkbookSection);
            currentType = 'workbook';
            currentLines = [];
            workbookInserted = true;
            continue;
        }

        // Skip lines within workbook range
        if (i >= wbStart && i < wbEnd) {
            continue;
        }

        if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
            // Flush previous document section
            if (currentTitle && currentType === 'document') {
                sections.push({
                    type: 'document',
                    title: currentTitle,
                    content: currentLines.join('\n')
                } as DocumentSection);
            }

            currentTitle = line.slice(2).trim();
            currentType = 'document';
            currentLines = [];
        } else {
            if (currentType === 'document') {
                currentLines.push(line);
            }
        }
    }

    // Flush final document section
    if (currentTitle && currentType === 'document') {
        sections.push({
            type: 'document',
            title: currentTitle,
            content: currentLines.join('\n')
        } as DocumentSection);
    }

    return JSON.stringify(sections);
}

/**
 * Augment workbook metadata with line numbers for each sheet header.
 * This allows the UI to navigate to specific sheets in the source.
 */
export function augmentWorkbookMetadata(
    workbookDict: Record<string, unknown>,
    mdText: string,
    rootMarker: string,
    sheetHeaderLevel: number
): Record<string, unknown> {
    const lines = mdText.split('\n');

    // Find root marker first to replicate parse_workbook skip logic
    let startIndex = 0;
    let inCodeBlock = false;

    if (rootMarker) {
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }
            if (!inCodeBlock && line.trim() === rootMarker) {
                startIndex = i + 1;
                found = true;
                break;
            }
        }
        // Virtual root: rootMarker not found in text (e.g., frontmatter-based workbook)
        // Start scanning from line 0
        if (!found) {
            startIndex = 0;
        }
    }

    const headerPrefix = '#'.repeat(sheetHeaderLevel) + ' ';

    let currentSheetIdx = 0;
    inCodeBlock = false;

    const sheets = workbookDict.sheets as Array<Record<string, unknown>> | undefined;
    if (!sheets) {
        return workbookDict;
    }

    for (let idx = startIndex; idx < lines.length; idx++) {
        const line = lines[idx];
        const stripped = line.trim();

        if (stripped.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        if (inCodeBlock) {
            continue;
        }

        // Check for higher-level headers that would break workbook parsing
        if (stripped.startsWith('#')) {
            let level = 0;
            for (const char of stripped) {
                if (char === '#') {
                    level++;
                } else {
                    break;
                }
            }
            if (level < sheetHeaderLevel) {
                break;
            }
        }

        if (stripped.startsWith(headerPrefix)) {
            if (currentSheetIdx < sheets.length) {
                sheets[currentSheetIdx].header_line = idx;
                currentSheetIdx++;
            } else {
                break;
            }
        }
    }

    return workbookDict;
}
