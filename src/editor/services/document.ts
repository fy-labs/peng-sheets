/**
 * Document service - Document section operations.
 *
 * Handles hybrid notebooks with mixed documents and workbook sections.
 */

import { Workbook } from 'md-spreadsheet-parser';
import type { EditorContext } from '../context';
import type { UpdateResult, EditorConfig, TabOrderItem } from '../types';
import {
    generateAndGetRange,
    getWorkbookRange,
    initializeTabOrderFromStructure,
    isTabOrderRedundant
} from './workbook';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get workbook range from context, using parser-detected values when available.
 * Falls back to getWorkbookRange for dynamic/modified text.
 */
function getWorkbookRangeFromContext(context: EditorContext): [number, number] {
    const configDict: EditorConfig = context.config ? JSON.parse(context.config) : {};
    const wbName = context.workbook?.name;
    const rootMarker = wbName ? `# ${wbName}` : (configDict.rootMarker ?? '# Workbook');
    const sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;

    if (context.workbook?.startLine !== undefined && context.workbook?.endLine !== undefined) {
        return [context.workbook.startLine, context.workbook.endLine];
    }
    return getWorkbookRange(context.mdText, rootMarker, sheetHeaderLevel);
}

// =============================================================================
// Document Section Range
// =============================================================================

/**
 * Get the line range of a document section in markdown.
 */
export function getDocumentSectionRange(
    context: EditorContext,
    sectionIndex: number
): { startLine: number; endLine: number } | { error: string } {
    const mdText = context.mdText;
    const [wbStart, wbEnd] = getWorkbookRangeFromContext(context);

    const lines = mdText.split('\n');
    let docIdx = 0;
    let currentDocStart: number | null = null;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        // Skip lines within the workbook range
        if (i >= wbStart && i < wbEnd) {
            // If we were tracking a document that ends at workbook start
            if (currentDocStart !== null) {
                return { startLine: currentDocStart, endLine: i };
            }
            continue;
        }

        if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
            // If we were tracking a document and hit another H1, end it here
            if (currentDocStart !== null) {
                return { startLine: currentDocStart, endLine: i };
            }

            // Found a document section
            if (docIdx === sectionIndex) {
                currentDocStart = i;
            }
            docIdx++;
        }
    }

    if (currentDocStart !== null) {
        return { startLine: currentDocStart, endLine: lines.length };
    }

    return { error: `Document section ${sectionIndex} not found` };
}

// =============================================================================
// Add Document
// =============================================================================

/**
 * Add a new document section.
 */
