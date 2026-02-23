/**
 * Tab Reorder Service
 *
 * Pure functions for determining tab reorder actions.
 * Implements SPECS.md 8.6 Tab Reorder Test Matrix via Finite Pattern Architecture.
 *
 * Architecture:
 * - determineReorderAction (Dispatcher)
 *   - handleSheetToSheet
 *   - handleSheetToDoc
 *   - handleDocToDoc
 *   - handleDocToSheet
 */

// =============================================================================
// Types
// =============================================================================

export interface TabOrderItem {
    type: 'sheet' | 'document';
    index: number;
}

/**
 * Represents the physical structure of the Markdown file.
 * All arrays contain indices in their physical order.
 */
export interface FileStructure {
    docsBeforeWb: number[]; // docIndex array (physical order)
    sheets: number[]; // sheetIndex array (physical order in Workbook)
    docsAfterWb: number[]; // docIndex array (physical order)
    hasWorkbook: boolean;
}

/**
 * Physical move to execute on the Markdown file.
 */
export type PhysicalMove =
    | { type: 'move-sheet'; fromSheetIndex: number; toSheetIndex: number }
    | { type: 'move-workbook'; direction: 'before-doc' | 'after-doc'; targetDocIndex: number }
    | {
          type: 'move-document';
          fromDocIndex: number;
          toDocIndex: number | null;
          toAfterWorkbook: boolean;
          toBeforeWorkbook: boolean;
      };

/**
 * Result of determining what action to take for a tab reorder.
 */
export interface ReorderAction {
    actionType: 'no-op' | 'physical' | 'metadata' | 'physical+metadata';
    physicalMove?: PhysicalMove;
    /** Secondary physical moves needed when primary move causes doc position changes */
    secondaryPhysicalMoves?: PhysicalMove[];
    newFileStructure?: FileStructure;
    newTabOrder?: TabOrderItem[];
    metadataRequired: boolean;
}

export interface TabInfo {
    type: 'sheet' | 'document' | 'add-sheet';
    sheetIndex?: number;
    docIndex?: number;
}

// =============================================================================
// Finite Pattern Types (SPECS.md 8.6.8)
// =============================================================================

/**
 * Sheet → Sheet patterns (within Workbook)
 * @see SPECS.md 8.6.8 Sheet → Sheet (In-Workbook)
 */
export type SheetToSheetPattern =
    | 'SS1_adjacent_no_docs' // Adjacent swap, no docs present
    | 'SS2_adjacent_with_docs' // Adjacent swap, docs exist
    | 'SS3_non_adjacent'; // Non-adjacent swap

/**
 * Sheet → Document patterns (Workbook moves or metadata)
 * @see SPECS.md 8.6.8 Sheet → Before/After Document
 */
export type SheetToDocPattern =
    // Before Document
    | 'SBD1_single_before_doc' // Single sheet before doc
    | 'SBD2_multi_before_doc' // Multi-sheet, one before doc
    // After Document
    | 'SAD1_single_after_doc' // Single sheet after doc
    | 'SAD2_multi_after_no_reorder' // Multi-sheet after doc, no sheet reorder
    | 'SAD3_doc_first_order_same' // Doc first, sheets contiguous, order same (H9)
    | 'SAD4_doc_first_order_differs' // Doc first, sheets contiguous, order differs (H11)
    | 'SAD5_sheet_past_docs' // Sheet to end across docs (H10)
    // Inside Doc Range (C8)
    | 'SIDR1_inside_not_last' // Non-last sheet to doc range
    | 'SIDR2_inside_already_last'; // Last sheet to doc range

/**
 * Document → Document patterns
 * @see SPECS.md 8.6.8 Document → Document
 */
export type DocToDocPattern =
    | 'DD1_both_before_wb' // Both before WB
    | 'DD2_both_after_wb' // Both after WB
    | 'DD3_cross_before_to_after' // Cross WB: before→after
    | 'DD4_cross_after_to_before' // Cross WB: after→before
    | 'DD5_interleaved_reorder'; // Interleaved docs reorder

/**
 * Document → Between Sheets patterns
 * @see SPECS.md 8.6.8 Document → Between Sheets
 */
export type DocToSheetPattern =
    | 'DBS1_before_wb_to_between' // Doc before WB → between sheets
    | 'DBS2_after_wb_no_move' // Doc after WB, already in position
    | 'DBS3_after_wb_reorder'; // Doc after WB needs reorder

/**
 * Context for pattern classification
 */
export interface PatternContext {
    tabs: TabInfo[];
    fromIndex: number;
    toIndex: number;
    fromTab: TabInfo;
    toTab: TabInfo | undefined;
    newTabs: TabInfo[];
    newTabOrder: TabOrderItem[];
    currentFileStructure: FileStructure;
    sheetCount: number;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * SIDR3 Helper: Compute move-sheet parameters for sheet reorder.
 *
 * This is a pure function that calculates the correct toSheetIndex
 * when visual sheet order differs from physical and requires reordering.
 *
 * @param visualSheetOrder - Array of sheet indices in visual order (from newTabOrder)
 * @param physicalSheetOrder - Array of sheet indices in physical order (from fileStructure.sheets)
 * @param movedSheetIdx - The index of the sheet being moved
 * @returns null if no reorder needed, or {fromSheetIndex, toSheetIndex} for move-sheet
 */
export function computeSidr3MoveSheet(
    visualSheetOrder: number[],
    physicalSheetOrder: number[],
    movedSheetIdx: number
): { fromSheetIndex: number; toSheetIndex: number } | null {
    // Check if sheet order differs
    const sheetOrderDiffers =
        visualSheetOrder.length === physicalSheetOrder.length &&
        !visualSheetOrder.every((v, i) => v === physicalSheetOrder[i]);

    if (!sheetOrderDiffers || visualSheetOrder.length < 2) {
        return null;
    }

    // Find the moved sheet's position in visual order
    const movedSheetVisualPos = visualSheetOrder.indexOf(movedSheetIdx);
    if (movedSheetVisualPos === -1) {
        return null;
    }

    // toSheetIndex = visual position in post-removal array
    // moveSheet removes sheet first, then inserts at toIndex
    // So for visual [S2, S1, S3], S1 at visual pos 1 → toSheetIndex = 1
    return {
        fromSheetIndex: movedSheetIdx,
        toSheetIndex: movedSheetVisualPos
    };
}

export function deriveTabOrderFromFile(structure: FileStructure): TabOrderItem[] {
    const tabOrder: TabOrderItem[] = [];
    for (const docIndex of structure.docsBeforeWb) {
        tabOrder.push({ type: 'document', index: docIndex });
    }
    for (const sheetIndex of structure.sheets) {
        tabOrder.push({ type: 'sheet', index: sheetIndex });
    }
    for (const docIndex of structure.docsAfterWb) {
        tabOrder.push({ type: 'document', index: docIndex });
    }
    return tabOrder;
}

export function isMetadataRequired(displayOrder: TabOrderItem[], fileStructure: FileStructure): boolean {
    const derivedOrder = deriveTabOrderFromFile(fileStructure);
    if (displayOrder.length !== derivedOrder.length) return true;
    for (let i = 0; i < displayOrder.length; i++) {
        if (displayOrder[i].type !== derivedOrder[i].type || displayOrder[i].index !== derivedOrder[i].index) {
            return true;
        }
    }
    return false;
}

export function parseFileStructure(tabs: Array<TabInfo>): FileStructure {
    const sheets: number[] = [];
    const docsBeforeWb: number[] = [];
    const docsAfterWb: number[] = [];

    const firstSheetPos = tabs.findIndex((t) => t.type === 'sheet');
    const lastSheetPos = tabs.reduce((acc, t, i) => (t.type === 'sheet' ? i : acc), -1);
    const hasWorkbook = firstSheetPos !== -1;

    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.type === 'sheet' && tab.sheetIndex !== undefined) {
            sheets.push(tab.sheetIndex);
        } else if (tab.type === 'document' && tab.docIndex !== undefined) {
            if (!hasWorkbook || i < firstSheetPos) {
                docsBeforeWb.push(tab.docIndex);
            } else if (i > lastSheetPos) {
                docsAfterWb.push(tab.docIndex);
            } else {
                docsAfterWb.push(tab.docIndex);
            }
        }
    }

    return { docsBeforeWb, sheets, docsAfterWb, hasWorkbook };
}

