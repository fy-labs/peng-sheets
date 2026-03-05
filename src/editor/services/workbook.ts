/**
 * Workbook service - Core workbook operations.
 * Converted from python-modules/src/md_spreadsheet_editor/services/workbook.py
 */

import { Workbook, Sheet } from 'md-spreadsheet-parser';
import type { EditorContext } from '../context';
import type { UpdateResult, TabOrderItem, EditorConfig } from '../types';

/**
 * Initialize tab_order by parsing the structure of the markdown document.
 */
export function initializeTabOrderFromStructure(
    mdText: string,
    config: string | null,
    numSheets: number,
    workbookStartLine?: number,
    workbookEndLine?: number
): TabOrderItem[] {
    const configDict: EditorConfig = config ? JSON.parse(config) : {};
    const rootMarker = configDict.rootMarker ?? '# Workbook';

    if (!mdText) {
        // No markdown text, just return sheets in order
        return Array.from({ length: numSheets }, (_, i) => ({
            type: 'sheet' as const,
            index: i
        }));
    }

    // Determine workbook range
    const sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;
    let wbStart: number;
    let wbEnd: number;
    if (workbookStartLine !== undefined && workbookEndLine !== undefined) {
        wbStart = workbookStartLine;
        wbEnd = workbookEndLine;
    } else {
        [wbStart, wbEnd] = getWorkbookRange(mdText, rootMarker, sheetHeaderLevel);
    }

    const lines = mdText.split('\n');
    const tabOrder: TabOrderItem[] = [];
    let docIndex = 0;
    let workbookFound = false;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        // Skip lines within the workbook range
        if (i >= wbStart && i < wbEnd) {
            if (i === wbStart && !workbookFound) {
                // Insert all sheets at the workbook's position
                workbookFound = true;
                for (let s = 0; s < numSheets; s++) {
                    tabOrder.push({ type: 'sheet', index: s });
                }
            }
            continue;
        }

        if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
            // Document section (outside workbook range)
            tabOrder.push({ type: 'document', index: docIndex });
            docIndex++;
        }
    }

    // If no workbook found but we have sheets, append them at the end
    if (!workbookFound && numSheets > 0) {
        for (let i = 0; i < numSheets; i++) {
            tabOrder.push({ type: 'sheet', index: i });
        }
    }

    return tabOrder;
}

/**
 * Check if tab_order is redundant (matches natural order).
 * Natural order is: all sheets first (index 0,1,2,...), then all documents (index 0,1,2,...).
 * If tab_order matches this, it can be safely deleted to avoid unnecessary metadata.
 */
export function isTabOrderRedundant(tabOrder: TabOrderItem[], numSheets: number): boolean {
    // Count expected items
    const numDocs = tabOrder.filter((item) => item.type === 'document').length;
    const expectedLength = numSheets + numDocs;

    if (tabOrder.length !== expectedLength) {
        return false;
    }

    // Check: first numSheets items are sheets in order 0,1,2,...
    for (let i = 0; i < numSheets; i++) {
        if (tabOrder[i].type !== 'sheet' || tabOrder[i].index !== i) {
            return false;
        }
    }

    // Check: remaining items are documents in order 0,1,2,...
    for (let i = 0; i < numDocs; i++) {
        if (tabOrder[numSheets + i].type !== 'document' || tabOrder[numSheets + i].index !== i) {
            return false;
        }
    }

    return true;
}

/**
 * Update the tab display order in workbook metadata.
 * Pass null to delete tab_order (when metadata is not needed).
 */
export function updateWorkbookTabOrder(context: EditorContext, tabOrder: TabOrderItem[] | null): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        const currentMetadata = wb.metadata ? { ...wb.metadata } : {};
        if (tabOrder === null) {
            // Delete tab_order when not needed
            delete currentMetadata.tab_order;
        } else {
            currentMetadata.tab_order = tabOrder;
        }
        // If metadata is empty after deletion, set to undefined to avoid empty {} in output
        const finalMetadata = Object.keys(currentMetadata).length > 0 ? currentMetadata : undefined;
        return new Workbook({
            ...wb,
            metadata: finalMetadata
        });
    };

    return updateWorkbook(context, wbTransform);
}