export function addDocument(
    context: EditorContext,
    title: string,
    afterDocIndex = -1,
    afterWorkbook = false,
    insertAfterTabOrderIndex = -1
): UpdateResult {
    const mdText = context.mdText;

    const lines = mdText.split('\n');
    // Python uses insertLine = 0 by default (insert at beginning)
    // Only set to len(lines) if afterDocIndex >= 0 and doc not found
    let insertLine = afterDocIndex >= 0 || afterWorkbook ? lines.length : 0;
    let docCount = 0;

    let inCodeBlock = false;

    // If afterWorkbook is true, always insert after the workbook section
    // afterDocIndex is then interpreted relative to documents AFTER workbook
    if (afterWorkbook) {
        const [, wbEnd] = getWorkbookRangeFromContext(context);
        insertLine = wbEnd;
        // No need to search for document positions - insert at workbook end
    } else {
        // Get workbook range for exclusion
        const [wbStart, wbEnd] = getWorkbookRangeFromContext(context);

        // Parse the structure to find insertion point
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
                // Document found
                if (afterDocIndex >= 0 && docCount === afterDocIndex) {
                    // Find end of this document
                    let nextI = i + 1;
                    while (nextI < lines.length) {
                        // Skip workbook range
                        if (nextI >= wbStart && nextI < wbEnd) {
                            break;
                        }
                        const nextLine = lines[nextI];
                        if (nextLine.trim().startsWith('```')) {
                            inCodeBlock = !inCodeBlock;
                        }
                        if (!inCodeBlock && nextLine.startsWith('# ') && !nextLine.startsWith('## ')) {
                            break;
                        }
                        nextI++;
                    }
                    insertLine = nextI;
                    break;
                }
                docCount++;
            }
        }
    }

    // Create the new document content
    // - If inserting at beginning (insertLine=0), no leading newlines needed
    // - Otherwise, ensure blank line before header (two newlines: one to end previous line, one blank line)
    const beforeLines = lines.slice(0, insertLine);
    const afterLines = lines.slice(insertLine);

    let newDocContent: string;
    if (insertLine === 0) {
        // At beginning - just the document header with trailing blank line
        newDocContent = `# ${title}\n\n`;
    } else {
        // Check if the previous line ends properly
        const lastLine = beforeLines[beforeLines.length - 1];
        const needsExtraNewline = lastLine.trim() !== '';
        // Ensure blank line before header
        newDocContent = needsExtraNewline ? `\n\n# ${title}\n\n` : `\n# ${title}\n\n`;
    }

    // Build new text
    const newMdText = beforeLines.join('\n') + newDocContent + afterLines.join('\n');
    context.mdText = newMdText;

    // Update tab_order
    const workbook = context.workbook;
    if (workbook) {
        const metadata = { ...(workbook.metadata || {}) };
        let tabOrder: TabOrderItem[] = [...(metadata.tab_order || [])];

        // If tab_order is empty, initialize from structure
        if (!tabOrder.length) {
            tabOrder = initializeTabOrderFromStructure(mdText, context.config, (workbook.sheets ?? []).length);
        }

        // Calculate new document index
        // The index should reflect the physical position among documents
        let newDocIndex: number;
        if (afterDocIndex >= 0) {
            // Inserting after a specific document
            newDocIndex = afterDocIndex + 1;
        } else if (insertAfterTabOrderIndex >= 0 && insertAfterTabOrderIndex < tabOrder.length) {
            // Inserting at a specific tab order position
            // Count documents that appear BEFORE this position in tab_order
            // These are the documents that will have lower indices than the new doc
            let docsBeforePosition = 0;
            for (let i = 0; i <= insertAfterTabOrderIndex; i++) {
                if (tabOrder[i].type === 'document') {
                    docsBeforePosition++;
                }
            }
            newDocIndex = docsBeforePosition;
        } else {
            // Default: append at end
            newDocIndex = tabOrder.filter((item) => item.type === 'document').length;
        }

        // Shift document indices >= newDocIndex
        for (const item of tabOrder) {
            if (item.type === 'document' && item.index >= newDocIndex) {
                item.index++;
            }
        }

        // Add new document
        const newDocItem: TabOrderItem = { type: 'document', index: newDocIndex };
        if (insertAfterTabOrderIndex >= 0 && insertAfterTabOrderIndex < tabOrder.length) {
            tabOrder.splice(insertAfterTabOrderIndex + 1, 0, newDocItem);
        } else {
            tabOrder.push(newDocItem);
        }

        metadata.tab_order = tabOrder;

        // Cleanup redundant tab_order
        if (isTabOrderRedundant(tabOrder, (workbook.sheets ?? []).length)) {
            delete metadata.tab_order;
        }

        const newWorkbook = new Workbook({ ...workbook, metadata });
        context.updateWorkbook(newWorkbook);
    }

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}

// =============================================================================
// Rename Document
// =============================================================================

/**
 * Rename a document section.
 */
export function renameDocument(context: EditorContext, docIndex: number, newTitle: string): UpdateResult {
    const rangeResult = getDocumentSectionRange(context, docIndex);
    if ('error' in rangeResult) {
        return { error: rangeResult.error };
    }

    const { startLine } = rangeResult;
    const lines = context.mdText.split('\n');

    // Replace the header line
    lines[startLine] = `# ${newTitle}`;
    const newMdText = lines.join('\n');
    context.mdText = newMdText;

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}

// =============================================================================
// Update Document Content
// =============================================================================