// =============================================================================
// Pattern Classifiers (SPECS.md 8.6.8)
// =============================================================================

/**
 * Build PatternContext for classification
 */
function buildPatternContext(
    tabs: TabInfo[],
    fromIndex: number,
    toIndex: number,
    physicalStructure?: FileStructure
): PatternContext {
    const fromTab = tabs[fromIndex];
    const toTab = toIndex < tabs.length ? tabs[toIndex] : undefined;
    const sheetCount = tabs.filter((t) => t.type === 'sheet').length;

    // Simulate new order
    const newTabs = [...tabs];
    const [movedTab] = newTabs.splice(fromIndex, 1);
    const insertionIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    newTabs.splice(insertionIndex, 0, movedTab);

    // Build newTabOrder
    const newTabOrder = newTabs
        .filter((t) => t.type === 'sheet' || t.type === 'document')
        .map((t) => ({
            type: t.type as 'sheet' | 'document',
            index: t.type === 'sheet' ? t.sheetIndex! : t.docIndex!
        }));

    // Use provided physicalStructure if available, otherwise derive from tabs (may be inaccurate)
    const currentFileStructure = physicalStructure ?? parseFileStructure(tabs);

    return {
        tabs,
        fromIndex,
        toIndex,
        fromTab,
        toTab,
        newTabs,
        newTabOrder,
        currentFileStructure,
        sheetCount
    };
}

/**
 * Classify Sheet → Document patterns
 * @see SPECS.md 8.6.8
 */
function classifySheetToDocPattern(ctx: PatternContext): SheetToDocPattern {
    const { newTabOrder, currentFileStructure, sheetCount, fromTab } = ctx;

    // Check if this is "inside doc range" (C8 family)
    // Find where the sheet landed relative to other sheets
    const movedSheetIdx = fromTab.sheetIndex!;
    const sheetPositions = newTabOrder
        .map((item, idx) => (item.type === 'sheet' ? idx : -1))
        .filter((idx) => idx !== -1);

    const movedSheetNewPos = newTabOrder.findIndex((item) => item.type === 'sheet' && item.index === movedSheetIdx);

    // Check for doc-between-sheets scenario (sheet after a doc)
    const firstSheetPos = sheetPositions.length > 0 ? sheetPositions[0] : -1;
    const _lastSheetPos = sheetPositions.length > 0 ? sheetPositions[sheetPositions.length - 1] : -1;

    // Is sheet isolated (after first sheet but surrounded by docs)?
    const isAfterFirstSheet = movedSheetNewPos > firstSheetPos;
    const hasDocBefore = movedSheetNewPos > 0 && newTabOrder[movedSheetNewPos - 1].type === 'document';

    if (isAfterFirstSheet && hasDocBefore && sheetCount > 1) {
        // C8 family: sheet inside doc range
        const isLastPhysicalSheet = movedSheetIdx === sheetCount - 1;
        return isLastPhysicalSheet ? 'SIDR2_inside_already_last' : 'SIDR1_inside_not_last';
    }

    // Check if doc becomes first (H9/H11 family)
    if (newTabOrder.length > 0 && newTabOrder[0].type === 'document') {
        const firstDocIdx = newTabOrder[0].index;
        const isPhysicallyAfterWb = currentFileStructure.docsAfterWb.includes(firstDocIdx);

        if (isPhysicallyAfterWb) {
            // Check sheet contiguity and order
            const sheetIndices = newTabOrder.filter((item) => item.type === 'sheet').map((item) => item.index);

            const physicalSheetOrder = currentFileStructure.sheets.slice().sort((a, b) => a - b);

            // Are sheets contiguous in newTabOrder?
            let sheetsContiguous = true;
            let prevWasSheet = false;
            for (const item of newTabOrder.slice(1)) {
                // skip first (doc)
                if (item.type === 'sheet') {
                    if (!prevWasSheet && newTabOrder.indexOf(item) > 1) {
                        // Check if there's a doc gap
                        const prevItem = newTabOrder[newTabOrder.indexOf(item) - 1];
                        if (prevItem.type === 'document') {
                            // This sheet comes after a doc that comes after a sheet
                            const itemsBeforeThis = newTabOrder.slice(1, newTabOrder.indexOf(item));
                            const hasSheetBeforeDoc = itemsBeforeThis.some((i) => i.type === 'sheet');
                            if (hasSheetBeforeDoc) {
                                sheetsContiguous = false;
                                break;
                            }
                        }
                    }
                    prevWasSheet = true;
                } else {
                    prevWasSheet = false;
                }
            }

            if (sheetsContiguous) {
                // Check if sheet order matches physical
                const visualSheetOrder = sheetIndices;
                const orderMatches =
                    visualSheetOrder.length === physicalSheetOrder.length &&
                    visualSheetOrder.every((v, i) => v === physicalSheetOrder[i]);

                return orderMatches ? 'SAD3_doc_first_order_same' : 'SAD4_doc_first_order_differs';
            }

            // Sheets not contiguous (H10-like)
            return 'SAD5_sheet_past_docs';
        }
    }

    // Single vs Multi-sheet workbook
    if (sheetCount === 1) {
        // Check direction: before or after doc?
        const newWbPos = ctx.newTabs.findIndex((t) => t.type === 'sheet');
        const firstDocPos = ctx.newTabs.findIndex((t) => t.type === 'document');

        if (newWbPos < firstDocPos || firstDocPos === -1) {
            return 'SBD1_single_before_doc';
        }
        return 'SAD1_single_after_doc';
    }

    // Multi-sheet: before or after doc
    const movingSheetPos = ctx.newTabs.findIndex((t) => t.type === 'sheet' && t.sheetIndex === fromTab.sheetIndex);
    const firstDoc = ctx.newTabs.find((t) => t.type === 'document');
    const firstDocPos = firstDoc ? ctx.newTabs.indexOf(firstDoc) : -1;

    if (movingSheetPos < firstDocPos || firstDocPos === -1) {
        return 'SBD2_multi_before_doc';
    }

    return 'SAD2_multi_after_no_reorder';
}

