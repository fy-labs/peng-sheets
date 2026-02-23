import { IVisualMetadata } from './services/types';

export type Align = 'left' | 'center' | 'right';
export type AlignmentType = Align | 'default';

export interface TableJSON {
    name: string | null;
    description: string | null;
    headers: string[] | null;
    rows: string[][];
    metadata: Record<string, unknown>;
    start_line: number | null;
    end_line: number | null;
    alignments: AlignmentType[] | null;
}

export type LayoutNode = SplitNode | LeafNode;

export interface SplitNode {
    type: 'split';
    id: string; // Unique ID
    direction: 'horizontal' | 'vertical';
    sizes: number[]; // Percentage of available space, e.g. [50, 50]
    children: LayoutNode[];
}

export interface LeafNode {
    type: 'pane';
    id: string; // Unique ID for finding the pane
    tables: number[]; // Array of Table Indices belonging to this pane
    activeTableIndex: number; // The currently selected table index in this pane (relative to the global table list or pane list?)
    // Note: If 'tables' stores GLOBAL table indices, then activeTableIndex should probably be one of those indices.
    // Let's store the index in the `tables` array for safety, i.e., 0 means tables[0].
    // Actually, 'activeTableIndex' in LeafNode usually refers to the index within the 'tables' array of that pane.
    // e.g. activeTabIndex=0 means the first tab in this pane is active.
}

export interface SheetMetadata {
    layout: LayoutNode;
}

export interface TabData {
    id: string; // "sheet-X"
    type: 'sheet' | 'onboarding' | 'add-sheet';
    name: string;
    description?: string;
    sheetIndex?: number;
    data?: {
        tables: TableJSON[];
    };
    metadata?: SheetMetadata;
}

export type SheetType = 'table' | 'doc';

export interface SheetJSON {
    name: string;
    header_line?: number;
    tables: TableJSON[];
    // WASM parser may return either camelCase or snake_case depending on version
    type?: SheetType;
    sheetType?: string; // camelCase from newer parser
    sheet_type?: string; // snake_case from WASM bridge
    content?: string | null;
    metadata?: Record<string, unknown>;
}

/**
 * Check if a SheetJSON represents a Doc Sheet (type='doc')
 * Handles both camelCase and snake_case field names from WASM parser
 */
export function isDocSheetType(sheet: SheetJSON): boolean {
    return sheet.type === 'doc' || sheet.sheetType === 'doc' || sheet.sheet_type === 'doc';
}

/**
 * Get the content from a SheetJSON, handling both field naming conventions
 */
export function getSheetContent(sheet: SheetJSON): string {
    return sheet.content ?? '';
}

export interface DocumentJSON {
    type: 'document';
    title: string;
    content: string;
}

export interface WorkbookJSON {
    name: string;
    sheets: SheetJSON[];
    metadata?: {
        tab_order?: Array<{ type: string; index: number }>;
        [key: string]: unknown;
    };
    rootContent?: string;
}

export interface TabDefinition {
    type: 'sheet' | 'document' | 'root' | 'onboarding' | 'add-sheet';
    title: string;
    index: number;
    sheetIndex?: number;
    docIndex?: number; // Document section index for document tabs
    data?: SheetJSON | DocumentJSON | unknown;
}

export interface StructureItem {
    type: 'workbook' | 'document';
    title?: string;
    content?: string;
}

export type IDocumentSectionRange =
    | { startLine: number; endLine: number; endCol?: number; error?: undefined }
    | { startLine?: undefined; endLine?: undefined; endCol?: undefined; error: string };

export interface IMetadataEditDetail {
    sheetIndex: number;
    tableIndex: number;
    name: string;
    description: string;
}

export interface IMetadataUpdateDetail {
    sheetIndex: number;
    tableIndex: number;
    description: string;
}

export interface ISortRowsDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
    ascending: boolean;
}

export interface IColumnUpdateDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
    alignment?: 'left' | 'center' | 'right' | null;
    format?: Record<string, unknown> | null;
    filter?: Record<string, unknown> | null;
}

export interface IVisualMetadataUpdateDetail {
    sheetIndex: number;
    tableIndex: number;
    visual: IVisualMetadata;
}

export interface ISheetMetadataUpdateDetail {
    sheetIndex: number;
    metadata: Record<string, unknown>;
}

export interface IRequestAddTableDetail {
    sheetIndex: number;
}

export interface IRequestRenameTableDetail {
    sheetIndex: number;
    tableIndex: number;
    newName: string;
}

export interface IRequestDeleteTableDetail {
    sheetIndex: number;
    tableIndex: number;
    newName?: string; // Potential fix for rename/delete confusion, but strictly mirroring main.ts
}

export interface IPasteCellsDetail {
    sheetIndex: number;
    tableIndex: number;
    startRow: number;
    startCol: number;
    data: string[][];
    includeHeaders: boolean;
}

export interface ICellEditDetail {
    sheetIndex: number;
    tableIndex: number;
    rowIndex: number;
    colIndex: number;
    newValue: string;
}

export interface IRangeEditDetail {
    sheetIndex: number;
    tableIndex: number;
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    newValue: string;
}

export interface IRowOperationDetail {
    sheetIndex: number;
    tableIndex: number;
    rowIndex: number;
}

export interface IColumnOperationDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
}

export interface IColumnOperationsDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndices: number[];
}

export interface IColumnResizeDetail {
    sheetIndex: number;
    tableIndex: number;
    col: number;
    width: number;
}

export interface IColumnFilterDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
    hiddenValues: string[];
}

export interface IValidationUpdateDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
    rule: unknown; // ValidationRule | null
}

export interface IFormulaUpdateDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndex: number;
    formula: unknown; // FormulaDefinition | null
    sourceTableMetadata?: {
        sheetIndex: number;
        tableIndex: number;
        visual: unknown;
    } | null;
}

export interface IMoveRowsDetail {
    sheetIndex: number;
    tableIndex: number;
    rowIndices: number[];
    targetRowIndex: number;
}

export interface IMoveColumnsDetail {
    sheetIndex: number;
    tableIndex: number;
    colIndices: number[];
    targetColIndex: number;
}

export interface IMoveCellsDetail {
    sheetIndex: number;
    tableIndex: number;
    sourceRange: { minR: number; maxR: number; minC: number; maxC: number };
    destRow: number;
    destCol: number;
}

export interface IUpdateConfigDetail {
    config: Record<string, unknown>;
}

export type PostMessageCommand =
    | ({ command: 'update_column_filter' } & IColumnFilterDetail)
    | ({ command: 'sort_rows' } & ISortRowsDetail)
    | ({ command: 'update_column_align' } & IColumnUpdateDetail)
    | ({ command: 'update_column_format' } & IColumnUpdateDetail)
    | ({ command: 'update_config' } & IUpdateConfigDetail);

export interface IParseResult {
    workbook: {
        sheets: SheetJSON[];
    };
    structure: unknown;
}

export function isSheetJSON(data: unknown): data is SheetJSON {
    return typeof data === 'object' && data !== null && 'tables' in data;
}

export function isDocumentJSON(data: unknown): data is DocumentJSON {
    return typeof data === 'object' && data !== null && (data as DocumentJSON).type === 'document';
}

export function isIDocumentSectionRange(data: unknown): data is IDocumentSectionRange {
    return typeof data === 'object' && data !== null && ('startLine' in data || 'error' in data);
}