/**
 * Update document section content (title and body).
 * This is the unified function for document saving, similar to updateDocSheetContent.
 */
export function updateDocumentContent(
    context: EditorContext,
    docIndex: number,
    title: string,
    content: string
): UpdateResult {
    const rangeResult = getDocumentSectionRange(context, docIndex);
    if ('error' in rangeResult) {
        return { error: rangeResult.error };
    }

    const { startLine, endLine } = rangeResult;
    const lines = context.mdText.split('\n');

    // Build new document content: header + blank line + body + trailing newline
    const header = `# ${title}`;
    const body = content.endsWith('\n') ? content : content + '\n';
    const newDocContent = header + '\n\n' + body;
    const newDocLines = newDocContent.split('\n');

    // Replace the document section
    const beforeLines = lines.slice(0, startLine);
    const afterLines = lines.slice(endLine);
    const newLines = [...beforeLines, ...newDocLines, ...afterLines];
    const newMdText = newLines.join('\n');
    context.mdText = newMdText;

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}

// =============================================================================
// Delete Document
// =============================================================================

/**
 * Delete a document section.
 */
export function deleteDocument(context: EditorContext, docIndex: number): UpdateResult {
    const rangeResult = getDocumentSectionRange(context, docIndex);
    if ('error' in rangeResult) {
        return { error: rangeResult.error };
    }

    const { startLine, endLine } = rangeResult;
    const lines = context.mdText.split('\n');

    // Remove the document section
    lines.splice(startLine, endLine - startLine);
    const newMdText = lines.join('\n');
    context.mdText = newMdText;

    // Update tab_order
    const workbook = context.workbook;
    if (workbook) {
        const metadata = { ...(workbook.metadata || {}) };
        let tabOrder: TabOrderItem[] = [...(metadata.tab_order || [])];

        // Remove deleted document and shift indices
        tabOrder = tabOrder.filter((item) => !(item.type === 'document' && item.index === docIndex));

        for (const item of tabOrder) {
            if (item.type === 'document' && item.index > docIndex) {
                item.index--;
            }
        }

        metadata.tab_order = tabOrder;
        const newWorkbook = new Workbook({ ...workbook, metadata });
        context.updateWorkbook(newWorkbook);
    }

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length,
        file_changed: true
    };
}

/**
 * Delete document and return full update.
 * Matches Python's delete_document_and_get_full_update behavior:
 * 1. Delete document from md_text
 * 2. Regenerate workbook content
 * 3. Embed regenerated workbook back into md_text
 * 4. Return full md_text with workbook and structure
 */
export function deleteDocumentAndGetFullUpdate(context: EditorContext, docIndex: number): UpdateResult {
    // 1. Get original line count
    const originalMd = context.mdText;
    const originalLineCount = originalMd.split('\n').length;

    // 2. Delete the document (updates md_text in context)
    const deleteResult = deleteDocument(context, docIndex);
    if (deleteResult.error) {
        return deleteResult;
    }

    // 3. Regenerate workbook content
    const wbUpdate = generateAndGetRange(context);

    // 4. Embed the regenerated workbook content into the md_text
    let currentMd = context.mdText;
    let currentLines = currentMd.split('\n');

    if (wbUpdate && !wbUpdate.error && wbUpdate.content !== undefined) {
        const wbStart = wbUpdate.startLine!;
        const wbEnd = wbUpdate.endLine!;
        const wbContent = wbUpdate.content;
        const wbContentLines = wbContent.trimEnd().split('\n');
        if (wbContent) {
            wbContentLines.push('');
        }

        currentLines = [...currentLines.slice(0, wbStart), ...wbContentLines, ...currentLines.slice(wbEnd + 1)];
        currentMd = currentLines.join('\n');
        context.mdText = currentMd;
    }

    // 5. Get full state
    const fullStateJson = context.getFullStateDict();
    const fullState = JSON.parse(fullStateJson);

    return {
        content: currentMd,
        startLine: 0,
        endLine: originalLineCount - 1,
        endCol: 0,
        workbook: fullState.workbook,
        structure: fullState.structure,
        file_changed: true
    };
}