/**
 * Classify Sheet → Sheet patterns (within Workbook)
 * @see SPECS.md 8.6.8
 */
function classifySheetToSheetPattern(ctx: PatternContext): SheetToSheetPattern {
    const { newTabOrder, currentFileStructure, sheetCount } = ctx;
    const hasDocs = newTabOrder.some((item) => item.type === 'document');

    // First check: Does result match natural order? (Metadata removal)
    if (!isMetadataRequired(newTabOrder, currentFileStructure)) {
        return 'SS1_adjacent_no_docs'; // Will handle as "restore natural order"
    }

    // Check for H9/H11: Doc becomes first
    if (newTabOrder.length > 0 && newTabOrder[0].type === 'document') {
        const firstDocIdx = newTabOrder[0].index;
        const isPhysicallyAfterWb = currentFileStructure.docsAfterWb.includes(firstDocIdx);

        if (isPhysicallyAfterWb) {
            // Check sheet contiguity
            let sheetsContiguous = true;
            let lastWasSheet = false;
            let sawDocAfterSheet = false;

            for (let i = 1; i < newTabOrder.length; i++) {
                const item = newTabOrder[i];
                if (item.type === 'sheet') {
                    if (sawDocAfterSheet && !lastWasSheet) {
                        sheetsContiguous = false;
                        break;
                    }
                    lastWasSheet = true;
                } else {
                    if (lastWasSheet) sawDocAfterSheet = true;
                    lastWasSheet = false;
                }
            }

            if (sheetsContiguous) {
                // Check sheet order
                const visualSheetOrder = newTabOrder.filter((item) => item.type === 'sheet').map((item) => item.index);
                const physicalSheetOrder = currentFileStructure.sheets;
                const orderMatches =
                    visualSheetOrder.length === physicalSheetOrder.length &&
                    visualSheetOrder.every((v, i) => v === physicalSheetOrder[i]);

                // Use SS2 for H9 and SS3 for H11 (repurposing for move-workbook cases)
                return orderMatches ? 'SS2_adjacent_with_docs' : 'SS3_non_adjacent';
            }
        }
    }

    // Pure sheet swap (no docs or simple structure)
    if (!hasDocs) {
        return 'SS1_adjacent_no_docs';
    }

    // Adjacent swap with docs present
    if (sheetCount <= 2) {
        return 'SS2_adjacent_with_docs';
    }

    return 'SS3_non_adjacent';
}

/**
 * Classify Doc → Doc patterns
 * @see SPECS.md 8.6.8
 */
function classifyDocToDocPattern(ctx: PatternContext): DocToDocPattern {
    const { fromTab, currentFileStructure, newTabOrder } = ctx;
    const fromDocIdx = fromTab.docIndex!;
    const isFromBefore = currentFileStructure.docsBeforeWb.includes(fromDocIdx);
    const isFromAfter = currentFileStructure.docsAfterWb.includes(fromDocIdx);

    // Find where doc ends up
    const newDocPos = newTabOrder.findIndex((item) => item.type === 'document' && item.index === fromDocIdx);
    const sheetsInNew = newTabOrder.filter((item) => item.type === 'sheet');
    const firstSheetPosInNew = sheetsInNew.length > 0 ? newTabOrder.findIndex((item) => item.type === 'sheet') : -1;
    const lastSheetPosInNew =
        sheetsInNew.length > 0 ? newTabOrder.reduce((acc, item, i) => (item.type === 'sheet' ? i : acc), -1) : -1;

    const isToBeforeSheets = firstSheetPosInNew === -1 || newDocPos < firstSheetPosInNew;
    const isToAfterSheets = lastSheetPosInNew === -1 || newDocPos > lastSheetPosInNew;
    const isToBetweenSheets = !isToBeforeSheets && !isToAfterSheets;

    // Check for interleaved (visual order differs from physical)
    if (isToBetweenSheets) {
        return 'DD5_interleaved_reorder';
    }

    // Same side moves
    if (isFromBefore && isToBeforeSheets) {
        return 'DD1_both_before_wb';
    }
    if (isFromAfter && isToAfterSheets) {
        return 'DD2_both_after_wb';
    }

    // Cross-WB moves
    if (isFromBefore && isToAfterSheets) {
        return 'DD3_cross_before_to_after';
    }
    if (isFromAfter && isToBeforeSheets) {
        return 'DD4_cross_after_to_before';
    }

    return 'DD2_both_after_wb'; // Default
}

/**
 * Classify Doc → Sheet (between sheets) patterns
 * @see SPECS.md 8.6.8
 */
function classifyDocToSheetPattern(ctx: PatternContext): DocToSheetPattern {
    const { fromTab, currentFileStructure, newTabOrder } = ctx;
    const fromDocIdx = fromTab.docIndex!;
    const isFromBefore = currentFileStructure.docsBeforeWb.includes(fromDocIdx);

    if (isFromBefore) {
        return 'DBS1_before_wb_to_between';
    }

    // Check if physical move is needed
    const needsMeta = isMetadataRequired(newTabOrder, currentFileStructure);

    if (!needsMeta) {
        return 'DBS3_after_wb_reorder';
    }

    return 'DBS2_after_wb_no_move';
}

// =============================================================================
// Finite Pattern Handlers
// =============================================================================

/**
 * Handle Sheet → Sheet (Within Workbook)
 * Uses Finite Pattern dispatch (SPECS.md 8.6.8)
 */