/**
 * Update workbook metadata with the provided fields.
 * Merges the updates with existing metadata.
 */
export function updateWorkbookMetadata(context: EditorContext, updates: Record<string, unknown>): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        const currentMetadata = wb.metadata ? { ...wb.metadata } : {};
        const newMetadata = { ...currentMetadata, ...updates };
        // If metadata is empty, set to undefined to avoid empty {} in output
        const finalMetadata = Object.keys(newMetadata).length > 0 ? newMetadata : undefined;
        return new Workbook({
            ...wb,
            metadata: finalMetadata
        });
    };

    return updateWorkbook(context, wbTransform);
}

/**
 * Update the root content of a workbook.
 * Root content is the markdown content that appears before any sheets.
 */
export function updateRootContent(context: EditorContext, content: string): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        return new Workbook({
            ...wb,
            rootContent: content
        });
    };

    return updateWorkbook(context, wbTransform);
}

/**
 * Delete the root content of a workbook (set to empty string).
 */
export function deleteRootContent(context: EditorContext): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        return new Workbook({
            ...wb,
            rootContent: ''
        });
    };

    return updateWorkbook(context, wbTransform);
}

/**
 * Rename a workbook (update workbook name).
 */
export function renameWorkbook(context: EditorContext, newName: string): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        return new Workbook({
            ...wb,
            name: newName
        });
    };

    return updateWorkbook(context, wbTransform);
}

/**
 * Get the line range of the workbook section in markdown.
 */
export function getWorkbookRange(mdText: string, rootMarker: string, sheetHeaderLevel: number): [number, number] {
    const lines = mdText.split('\n');
    let startLine = 0;
    let found = false;
    let inCodeBlock = false;

    if (rootMarker) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }
            if (!inCodeBlock && line.trim() === rootMarker) {
                startLine = i;
                found = true;
                break;
            }
        }

        if (!found) {
            startLine = lines.length;
        }
    }

    let endLine = lines.length;

    const getLevel = (s: string): number => {
        let lvl = 0;
        for (const c of s) {
            if (c === '#') {
                lvl++;
            } else {
                break;
            }
        }
        return lvl;
    };

    inCodeBlock = false;
    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        if (!inCodeBlock && line.startsWith('#')) {
            const lvl = getLevel(line);
            if (lvl < sheetHeaderLevel) {
                endLine = i;
                break;
            }
        }
    }

    return [startLine, endLine];
}

/**
 * Update the workbook using a transform function.
 */
export function updateWorkbook(context: EditorContext, transformFunc: (wb: Workbook) => Workbook): UpdateResult {
    if (context.workbook === null) {
        return { error: 'No workbook' };
    }

    try {
        const newWorkbook = transformFunc(context.workbook);
        context.updateWorkbook(newWorkbook);
        return generateAndGetRange(context);
    } catch (e) {
        return { error: String(e) };
    }
}

/**
 * Generate markdown and get the replacement range.
 */