/**
 * Add document and return full update.
 * Matches Python's add_document_and_get_full_update behavior:
 * 1. Add document to md_text
 * 2. Regenerate workbook content
 * 3. Embed regenerated workbook back into md_text
 * 4. Return full md_text with workbook and structure
 */
export function addDocumentAndGetFullUpdate(
    context: EditorContext,
    title: string,
    afterDocIndex = -1,
    afterWorkbook = false,
    insertAfterTabOrderIndex = -1
): UpdateResult {
    // Capture original line count BEFORE modifying context
    // This represents what VS Code currently has - needed for accurate replace range
    const originalLineCount = context.mdText.split('\n').length;

    // 1. Add the document (updates md_text in context)
    const addResult = addDocument(context, title, afterDocIndex, afterWorkbook, insertAfterTabOrderIndex);
    if (addResult.error) {
        return addResult;
    }

    // 2. Get current md_text from context
    let currentMd = context.mdText;
    let lines = currentMd.split('\n');

    // 3. Regenerate workbook content
    const wbUpdate = generateAndGetRange(context);

    // 4. Embed the regenerated workbook content into the md_text
    if (wbUpdate && !wbUpdate.error && wbUpdate.content !== undefined) {
        const wbStart = wbUpdate.startLine!;
        const wbEnd = wbUpdate.endLine!;
        const wbContent = wbUpdate.content;
        const wbContentLines = wbContent.trimEnd().split('\n');
        if (wbContent) {
            wbContentLines.push('');
        }

        lines = [...lines.slice(0, wbStart), ...wbContentLines, ...lines.slice(wbEnd + 1)];
        currentMd = lines.join('\n');
        context.mdText = currentMd;
    }

    // 5. Get full state
    const fullStateJson = context.getFullStateDict();
    const fullState = JSON.parse(fullStateJson);

    // Use originalLineCount (captured before modification) as endLine
    // This represents VS Code's current document range that we're replacing
    return {
        content: currentMd,
        startLine: 0,
        endLine: originalLineCount - 1,
        workbook: fullState.workbook,
        structure: fullState.structure,
        file_changed: true
    };
}

// =============================================================================
// Move Document Section (Complex)
// =============================================================================

/**
 * Move a document section to a new position.
 * This is a pure physical move - metadata is NOT updated here.
 * The caller is responsible for updating tab_order metadata if needed (SPECS.md 8.6).
 */