function handleSheetToSheet(
    fromIndex: number,
    toIndex: number,
    tabs: TabInfo[],
    physicalStructure?: FileStructure
): ReorderAction {
    const ctx = buildPatternContext(tabs, fromIndex, toIndex, physicalStructure);
    const pattern = classifySheetToSheetPattern(ctx);

    // Compute toSheetIndex for physical moves
    const toTab = tabs[toIndex];
    let toSheetIndex: number;
    if (toTab && toTab.type === 'sheet') {
        toSheetIndex = toTab.sheetIndex!;
    } else {
        toSheetIndex = ctx.sheetCount;
    }

    // Adjust for left-to-right moves
    if (fromIndex < toIndex && toSheetIndex < ctx.sheetCount) {
        toSheetIndex--;
    }

    switch (pattern) {
        // =====================================================================
        // SS1: Natural Order / Metadata Removal
        // =====================================================================
        case 'SS1_adjacent_no_docs': {
            // Result matches physical order - remove metadata
            if (!isMetadataRequired(ctx.newTabOrder, ctx.currentFileStructure)) {
                return {
                    actionType: 'metadata',
                    newTabOrder: undefined,
                    metadataRequired: false
                };
            }

            // Check if any doc needs to move to before-WB
            const ss1SecondaryMoves: PhysicalMove[] = [];
            if (ctx.newTabOrder[0]?.type === 'document') {
                for (const item of ctx.newTabOrder) {
                    if (item.type !== 'document') continue;
                    const docIdx = item.index;
                    const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                    const docVisualPos = ctx.newTabOrder.findIndex((t) => t.type === 'document' && t.index === docIdx);
                    const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                    if (firstSheetPos >= 0 && docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                        ss1SecondaryMoves.push({
                            type: 'move-document',
                            fromDocIndex: docIdx,
                            toDocIndex: null,
                            toAfterWorkbook: false,
                            toBeforeWorkbook: true
                        });
                    }
                }
            }

            // Physical sheet swap
            return {
                actionType: ss1SecondaryMoves.length > 0 ? 'physical+metadata' : 'physical',
                physicalMove: {
                    type: 'move-sheet',
                    fromSheetIndex: ctx.fromTab.sheetIndex!,
                    toSheetIndex
                },
                secondaryPhysicalMoves: ss1SecondaryMoves.length > 0 ? ss1SecondaryMoves : undefined,
                metadataRequired: ss1SecondaryMoves.length > 0,
                newTabOrder: ss1SecondaryMoves.length > 0 ? ctx.newTabOrder : undefined
            };
        }

        // =====================================================================
        // SS2: Adjacent swap with docs (H9 / Physical Normalization)
        // =====================================================================
        case 'SS2_adjacent_with_docs': {
            // Check if doc becomes first (H9)
            if (ctx.newTabOrder.length > 0 && ctx.newTabOrder[0].type === 'document') {
                const firstDocIdx = ctx.newTabOrder[0].index;
                const isAfterWb = ctx.currentFileStructure.docsAfterWb.includes(firstDocIdx);

                if (isAfterWb) {
                    // SIDR3 (H12): Check if visual sheet order differs from physical
                    // Visual: [D1, S2, S1, D2] → sheet order is [S2, S1]
                    // Physical: [S1, S2] → needs reorder
                    const visualSheetOrder = ctx.newTabOrder
                        .filter((item) => item.type === 'sheet')
                        .map((item) => item.index);
                    const physicalSheetOrder = ctx.currentFileStructure.sheets;
                    const sheetOrderDiffers =
                        visualSheetOrder.length === physicalSheetOrder.length &&
                        !visualSheetOrder.every((v, i) => v === physicalSheetOrder[i]);

                    console.log(
                        '[DEBUG SS2] visualSheet:',
                        visualSheetOrder,
                        'physicalSheet:',
                        physicalSheetOrder,
                        'differs:',
                        sheetOrderDiffers,
                        'newTabOrder:',
                        ctx.newTabOrder
                    );

                    if (sheetOrderDiffers && ctx.sheetCount >= 2) {
                        // SIDR3: Need to physically reorder sheets
                        // The moved sheet should become last in physical order
                        const movedSheetIdx = ctx.fromTab.sheetIndex!;

                        // Check if any doc needs to move to before-WB
                        const secondaryMoves: PhysicalMove[] = [];
                        for (const item of ctx.newTabOrder) {
                            if (item.type !== 'document') continue;
                            const docIdx = item.index;
                            const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                            // Find where this doc appears in newTabOrder relative to sheets
                            const docVisualPos = ctx.newTabOrder.findIndex(
                                (t) => t.type === 'document' && t.index === docIdx
                            );
                            const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                            // If doc is before all sheets in visual order, but physically after WB
                            if (docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                                secondaryMoves.push({
                                    type: 'move-document',
                                    fromDocIndex: docIdx,
                                    toDocIndex: null,
                                    toAfterWorkbook: false,
                                    toBeforeWorkbook: true
                                });
                            }
                        }

                        return {
                            actionType: 'physical+metadata',
                            physicalMove: {
                                type: 'move-sheet',
                                fromSheetIndex: movedSheetIdx,
                                toSheetIndex: ctx.sheetCount // Move to end
                            },
                            secondaryPhysicalMoves: secondaryMoves.length > 0 ? secondaryMoves : undefined,
                            newTabOrder: ctx.newTabOrder,
                            metadataRequired: true
                        };
                    }

                    // H9: Move workbook after doc, no metadata
                    return {
                        actionType: 'physical',
                        physicalMove: {
                            type: 'move-workbook',
                            direction: 'after-doc',
                            targetDocIndex: firstDocIdx
                        },
                        metadataRequired: false
                    };
                }
            }

            // Normal sheet swap with metadata if needed
            const needsMeta = isMetadataRequired(ctx.newTabOrder, ctx.currentFileStructure);

            // Check if any doc needs to move to before-WB
            const ss2SecondaryMoves: PhysicalMove[] = [];
            if (ctx.newTabOrder[0]?.type === 'document') {
                for (const item of ctx.newTabOrder) {
                    if (item.type !== 'document') continue;
                    const docIdx = item.index;
                    const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                    const docVisualPos = ctx.newTabOrder.findIndex((t) => t.type === 'document' && t.index === docIdx);
                    const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                    if (firstSheetPos >= 0 && docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                        ss2SecondaryMoves.push({
                            type: 'move-document',
                            fromDocIndex: docIdx,
                            toDocIndex: null,
                            toAfterWorkbook: false,
                            toBeforeWorkbook: true
                        });
                    }
                }
            }

            return {
                actionType: 'physical',
                physicalMove: {
                    type: 'move-sheet',
                    fromSheetIndex: ctx.fromTab.sheetIndex!,
                    toSheetIndex
                },
                secondaryPhysicalMoves: ss2SecondaryMoves.length > 0 ? ss2SecondaryMoves : undefined,
                metadataRequired: needsMeta,
                newTabOrder: needsMeta ? ctx.newTabOrder : undefined
            };
        }

        // =====================================================================
        // SS3: Non-adjacent / H11 (Sheet order differs)
        // =====================================================================
        case 'SS3_non_adjacent':
        default: {
            // Check if doc becomes first with different sheet order (H11/H12)
            if (ctx.newTabOrder.length > 0 && ctx.newTabOrder[0].type === 'document') {
                const firstDocIdx = ctx.newTabOrder[0].index;
                const isAfterWb = ctx.currentFileStructure.docsAfterWb.includes(firstDocIdx);

                if (isAfterWb) {
                    // SIDR3 (H12): Check if visual sheet order differs from physical
                    const visualSheetOrder = ctx.newTabOrder
                        .filter((item) => item.type === 'sheet')
                        .map((item) => item.index);
                    const physicalSheetOrder = ctx.currentFileStructure.sheets;
                    const movedSheetIdx = ctx.fromTab.sheetIndex!;

                    const sidr3Move = computeSidr3MoveSheet(visualSheetOrder, physicalSheetOrder, movedSheetIdx);
                    if (sidr3Move) {
                        // Check if any doc needs to move to before-WB
                        const secondaryMoves: PhysicalMove[] = [];
                        for (const item of ctx.newTabOrder) {
                            if (item.type !== 'document') continue;
                            const docIdx = item.index;
                            const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                            // Find where this doc appears in newTabOrder relative to sheets
                            const docVisualPos = ctx.newTabOrder.findIndex(
                                (t) => t.type === 'document' && t.index === docIdx
                            );
                            const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                            // If doc is before all sheets in visual order, but physically after WB
                            if (docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                                secondaryMoves.push({
                                    type: 'move-document',
                                    fromDocIndex: docIdx,
                                    toDocIndex: null,
                                    toAfterWorkbook: false,
                                    toBeforeWorkbook: true
                                });
                            }
                        }

                        return {
                            actionType: 'physical+metadata',
                            physicalMove: {
                                type: 'move-sheet',
                                fromSheetIndex: sidr3Move.fromSheetIndex,
                                toSheetIndex: sidr3Move.toSheetIndex
                            },
                            secondaryPhysicalMoves: secondaryMoves.length > 0 ? secondaryMoves : undefined,
                            newTabOrder: ctx.newTabOrder,
                            metadataRequired: true
                        };
                    }

                    // H11: Move workbook, but sheet order differs - need metadata

                    return {
                        actionType: 'physical+metadata',
                        physicalMove: {
                            type: 'move-workbook',
                            direction: 'after-doc',
                            targetDocIndex: firstDocIdx
                        },
                        newTabOrder: ctx.newTabOrder,
                        metadataRequired: true
                    };
                }
            }

            // Normal sheet move with metadata
            const needsMeta = isMetadataRequired(ctx.newTabOrder, ctx.currentFileStructure);

            // Check if any doc needs to move to before-WB
            const secondaryMoves: PhysicalMove[] = [];
            if (ctx.newTabOrder[0]?.type === 'document') {
                for (const item of ctx.newTabOrder) {
                    if (item.type !== 'document') continue;
                    const docIdx = item.index;
                    const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                    // Find where this doc appears relative to sheets
                    const docVisualPos = ctx.newTabOrder.findIndex((t) => t.type === 'document' && t.index === docIdx);
                    const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                    // If doc is before all sheets in visual order, but physically after WB
                    if (firstSheetPos >= 0 && docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                        secondaryMoves.push({
                            type: 'move-document',
                            fromDocIndex: docIdx,
                            toDocIndex: null,
                            toAfterWorkbook: false,
                            toBeforeWorkbook: true
                        });
                    }
                }
            }

            return {
                actionType: needsMeta ? 'physical+metadata' : 'physical',
                physicalMove: {
                    type: 'move-sheet',
                    fromSheetIndex: ctx.fromTab.sheetIndex!,
                    toSheetIndex
                },
                secondaryPhysicalMoves: secondaryMoves.length > 0 ? secondaryMoves : undefined,
                metadataRequired: needsMeta,
                newTabOrder: needsMeta ? ctx.newTabOrder : undefined
            };
        }
    }
}