export function generateAndGetRange(context: EditorContext): UpdateResult {
    const workbook = context.workbook;
    const schema = context.schema;
    const mdText = context.mdText;
    const config = context.config;

    // Check if tab_order matches natural order - if so, remove it before generating
    // Natural order is computed from ACTUAL FILE STRUCTURE, not from tab_order
    if (workbook && workbook.metadata?.tab_order) {
        const tabOrder = workbook.metadata.tab_order as TabOrderItem[];
        const numSheets = (workbook.sheets ?? []).length;

        // Parse file structure from mdText to get true natural order
        const mdText = context.mdText;
        const configDict = context.config ? JSON.parse(context.config) : {};
        const sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;

        // Get workbook position in file - use parser-detected range if available
        let wbStart: number;
        let wbEnd: number;
        let rootMarker: string;

        if (workbook.startLine !== undefined && workbook.endLine !== undefined && workbook.name) {
            wbStart = workbook.startLine;
            wbEnd = workbook.endLine;
            // workbook.name is just the name without # prefix, add it for line comparison
            rootMarker = `# ${workbook.name}`;
        } else {
            rootMarker = configDict.rootMarker ?? '# Workbook';
            [wbStart, wbEnd] = getWorkbookRange(mdText, rootMarker, sheetHeaderLevel);
        }
        const lines = mdText.split('\n');

        // Find docs before and after WB in the ACTUAL FILE
        const docsBeforeWb: number[] = [];
        const docsAfterWb: number[] = [];
        let docIdx = 0;
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }

            // Skip lines within the workbook range
            if (i >= wbStart && i < wbEnd) {
                continue;
            }

            if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
                // This is a document section (outside workbook range)
                if (i < wbStart) {
                    docsBeforeWb.push(docIdx);
                } else {
                    docsAfterWb.push(docIdx);
                }
                docIdx++;
            }
        }

        // Compute natural order from file structure
        const naturalOrder: TabOrderItem[] = [
            ...docsBeforeWb.map((idx) => ({ type: 'document' as const, index: idx })),
            ...Array.from({ length: numSheets }, (_, i) => ({ type: 'sheet' as const, index: i })),
            ...docsAfterWb.map((idx) => ({ type: 'document' as const, index: idx }))
        ];

        // Compare tab_order with computed natural order
        let matchesNatural = tabOrder.length === naturalOrder.length;
        if (matchesNatural) {
            for (let i = 0; i < tabOrder.length; i++) {
                if (tabOrder[i].type !== naturalOrder[i].type || tabOrder[i].index !== naturalOrder[i].index) {
                    matchesNatural = false;
                    break;
                }
            }
        }

        // If matches natural, remove tab_order from metadata
        if (matchesNatural) {
            const newMetadata = { ...workbook.metadata };
            delete newMetadata.tab_order;
            const cleanedWorkbook = new Workbook({
                ...workbook,
                metadata: Object.keys(newMetadata).length > 0 ? newMetadata : undefined
            });
            context.updateWorkbook(cleanedWorkbook);
        }
    }

    // Re-get workbook after potential cleanup
    const cleanWorkbook = context.workbook;

    // Generate Markdown (Full Workbook)
    // Call toMarkdown when workbook has sheets OR rootContent
    let newMd = '';
    const hasSheets = (cleanWorkbook?.sheets ?? []).length > 0;
    const hasRootContent = !!cleanWorkbook?.rootContent;
    if (cleanWorkbook && (hasSheets || hasRootContent)) {
        if (schema) {
            newMd = cleanWorkbook.toMarkdown(schema);
        }
    }

    // Determine replacement range
    // ALWAYS use getWorkbookRange for dynamic detection since mdText may have changed
    // (Parser values workbook.startLine/endLine become stale after addDocument/moveDocument)
    const configDict: EditorConfig = config ? JSON.parse(config) : {};
    const sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;

    // Build rootMarker from workbook name or config
    const wbName = workbook?.name;
    const rootMarker = wbName ? `# ${wbName}` : (configDict.rootMarker ?? '# Workbook');

    // Use parser-detected range for virtual root workbooks (rootMarker not in text).
    // For normal workbooks, use dynamic detection (parser values become stale after mutations).
    let startLine: number;
    let rawEndLine: number;
    if (workbook?.startLine !== undefined && workbook?.endLine !== undefined) {
        // Check if rootMarker actually exists in text
        const lines = mdText.split('\n');
        const rootInText = lines.some((line) => line.trim() === rootMarker);
        if (rootInText) {
            // Normal workbook: use dynamic detection
            [startLine, rawEndLine] = getWorkbookRange(mdText, rootMarker, sheetHeaderLevel);
        } else {
            // Virtual root: workbook IS the entire file (no H1 boundary).
            // Use parser startLine but endLine = EOF (parser endLine may not cover
            // all H2 sections like doc sheets).
            startLine = workbook.startLine;
            rawEndLine = lines.length;
        }
    } else {
        [startLine, rawEndLine] = getWorkbookRange(mdText, rootMarker, sheetHeaderLevel);
    }
    const lines = mdText.split('\n');

    let endLine = rawEndLine;
    let endCol = 0;

    if (endLine >= lines.length) {
        // Range extends to EOF - replace everything to the end of the last line
        endLine = lines.length - 1;
        endCol = endLine >= 0 ? lines[endLine].length : 0;
    } else {
        // Range ends before EOF (e.g., there's another H1 section after)
        // endLine points to the next section's header, so we need to replace up to (but not including) that line
        if (endLine > 0) {
            endLine = endLine - 1;
            endCol = lines[endLine].length;
        }
    }

    let content = newMd + '\n';

    // Ensure empty line before appended content if file is not empty
    if (startLine >= lines.length && mdText) {
        let trailingNewlines = 0;
        for (let i = mdText.length - 1; i >= 0; i--) {
            if (mdText[i] === '\n') {
                trailingNewlines++;
            } else {
                break;
            }
        }

        const needed = Math.max(0, 2 - trailingNewlines);
        content = '\n'.repeat(needed) + content;
    }

    return {
        startLine,
        endLine,
        endCol,
        content
    };
}