export function moveDocumentSection(
    context: EditorContext,
    fromDocIndex: number,
    toDocIndex: number | null = null,
    toAfterWorkbook = false,
    toBeforeWorkbook = false
): UpdateResult {
    // Capture original line count BEFORE modifying context
    // This represents what VS Code currently has - needed for accurate replace range
    const originalLineCount = context.mdText.split('\n').length;

    // Get the document section to move
    const rangeResult = getDocumentSectionRange(context, fromDocIndex);
    if ('error' in rangeResult) {
        return { error: rangeResult.error };
    }

    const { startLine, endLine } = rangeResult;
    const lines = context.mdText.split('\n');

    // Extract the document content
    const docContent = lines.slice(startLine, endLine);

    // Remove from original position
    const linesWithoutDoc = [...lines];
    linesWithoutDoc.splice(startLine, endLine - startLine);

    const configDict: EditorConfig = context.config ? JSON.parse(context.config) : {};
    const wbName = context.workbook?.name;
    const rootMarker = wbName ? `# ${wbName}` : (configDict.rootMarker ?? '# Workbook');
    const sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;

    // Calculate new insertion point
    let insertLine: number = linesWithoutDoc.length;

    if (toAfterWorkbook) {
        const tempText = linesWithoutDoc.join('\n');
        const [, wbEnd] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);
        insertLine = wbEnd;
    } else if (toBeforeWorkbook) {
        // Moving to before workbook section
        // If toDocIndex is specified, insert at that position among docs-before-WB
        // Otherwise, insert just before WB
        if (toDocIndex !== null && toDocIndex === 0) {
            // Insert at the very beginning (before first doc)
            insertLine = 0;
        } else if (toDocIndex !== null) {
            // Find the target doc position
            let docIdx = 0;
            let foundTarget = false;
            let inCodeBlock = false;
            const tempText = linesWithoutDoc.join('\n');
            const [wbStart] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);

            for (let i = 0; i < wbStart; i++) {
                const line = linesWithoutDoc[i];
                if (line.trim().startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                }
                if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
                    if (docIdx === toDocIndex) {
                        insertLine = i;
                        foundTarget = true;
                        break;
                    }
                    docIdx++;
                }
            }
            if (!foundTarget) {
                insertLine = wbStart;
            }
        } else {
            const tempText = linesWithoutDoc.join('\n');
            const [wbStart] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);
            insertLine = wbStart;
        }
    } else if (toDocIndex !== null) {
        // toDocIndex semantics: insert at position toDocIndex
        // This means: insert AFTER the document at position (toDocIndex - 1)
        // When toDocIndex=0, insert at beginning
        // When toDocIndex=numDocs, insert at end

        // Adjust toDocIndex for the case where source doc was before target
        // Since we removed fromDocIndex first, indices shift down
        const adjustedToDocIndex = fromDocIndex < toDocIndex ? toDocIndex - 1 : toDocIndex;

        // Find the target insert position
        let docIdx = 0;
        let targetLine = linesWithoutDoc.length;
        let inCodeBlock = false;
        let foundTarget = false;

        // If adjustedToDocIndex is 0, insert at first doc position
        // This needs to respect the doc zone (before or after WB)
        if (adjustedToDocIndex === 0) {
            // For WB-after-docs case: first doc position is at beginning
            // For WB-before-docs case: first doc position is after WB
            // We need to decide based on where the from-doc was originally
            const tempText = linesWithoutDoc.join('\n');
            const [wbStart, wbEnd] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);
            const originalText = context.mdText;
            const [originalWbStart] = getWorkbookRange(originalText, rootMarker, sheetHeaderLevel);
            const fromDocWasBeforeWb = startLine < originalWbStart;

            if (fromDocWasBeforeWb) {
                // Doc was before WB - insert at file beginning
                targetLine = 0;
            } else if (wbStart < linesWithoutDoc.length) {
                // Doc was after WB (or WB exists and we need to respect zones)
                // Insert at beginning of after-WB zone = after WB
                targetLine = wbEnd;
            } else {
                // No WB, insert at beginning
                targetLine = 0;
            }
            foundTarget = true;
        } else {
            // Find the document at position (adjustedToDocIndex - 1) and get its END
            const targetDocIdx = adjustedToDocIndex - 1;

            // Get workbook range once (outside loop)
            const tempText2 = linesWithoutDoc.join('\n');
            const [tempWbStart2, tempWbEnd2] = getWorkbookRange(tempText2, rootMarker, sheetHeaderLevel);

            for (let i = 0; i < linesWithoutDoc.length; i++) {
                const line = linesWithoutDoc[i];
                if (line.trim().startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                }

                // Skip workbook range
                if (i >= tempWbStart2 && i < tempWbEnd2) {
                    continue;
                }

                if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
                    if (docIdx === targetDocIdx) {
                        // Found the target doc - now find its END (next H1 or EOF)
                        let endLine = linesWithoutDoc.length;
                        let endCodeBlock = false;
                        for (let j = i + 1; j < linesWithoutDoc.length; j++) {
                            const nextLine = linesWithoutDoc[j];
                            if (nextLine.trim().startsWith('```')) {
                                endCodeBlock = !endCodeBlock;
                            }
                            if (!endCodeBlock && nextLine.startsWith('# ') && !nextLine.startsWith('## ')) {
                                endLine = j;
                                break;
                            }
                        }
                        targetLine = endLine;
                        foundTarget = true;
                        break;
                    }
                    docIdx++;
                }
            }
        }

        // Check if target is "After Last Document" (Append to doc zone)
        if (!foundTarget && docIdx === adjustedToDocIndex) {
            // For before-WB docs, insert before WB (not at EOF)
            const tempText = linesWithoutDoc.join('\\n');
            const [wbStart] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);
            const originalText = context.mdText;
            const [originalWbStart] = getWorkbookRange(originalText, rootMarker, sheetHeaderLevel);
            const fromDocWasBeforeWb = startLine < originalWbStart;

            if (wbStart < linesWithoutDoc.length && fromDocWasBeforeWb) {
                // WB exists and from-doc was before WB - insert just before WB
                targetLine = wbStart;
            } else {
                // No WB or from-doc was after WB - insert at EOF
                targetLine = linesWithoutDoc.length;
            }
            foundTarget = true;
        }

        // If target not found, insert at an appropriate boundary
        if (!foundTarget) {
            // Check if WB exists and determine where from-doc was originally
            const tempText = linesWithoutDoc.join('\n');
            const [wbStart] = getWorkbookRange(tempText, rootMarker, sheetHeaderLevel);

            // Check if from-doc was before or after WB in original text
            const originalText = context.mdText;
            const [originalWbStart] = getWorkbookRange(originalText, rootMarker, sheetHeaderLevel);
            const fromDocWasBeforeWb = startLine < originalWbStart;

            if (wbStart < linesWithoutDoc.length && fromDocWasBeforeWb) {
                // WB exists and from-doc was before WB - insert just before WB
                targetLine = wbStart;
            } else {
                // No WB or from-doc was after WB - insert at EOF
                targetLine = linesWithoutDoc.length;
            }
        }
        insertLine = targetLine;
    } else {
        insertLine = linesWithoutDoc.length;
    }

    // Ensure proper blank line separation when inserting
    // 1. If inserting at beginning, ensure blank line after document
    // 2. If inserting in middle, ensure blank line before and after
    // 3. If inserting at end, ensure blank line before

    // First, normalize docContent to have exactly one trailing blank line
    // Strip any leading/trailing blank lines from docContent for normalization
    const normalizedContent = [...docContent];

    // Remove trailing blank lines from docContent
    while (normalizedContent.length > 0 && normalizedContent[normalizedContent.length - 1].trim() === '') {
        normalizedContent.pop();
    }

    // Remove leading blank lines from docContent
    while (normalizedContent.length > 0 && normalizedContent[0].trim() === '') {
        normalizedContent.shift();
    }

    // Now insert with proper separation
    if (insertLine === 0) {
        // Inserting at beginning - add blank line after
        linesWithoutDoc.splice(insertLine, 0, ...normalizedContent, '');
    } else if (insertLine >= linesWithoutDoc.length) {
        // Inserting at end - ensure blank line before if previous line is not blank
        if (linesWithoutDoc.length > 0 && linesWithoutDoc[linesWithoutDoc.length - 1].trim() !== '') {
            linesWithoutDoc.push('');
        }
        linesWithoutDoc.push(...normalizedContent);
    } else {
        // Inserting in middle - ensure blank lines before and after
        const prevLine = linesWithoutDoc[insertLine - 1];
        const needsBlankBefore = prevLine.trim() !== '';
        const nextLine = linesWithoutDoc[insertLine];
        const needsBlankAfter = nextLine.trim() !== '' && !nextLine.startsWith('#');

        const contentToInsert = [...normalizedContent];
        if (needsBlankAfter) {
            contentToInsert.push('');
        }
        if (needsBlankBefore) {
            contentToInsert.unshift('');
        }
        linesWithoutDoc.splice(insertLine, 0, ...contentToInsert);
    }

    const newMdText = linesWithoutDoc.join('\n');
    context.mdText = newMdText;

    return {
        content: context.mdText,
        startLine: 0,
        endLine: originalLineCount - 1,
        file_changed: true
    };
}