/**
 * Handle Sheet → Document Position (Moves Workbook or Metadata)
 * Uses Finite Pattern dispatch (SPECS.md 8.6.8)
 */
function handleSheetToDoc(
    fromIndex: number,
    toIndex: number,
    tabs: TabInfo[],
    physicalStructure?: FileStructure
): ReorderAction {
    const ctx = buildPatternContext(tabs, fromIndex, toIndex, physicalStructure);
    const pattern = classifySheetToDocPattern(ctx);

    switch (pattern) {
        // =====================================================================
        // Single Sheet Workbook Patterns (S3, S4)
        // =====================================================================
        case 'SBD1_single_before_doc': {
            // S3: Single sheet to before doc - move WB before first doc
            const firstDoc = ctx.newTabs.find((t) => t.type === 'document');
            return {
                actionType: 'physical',
                physicalMove: {
                    type: 'move-workbook',
                    direction: 'before-doc',
                    targetDocIndex: firstDoc?.docIndex ?? 0
                },
                metadataRequired: false
            };
        }

        case 'SAD1_single_after_doc': {
            // S4: Single sheet to after doc - move WB after target doc
            const newWbPos = ctx.newTabs.findIndex((t) => t.type === 'sheet');
            const prevDoc = ctx.newTabs[newWbPos - 1];
            return {
                actionType: 'physical',
                physicalMove: {
                    type: 'move-workbook',
                    direction: 'after-doc',
                    targetDocIndex: prevDoc?.docIndex ?? 0
                },
                metadataRequired: false
            };
        }

        // =====================================================================
        // Doc Becomes First Patterns (H9, H11)
        // =====================================================================
        case 'SAD3_doc_first_order_same': {
            // H9: Doc first, sheets contiguous, order SAME
            //     → move-workbook, NO metadata (physical matches visual)
            const firstDocIdx = ctx.newTabOrder[0].index;
            return {
                actionType: 'physical',
                physicalMove: {
                    type: 'move-workbook',
                    direction: 'after-doc',
                    targetDocIndex: firstDocIdx
                },
                metadataRequired: false
            };
        }

        case 'SAD4_doc_first_order_differs': {
            // H11: Doc first, sheets contiguous, order DIFFERS
            //      → move-workbook + METADATA (to express sheet order)
            const firstDocIdx = ctx.newTabOrder[0].index;
            return {
                actionType: 'physical+metadata',
                physicalMove: {
                    type: 'move-workbook',
                    direction: 'after-doc',
                    targetDocIndex: firstDocIdx
                },
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true // KEY FIX: Sheet order differs from physical!
            };
        }

        case 'SAD5_sheet_past_docs': {
            // H10: Sheet to end past multiple docs, sheets NOT contiguous
            //      → move-sheet to end of WB + metadata
            return {
                actionType: 'physical+metadata',
                physicalMove: {
                    type: 'move-sheet',
                    fromSheetIndex: ctx.fromTab.sheetIndex!,
                    toSheetIndex: ctx.sheetCount
                },
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }

        // =====================================================================
        // Inside Doc Range Patterns (C8)
        // =====================================================================
        case 'SIDR1_inside_not_last': {
            // C8: Non-last sheet to inside doc range
            //     → move-sheet to end of WB + metadata
            //     PLUS: secondary doc moves if docs need to change WB position
            const secondaryMoves: PhysicalMove[] = [];

            // Check if any doc needs to move to before-WB
            // This happens when a doc becomes first in visual order but is currently after-WB
            for (const item of ctx.newTabOrder) {
                if (item.type !== 'document') continue;
                const docIdx = item.index;
                const isCurrentlyAfterWb = ctx.currentFileStructure.docsAfterWb.includes(docIdx);

                // Find where this doc appears in newTabOrder
                const docVisualPos = ctx.newTabOrder.findIndex((t) => t.type === 'document' && t.index === docIdx);
                const firstSheetPos = ctx.newTabOrder.findIndex((t) => t.type === 'sheet');

                // If doc is before all sheets in visual order, but physically after WB
                if (docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                    secondaryMoves.push({
                        type: 'move-document',
                        fromDocIndex: docIdx,
                        toDocIndex: null,
                        toAfterWorkbook: false,
                        toBeforeWorkbook: true
                    });
                }
            }

            return {
                actionType: 'physical+metadata',
                physicalMove: {
                    type: 'move-sheet',
                    fromSheetIndex: ctx.fromTab.sheetIndex!,
                    toSheetIndex: ctx.sheetCount
                },
                secondaryPhysicalMoves: secondaryMoves.length > 0 ? secondaryMoves : undefined,
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }

        case 'SIDR2_inside_already_last': {
            // C8v: Last sheet to inside doc range (already at end)
            //      → metadata only (no physical move needed)
            return {
                actionType: 'metadata',
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }

        // =====================================================================
        // Multi-Sheet Before/After Doc Patterns (S5, S6)
        // =====================================================================
        case 'SBD2_multi_before_doc': {
            // S5: Multi-sheet, one sheet before doc
            //     → move-workbook + metadata
            const firstDoc = ctx.newTabs.find((t) => t.type === 'document');
            return {
                actionType: 'physical+metadata',
                physicalMove: {
                    type: 'move-workbook',
                    direction: 'before-doc',
                    targetDocIndex: firstDoc?.docIndex ?? 0
                },
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }

        case 'SAD2_multi_after_no_reorder':
        default: {
            // S6: Multi-sheet after doc (default stability pattern)
            //     → metadata only
            return {
                actionType: 'metadata',
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }
    }
}

/**
 * Handle Doc → Doc (Physical Move)
 * Uses Finite Pattern dispatch (SPECS.md 8.6.8)
 */
function handleDocToDoc(
    fromIndex: number,
    toIndex: number,
    tabs: TabInfo[],
    physicalStructure?: FileStructure
): ReorderAction {
    const ctx = buildPatternContext(tabs, fromIndex, toIndex, physicalStructure);
    const pattern = classifyDocToDocPattern(ctx);

    const fromDocIndex = ctx.fromTab.docIndex!;
    const toTab = toIndex < tabs.length ? tabs[toIndex] : null;

    // Compute target parameters
    let toDocIndex: number | null = null;
    let toBeforeWorkbook = false;
    const _toAfterWorkbook = false;

    if (toTab?.type === 'document') {
        toDocIndex = toTab.docIndex!;
    } else if (toTab === null || toTab === undefined || toTab.type === 'add-sheet') {
        // Appending to end of doc list - let moveDocumentSection handle it via EOF insertion
        toDocIndex = null;
    } else {
        // toTab is sheet - find target doc position before this sheet
        // moveDocumentSection inserts BEFORE toDocIndex, so we need the index of the doc
        // that should come AFTER the moved doc
        for (let i = toIndex - 1; i >= 0; i--) {
            if (tabs[i].type === 'document' && i !== fromIndex) {
                // Insert before the NEXT doc after this one (i.e., at position of this doc + 1)
                // But since we're inserting and moveDocumentSection adjusts for removal,
                // we use the raw doc index (not +1)
                toDocIndex = tabs[i].docIndex! + 1;
                break;
            }
        }
    }

    // NOTE: Use parseFileStructure(ctx.newTabs) to determine if the NEW arrangement
    // requires metadata. This differs from ctx.currentFileStructure which represents
    // the original physical structure.
    const needsMetadata = isMetadataRequired(ctx.newTabOrder, parseFileStructure(ctx.newTabs));

    switch (pattern) {
        // =====================================================================
        // DD1/DD2: Same side of WB
        // =====================================================================
        case 'DD1_both_before_wb':
        case 'DD2_both_after_wb': {
            return {
                actionType: needsMetadata ? 'physical+metadata' : 'physical',
                physicalMove: {
                    type: 'move-document',
                    fromDocIndex,
                    toDocIndex,
                    toAfterWorkbook: false,
                    toBeforeWorkbook: false
                },
                newTabOrder: needsMetadata ? ctx.newTabOrder : undefined,
                metadataRequired: needsMetadata
            };
        }

        // =====================================================================
        // DD3/DD4: Cross WB
        // =====================================================================
        case 'DD3_cross_before_to_after': {
            // Cross WB: Doc before WB moves to after WB
            // Two sub-cases:
            // - D4: Doc moves to FIRST position after WB (before any docsAfterWb)
            //       → toAfterWorkbook=true to insert at wbEnd
            // - D3: Doc moves AFTER another doc that is after WB
            //       → toAfterWorkbook=false with toDocIndex to insert at specific position

            // Check if moving to first position after WB
            // This happens when toTab is the first doc after WB in visual order
            const firstDocAfterWbIndex =
                ctx.currentFileStructure.docsAfterWb.length > 0
                    ? Math.min(...ctx.currentFileStructure.docsAfterWb)
                    : null;

            const isMovingToFirstAfterWb = toTab?.type === 'document' && toTab.docIndex === firstDocAfterWbIndex;

            if (isMovingToFirstAfterWb) {
                // D4 case: Move to first position after WB
                return {
                    actionType: needsMetadata ? 'physical+metadata' : 'physical',
                    physicalMove: {
                        type: 'move-document',
                        fromDocIndex,
                        toDocIndex: null,
                        toAfterWorkbook: true, // Insert at wbEnd (first position after WB)
                        toBeforeWorkbook: false
                    },
                    newTabOrder: needsMetadata ? ctx.newTabOrder : undefined,
                    metadataRequired: needsMetadata
                };
            }

            // D3 case: Move after another doc that is after WB
            return {
                actionType: needsMetadata ? 'physical+metadata' : 'physical',
                physicalMove: {
                    type: 'move-document',
                    fromDocIndex,
                    toDocIndex,
                    toAfterWorkbook: false, // Use toDocIndex for specific position
                    toBeforeWorkbook: false
                },
                newTabOrder: needsMetadata ? ctx.newTabOrder : undefined,
                metadataRequired: needsMetadata
            };
        }

        case 'DD4_cross_after_to_before': {
            toBeforeWorkbook = true;

            // After physical move to before WB, doc indices change:
            // - The moved doc becomes index 0 (first doc in file)
            // - All other docs shift up by 1
            const movedDocOldIndex = fromDocIndex;
            const adjustedTabOrder = needsMetadata
                ? ctx.newTabOrder.map((item) => {
                      if (item.type !== 'document') return item;

                      if (item.index === movedDocOldIndex) {
                          // Moved doc becomes index 0
                          return { ...item, index: 0 };
                      } else {
                          // All other docs shift up by 1
                          return { ...item, index: item.index + 1 };
                      }
                  })
                : undefined;

            return {
                actionType: needsMetadata ? 'physical+metadata' : 'physical',
                physicalMove: {
                    type: 'move-document',
                    fromDocIndex,
                    toDocIndex,
                    toAfterWorkbook: false,
                    toBeforeWorkbook
                },
                newTabOrder: adjustedTabOrder,
                metadataRequired: needsMetadata
            };
        }

        // =====================================================================
        // DD5: Interleaved (between sheets)
        // =====================================================================
        case 'DD5_interleaved_reorder':
        default: {
            // Doc moves to between sheets - delegate to handleDocToSheet logic
            const isFromBeforeWb = ctx.currentFileStructure.docsBeforeWb.includes(fromDocIndex);

            if (isFromBeforeWb) {
                return {
                    actionType: 'physical+metadata',
                    physicalMove: {
                        type: 'move-document',
                        fromDocIndex,
                        toDocIndex: null,
                        toAfterWorkbook: true,
                        toBeforeWorkbook: false
                    },
                    newTabOrder: ctx.newTabOrder,
                    metadataRequired: true
                };
            }

            // DBS4 (H13): Check if visual doc order differs from physical
            // When doc moves to between sheets and visual order differs, need physical reorder
            const docsInVisualOrder = ctx.newTabOrder
                .filter((item) => item.type === 'document')
                .map((item) => item.index);
            const physicalDocOrder = ctx.currentFileStructure.docsAfterWb;

            if (docsInVisualOrder.length > 0 && physicalDocOrder.length > 0) {
                const firstVisualDoc = docsInVisualOrder[0];
                const firstPhysicalDoc = physicalDocOrder[0];

                // H13/DBS4: If first visual doc differs from first physical doc, physical reorder needed
                if (firstVisualDoc !== firstPhysicalDoc) {
                    // After physical move, doc indices change:
                    // - The moved doc (firstVisualDoc with OLD index) becomes index 0
                    // - Other docs shift accordingly
                    // We need to remap newTabOrder to use post-physical indices
                    const movedDocOldIndex = firstVisualDoc;
                    const adjustedTabOrder = ctx.newTabOrder.map((item) => {
                        if (item.type !== 'document') return item;

                        // Create new index mapping after physical move
                        // The moved doc goes to position 0, others shift down
                        if (item.index === movedDocOldIndex) {
                            // Moved doc becomes index 0
                            return { ...item, index: 0 };
                        } else if (item.index < movedDocOldIndex) {
                            // Docs before moved doc shift up by 1
                            return { ...item, index: item.index + 1 };
                        }
                        return item;
                    });

                    return {
                        actionType: 'physical+metadata',
                        physicalMove: {
                            type: 'move-document',
                            fromDocIndex,
                            toDocIndex: null,
                            toAfterWorkbook: true, // Move to first position after WB
                            toBeforeWorkbook: false
                        },
                        newTabOrder: adjustedTabOrder,
                        metadataRequired: true
                    };
                }
            }

            return {
                actionType: 'metadata',
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }
    }
}

/**
 * Handle Doc → Inside Workbook (Metadata Representation)
 * Uses Finite Pattern dispatch (SPECS.md 8.6.8)
 */
function handleDocToSheet(
    fromIndex: number,
    toIndex: number,
    tabs: TabInfo[],
    physicalStructure?: FileStructure
): ReorderAction {
    const ctx = buildPatternContext(tabs, fromIndex, toIndex, physicalStructure);
    const pattern = classifyDocToSheetPattern(ctx);

    const fromDocIndex = ctx.fromTab.docIndex!;
    const _needsMetadata = isMetadataRequired(ctx.newTabOrder, ctx.currentFileStructure);

    switch (pattern) {
        // =====================================================================
        // DBS1: Doc before WB moving to between sheets
        // Doc must move from before WB to after WB, so toAfterWorkbook=true
        // Always requires metadata since doc ends up between sheets
        // =====================================================================
        case 'DBS1_before_wb_to_between': {
            return {
                actionType: 'physical+metadata',
                physicalMove: {
                    type: 'move-document',
                    fromDocIndex,
                    toDocIndex: null,
                    toAfterWorkbook: true, // KEY FIX: Doc moves to after WB
                    toBeforeWorkbook: false
                },
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true // Always true for between-sheets position
            };
        }

        // =====================================================================
        // DBS3: Physical reorder of docs after WB
        // =====================================================================
        case 'DBS3_after_wb_reorder': {
            // Calculate target doc index
            let targetDocIdx = 0;
            for (let i = 0; i < toIndex; i++) {
                if (i === fromIndex) continue;
                if (tabs[i].type === 'document') targetDocIdx++;
            }
            if (targetDocIdx >= fromDocIndex) {
                targetDocIdx++;
            }

            return {
                actionType: 'physical',
                physicalMove: {
                    type: 'move-document',
                    fromDocIndex,
                    toDocIndex: targetDocIdx,
                    toAfterWorkbook: false,
                    toBeforeWorkbook: false
                },
                metadataRequired: false
            };
        }

        // =====================================================================
        // DBS2: Doc after WB moving to between sheets
        // If doc is not already first doc after WB, it needs physical reorder
        // =====================================================================
        case 'DBS2_after_wb_no_move':
        default: {
            // Original DBS2 logic: Check if this doc is NOT the first doc after WB
            const firstDocAfterWb = Math.min(...ctx.currentFileStructure.docsAfterWb);
            const needsPhysicalReorder = fromDocIndex > firstDocAfterWb;

            if (needsPhysicalReorder) {
                // Doc needs to move to first position after WB
                return {
                    actionType: 'physical+metadata',
                    physicalMove: {
                        type: 'move-document',
                        fromDocIndex,
                        toDocIndex: null,
                        toAfterWorkbook: true, // Move to first position after WB
                        toBeforeWorkbook: false
                    },
                    newTabOrder: ctx.newTabOrder,
                    metadataRequired: true
                };
            }

            // Already first doc after WB - metadata only
            return {
                actionType: 'metadata',
                newTabOrder: ctx.newTabOrder,
                metadataRequired: true
            };
        }
    }
}

// =============================================================================
// Main Dispatcher
// =============================================================================

/**
 * Determine the reorder action for a tab move.
 *
 * @param tabs - Current tab array (visual order based on tab_order metadata)
 * @param fromIndex - Index of tab being moved
 * @param toIndex - Target index to move to
 * @param physicalStructure - (Optional) File structure from editor.getState().structure.
 *                            When provided, uses this for accurate natural order comparison.
 *                            When omitted, derives structure from tabs (may be inaccurate for metadata scenarios).
 */
export function determineReorderAction(
    tabs: Array<TabInfo>,
    fromIndex: number,
    toIndex: number,
    physicalStructure?: FileStructure
): ReorderAction {
    if (fromIndex === toIndex || toIndex === fromIndex + 1) {
        // Index+1 check: Dropping "after" self is same position
        // This fixes the "Drop on Self" tests
        return { actionType: 'no-op', metadataRequired: false };
    }

    const fromTab = tabs[fromIndex];

    // Identify Zones
    const firstSheetIdx = tabs.findIndex((t) => t.type === 'sheet');
    const _lastSheetIdx = tabs.reduce((acc, t, i) => (t.type === 'sheet' ? i : acc), -1);
    const hasWorkbook = firstSheetIdx !== -1;

    // =========================================================================
    // H9 Early Check: Sheet move causing Doc (after WB) to become visually first
    // This requires move-workbook to normalize the physical structure
    // NOTE: Only applies when WB has MULTIPLE sheets. Single-sheet cases use S3/S4 pattern.
    // =========================================================================
    const sheetCount = tabs.filter((t) => t.type === 'sheet').length;
    if (hasWorkbook && fromTab.type === 'sheet' && sheetCount > 1) {
        // Simulate the new tab order after this move
        const newTabs = [...tabs];
        const [movedTab] = newTabs.splice(fromIndex, 1);
        const adjustedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        newTabs.splice(adjustedToIndex, 0, movedTab);

        // Check if first tab after move is a Doc that is physically after WB
        const newFirstTab = newTabs[0];
        if (newFirstTab?.type === 'document') {
            // Use physicalStructure when provided, otherwise derive from tabs (may be inaccurate)
            const fileStructure = physicalStructure ?? parseFileStructure(tabs);
            const docIndex = newFirstTab.docIndex!;
            const isDocAfterWb = fileStructure.docsAfterWb.includes(docIndex);

            if (isDocAfterWb) {
                // H9 pattern: need move-workbook to put WB after this doc
                // Build newTabOrder from the simulated new tab arrangement
                const newTabOrder = newTabs
                    .filter((t) => t.type === 'sheet' || t.type === 'document')
                    .map((t) => ({
                        type: t.type as 'sheet' | 'document',
                        index: t.type === 'sheet' ? t.sheetIndex! : t.docIndex!
                    }));

                // Compute POST-MOVE file structure for accurate isMetadataRequired check
                // After move-workbook(after-doc, docIndex), docIndex becomes before-WB
                const postMoveStructure: FileStructure = {
                    docsBeforeWb: [docIndex], // targetDoc moves before WB
                    sheets: fileStructure.sheets,
                    docsAfterWb: fileStructure.docsAfterWb.filter((d) => d !== docIndex),
                    hasWorkbook: true
                };
                const needsMetadata = isMetadataRequired(newTabOrder, postMoveStructure);

                // CRITICAL: Only trigger H9 move-workbook if result DIFFERS from natural order
                // If result matches natural order, skip H9 and let normal routing handle it
                // (This allows metadata REMOVAL when restoring natural order)
                if (needsMetadata) {
                    // SIDR3 (H12): Check if visual sheet order differs from physical
                    const visualSheetOrder = newTabOrder
                        .filter((item) => item.type === 'sheet')
                        .map((item) => item.index);
                    const physicalSheetOrder = fileStructure.sheets;
                    const movedSheetIdx = fromTab.sheetIndex!;

                    const sidr3Move = computeSidr3MoveSheet(visualSheetOrder, physicalSheetOrder, movedSheetIdx);
                    if (sidr3Move) {
                        // Check if any doc needs to move to before-WB
                        const secondaryMoves: PhysicalMove[] = [];
                        for (const item of newTabOrder) {
                            if (item.type !== 'document') continue;
                            const dIdx = item.index;
                            const isCurrentlyAfterWb = fileStructure.docsAfterWb.includes(dIdx);

                            const docVisualPos = newTabOrder.findIndex(
                                (t) => t.type === 'document' && t.index === dIdx
                            );
                            const firstSheetPos = newTabOrder.findIndex((t) => t.type === 'sheet');

                            if (firstSheetPos >= 0 && docVisualPos < firstSheetPos && isCurrentlyAfterWb) {
                                secondaryMoves.push({
                                    type: 'move-document',
                                    fromDocIndex: dIdx,
                                    toDocIndex: null,
                                    toAfterWorkbook: false,
                                    toBeforeWorkbook: true
                                });
                            }
                        }

                        return {
                            actionType: 'physical+metadata',
                            physicalMove: {
                                type: 'move-sheet',
                                fromSheetIndex: sidr3Move.fromSheetIndex,
                                toSheetIndex: sidr3Move.toSheetIndex
                            },
                            secondaryPhysicalMoves: secondaryMoves.length > 0 ? secondaryMoves : undefined,
                            newTabOrder: newTabOrder,
                            metadataRequired: true
                        };
                    }

                    return {
                        actionType: 'physical+metadata',
                        physicalMove: {
                            type: 'move-workbook',
                            direction: 'after-doc',
                            targetDocIndex: docIndex
                        },
                        newTabOrder: newTabOrder,
                        metadataRequired: true
                    };
                }
                // else: falls through to normal routing for natural order restoration
            }
        }
    }

    // Is Target Inside Workbook?
    // Inside = [FirstSheet ... LastSheet+1] (Inclusive of append to sheets)
    // BUT exception: If dropping onto a Doc that is "between sheets" (visually), it's Inside.
    // If dropping onto a Doc that is "outside", it's Outside.

    // Simpler View:
    // If toTab is SHEET -> Inside.
    // If toTab is ADD-SHEET -> Inside matches last sheet.
    // If toTab is DOC -> Outside.
    // What if toIndex is boundary?

    const toTab = toIndex < tabs.length ? tabs[toIndex] : undefined;

    let targetZone: 'inside-wb' | 'outside-wb';

    if (toTab?.type === 'sheet') {
        // Special Case: Moving a Document to before the FIRST sheet means moving it Before Workbook.
        // This is an 'outside-wb' action (Doc -> Doc/BeforeWB).
        if (fromTab.type === 'document' && toIndex === firstSheetIdx) {
            targetZone = 'outside-wb';
        } else {
            targetZone = 'inside-wb';
        }
    } else if (toTab?.type === 'add-sheet') {
        // Document moving to add-sheet position means appending to end of docs.
        // This is outside-wb for documents but inside-wb for sheets.
        if (fromTab.type === 'document') {
            targetZone = 'outside-wb';
        } else {
            targetZone = 'inside-wb';
        }
    } else if (toTab?.type === 'document') {
        // Special Case: Sheet moving to just after last sheet (toIndex is first doc after sheets)
        // This is a sheet swap, not a sheet-to-doc move
        if (fromTab.type === 'sheet' && toIndex > 0 && tabs[toIndex - 1]?.type === 'sheet') {
            targetZone = 'inside-wb';
        } else {
            targetZone = 'outside-wb';
        }
    } else {
        // Appending to end or empty space
        // If last tab was sheet -> Inside/Append?
        // If last tab was doc -> Outside/Append?
        const lastTab = tabs[tabs.length - 1];
        if (lastTab?.type === 'sheet') targetZone = 'inside-wb';
        else targetZone = 'outside-wb';
    }

    // Dispatch
    let result: ReorderAction;
    if (fromTab.type === 'sheet') {
        if (targetZone === 'inside-wb') result = handleSheetToSheet(fromIndex, toIndex, tabs, physicalStructure);
        else result = handleSheetToDoc(fromIndex, toIndex, tabs, physicalStructure);
    } else {
        // fromTab.type === 'document'
        if (targetZone === 'outside-wb') result = handleDocToDoc(fromIndex, toIndex, tabs, physicalStructure);
        else result = handleDocToSheet(fromIndex, toIndex, tabs, physicalStructure);
    }

    // Promote 'physical' to 'physical+metadata' if metadata is required
    if (result.actionType === 'physical' && result.metadataRequired && result.physicalMove) {
        return {
            ...result,
            actionType: 'physical+metadata'
        };
    }

    return result;
}