/**
 * Reorder tab_order metadata after a physical move of a sheet or document.
 */
export function reorderTabMetadata(
    wb: Workbook | null,
    itemType: 'sheet' | 'document',
    fromIdx: number,
    toIdx: number,
    targetTabOrderIndex: number | null
): Workbook | null {
    if (!wb || !wb.metadata) {
        return wb;
    }

    const metadata = { ...wb.metadata };
    const tabOrder: TabOrderItem[] = [...(metadata.tab_order || [])];

    if (!tabOrder.length) {
        return wb;
    }

    const indicesInTabOrder = tabOrder.filter((item) => item.type === itemType).map((item) => item.index);

    if (!indicesInTabOrder.length) {
        return wb;
    }

    let maxIndex = Math.max(...indicesInTabOrder);
    maxIndex = Math.max(maxIndex, fromIdx);
    const clampedToIdx = Math.min(toIdx, maxIndex);

    const dummyList = Array.from({ length: maxIndex + 1 }, (_, i) => i);

    if (fromIdx < dummyList.length) {
        const movedItem = dummyList.splice(fromIdx, 1)[0];
        const insertIdx = Math.max(0, Math.min(clampedToIdx, dummyList.length));
        dummyList.splice(insertIdx, 0, movedItem);
    }

    const newIndexMap = new Map<number, number>();
    dummyList.forEach((old, newPos) => {
        newIndexMap.set(old, newPos);
    });

    let movedTabOrderItem: TabOrderItem | null = null;

    for (const item of tabOrder) {
        if (item.type === itemType) {
            const oldIdx = item.index;
            if (newIndexMap.has(oldIdx)) {
                item.index = newIndexMap.get(oldIdx)!;
            }

            if (oldIdx === fromIdx) {
                movedTabOrderItem = item;
            }
        }
    }

    if (movedTabOrderItem && targetTabOrderIndex !== null) {
        const currPos = tabOrder.indexOf(movedTabOrderItem);
        if (currPos >= 0) {
            tabOrder.splice(currPos, 1);

            // Adjust target index if we removed an item that was before the target
            let adjustedTarget = targetTabOrderIndex;
            if (currPos < targetTabOrderIndex) {
                adjustedTarget -= 1;
            }

            const safeTarget = Math.max(0, Math.min(adjustedTarget, tabOrder.length));
            tabOrder.splice(safeTarget, 0, movedTabOrderItem);
        }
    }

    metadata.tab_order = tabOrder;
    return new Workbook({
        ...wb,
        metadata
    });
}

/**
 * Apply a sheet-level update using a transform function.
 */
export function applySheetUpdate(
    context: EditorContext,
    sheetIdx: number,
    transformFunc: (sheet: Sheet) => Sheet
): UpdateResult {
    const wbTransform = (wb: Workbook): Workbook => {
        const newSheets = [...(wb.sheets ?? [])];
        if (sheetIdx < 0 || sheetIdx >= newSheets.length) {
            throw new Error('Invalid sheet index');
        }

        const targetSheet = newSheets[sheetIdx];
        const newSheet = transformFunc(targetSheet);
        newSheets[sheetIdx] = newSheet;

        return new Workbook({
            ...wb,
            sheets: newSheets
        });
    };

    return updateWorkbook(context, wbTransform);
}