// =============================================================================
// Move Workbook Section (Complex)
// =============================================================================

/**
 * Move the workbook section to a new position.
 * This is one of the most complex operations.
 */
export function moveWorkbookSection(
    context: EditorContext,
    toDocIndex: number | null = null,
    toAfterDoc = false,
    toBeforeDoc = false,
    _targetTabOrderIndex: number | null = null
): UpdateResult {
    const configDict: EditorConfig = context.config ? JSON.parse(context.config) : {};
    const _sheetHeaderLevel = configDict.sheetHeaderLevel ?? 2;

    const mdText = context.mdText;
    const lines = mdText.split('\n');

    // Find workbook range - use parser-detected range if available
    const [wbStart, wbEnd] = getWorkbookRangeFromContext(context);

    if (wbStart >= lines.length) {
        return { error: 'No workbook section found' };
    }

    // Extract workbook content
    const wbContent = lines.slice(wbStart, wbEnd);

    // Remove workbook from original position
    const linesWithoutWb = [...lines];
    linesWithoutWb.splice(wbStart, wbEnd - wbStart);

    // Calculate new insertion point
    let insertLine: number;

    if (toDocIndex !== null) {
        // Find the target document position
        let docIdx = 0;
        let targetLine = 0;
        let inCodeBlock = false;

        for (let i = 0; i < linesWithoutWb.length; i++) {
            const line = linesWithoutWb[i];
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }

            if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
                // All H1s in linesWithoutWb are documents (workbook was removed)
                if (docIdx === toDocIndex && toBeforeDoc) {
                    // For toBeforeDoc, insert before this document
                    targetLine = i;
                    break;
                }
                docIdx++;
            }
        }

        if (toAfterDoc) {
            // Find end of target document
            let foundDoc = false;
            docIdx = 0;
            inCodeBlock = false;

            for (let i = 0; i < linesWithoutWb.length; i++) {
                const line = linesWithoutWb[i];
                if (line.trim().startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                }

                if (!inCodeBlock && line.startsWith('# ') && !line.startsWith('## ')) {
                    // All H1s in linesWithoutWb are documents (workbook was removed)
                    if (foundDoc) {
                        targetLine = i;
                        break;
                    }

                    if (docIdx === toDocIndex) {
                        foundDoc = true;
                    }
                    docIdx++;
                }
            }

            if (foundDoc && targetLine === 0) {
                targetLine = linesWithoutWb.length;
            }
        }

        insertLine = targetLine;
    } else {
        insertLine = linesWithoutWb.length;
    }

    // Insert at new position
    linesWithoutWb.splice(insertLine, 0, ...wbContent);
    const newMdText = linesWithoutWb.join('\n');
    context.mdText = newMdText;

    // Only initialize from structure if tab_order is missing AND was not explicitly removed
    if (context.workbook && _targetTabOrderIndex !== null) {
        const existingTabOrder = context.workbook.metadata?.tab_order;

        if (!existingTabOrder || (Array.isArray(existingTabOrder) && existingTabOrder.length === 0)) {
            // Check if tab_order was explicitly removed by updateWorkbookTabOrder(null)
            // If metadata is undefined or empty object, it was explicitly cleared - don't reinit
            // (metadata becomes undefined when tab_order was the only property and was deleted)
            const metadataWasCleared =
                !context.workbook.metadata || Object.keys(context.workbook.metadata).length === 0;

            if (!metadataWasCleared) {
                // Metadata exists with other properties but no tab_order - initialize from structure
                const metadata = { ...(context.workbook.metadata || {}) };
                const tabOrder = initializeTabOrderFromStructure(
                    newMdText,
                    context.config,
                    (context.workbook.sheets ?? []).length
                );
                metadata.tab_order = tabOrder;
                const newWorkbook = new Workbook({ ...context.workbook, metadata });
                context.updateWorkbook(newWorkbook);
            }
            // If metadataWasCleared, respect the explicit deletion by updateWorkbookTabOrder(null)
        }
        // If tab_order already exists (pre-set by caller), keep it as-is
    }

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length,
        file_changed: true
    };
}

// =============================================================================
// Frontmatter Operations
// =============================================================================

/**
 * Find the range of YAML frontmatter block and its body content.
 * Returns null if no valid frontmatter is found.
 *
 * - yamlStart: line index of opening `---` (always 0)
 * - yamlEnd: line index of closing `---`
 * - bodyEnd: line index of first H1 header (or total lines if none)
 */
function getFrontmatterRange(lines: string[]): { yamlStart: number; yamlEnd: number; bodyEnd: number } | null {
    if (lines.length === 0 || lines[0].trim() !== '---') {
        return null;
    }

    // Find closing ---
    let yamlEnd = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            yamlEnd = i;
            break;
        }
    }
    if (yamlEnd < 0) return null;

    // Find first H1 (body extends from yamlEnd+1 to first H1 or EOF)
    let bodyEnd = lines.length;
    let inCodeBlock = false;
    for (let i = yamlEnd + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('```')) inCodeBlock = !inCodeBlock;
        if (!inCodeBlock && lines[i].startsWith('# ') && !lines[i].startsWith('## ')) {
            bodyEnd = i;
            break;
        }
    }

    return { yamlStart: 0, yamlEnd, bodyEnd };
}

/**
 * Update the body content of the frontmatter section.
 * The body is the text between the closing `---` and the first H1 header.
 */
export function updateFrontmatterContent(context: EditorContext, content: string): UpdateResult {
    const lines = context.mdText.split('\n');
    const range = getFrontmatterRange(lines);
    if (!range) {
        return { error: 'No frontmatter found' };
    }

    const { yamlEnd, bodyEnd } = range;

    // Build new body: blank line after ---, content, blank line before H1
    // \n\n after --- creates a blank line separator; \n\n before H1 creates blank line before heading
    const body = content.trim() ? '\n\n' + content.trimEnd() + '\n\n' : '\n\n';

    // Replace lines between yamlEnd (inclusive of ---) and bodyEnd
    const beforeLines = lines.slice(0, yamlEnd + 1); // includes the closing ---
    const afterLines = lines.slice(bodyEnd);
    const newMdText = beforeLines.join('\n') + body + afterLines.join('\n');
    context.mdText = newMdText;

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}

/**
 * Rename the frontmatter title field.
 * Updates the `title:` value in the YAML frontmatter block.
 */
export function renameFrontmatterTitle(context: EditorContext, newTitle: string): UpdateResult {
    const lines = context.mdText.split('\n');
    const range = getFrontmatterRange(lines);
    if (!range) {
        return { error: 'No frontmatter found' };
    }

    const { yamlEnd } = range;

    // Find and replace the title line within the YAML block
    let titleFound = false;
    for (let i = 1; i < yamlEnd; i++) {
        const match = lines[i].match(/^title:\s*/);
        if (match) {
            lines[i] = `title: ${newTitle}`;
            titleFound = true;
            break;
        }
    }

    if (!titleFound) {
        return { error: 'No title field found in frontmatter' };
    }

    const newMdText = lines.join('\n');
    context.mdText = newMdText;

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}

/**
 * Delete the frontmatter section entirely.
 * Removes the YAML `---` block and all body content up to the first H1 header.
 */
export function deleteFrontmatter(context: EditorContext): UpdateResult {
    const lines = context.mdText.split('\n');
    const range = getFrontmatterRange(lines);
    if (!range) {
        return { error: 'No frontmatter found' };
    }

    const { bodyEnd } = range;

    // Remove everything from start to bodyEnd
    const afterLines = lines.slice(bodyEnd);
    // Strip leading blank lines from the remaining content
    let startIdx = 0;
    while (startIdx < afterLines.length && afterLines[startIdx].trim() === '') {
        startIdx++;
    }
    const newMdText = afterLines.slice(startIdx).join('\n');
    context.mdText = newMdText;

    return {
        content: newMdText,
        startLine: 0,
        endLine: lines.length - 1,
        file_changed: true
    };
}
