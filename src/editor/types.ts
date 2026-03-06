/**
 * Type definitions for the PengSheets editor module.
 * Converted from python-modules/src/md_spreadsheet_editor/types.py
 */

// =============================================================================
// Number Format
// =============================================================================

export interface NumberFormat {
    type?: 'number' | 'currency' | 'percent';
    decimals?: number;
    useThousandsSeparator?: boolean;
    currencySymbol?: string;
}

// =============================================================================
// Column Format
// =============================================================================

export interface ColumnFormat {
    wordWrap?: boolean;
    numberFormat?: NumberFormat;
}

// =============================================================================
// Column Metadata
// =============================================================================

export interface ColumnMetadata {
    width?: number;
    format?: ColumnFormat;
    align?: 'left' | 'center' | 'right';
    hidden?: boolean;
    type?: string; // For type inference (number, string, date, etc.)
}

export type ColumnsMetadata = Record<string, ColumnMetadata>;

// =============================================================================
// Validation Rules
// =============================================================================

export interface ListValidationRule {
    [key: string]: unknown;
    type: 'list';
    values: string[];
}

export interface DateValidationRule {
    [key: string]: unknown;
    type: 'date';
}

export interface IntegerValidationRule {
    [key: string]: unknown;
    type: 'integer';
    min?: number;
    max?: number;
}

export interface EmailValidationRule {
    [key: string]: unknown;
    type: 'email';
}

export interface UrlValidationRule {
    [key: string]: unknown;
    type: 'url';
}

export type ValidationRule =
    | ListValidationRule
    | DateValidationRule
    | IntegerValidationRule
    | EmailValidationRule
    | UrlValidationRule;

export type ValidationMetadata = Record<string, ValidationRule>;

// =============================================================================
// Filter Metadata
// =============================================================================

export type FiltersMetadata = Record<string, string[]>;

// =============================================================================
// Formula Definitions (Computed Columns)
// =============================================================================

/**
 * Aggregate function types for arithmetic formulas.
 * - expression: Custom formula like "[Col1] * [Col2]"
 * - sum, avg, count, min, max: Aggregate functions across specified columns
 */
export type FormulaFunctionType = 'expression' | 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Arithmetic formula: calculations within a row.
 * Can reference columns from current table or another table.
 */
export interface ArithmeticFormula {
    type: 'arithmetic';
    functionType: FormulaFunctionType;
    sourceTableId?: number;
    expression?: string;
    columns?: string[];
}

/**
 * Lookup formula: VLOOKUP-style cross-table reference.
 * Retrieves a value from another table based on a matching key.
 */
export interface LookupFormula {
    type: 'lookup';
    sourceTableId: number;
    joinKeyLocal: string;
    joinKeyRemote: string;
    targetField: string;
}

/**
 * Union type for all formula definitions.
 */
export type FormulaDefinition = ArithmeticFormula | LookupFormula;

/**
 * Map of column index (as string) to formula definition.
 */
export type FormulaMetadata = Record<string, FormulaDefinition>;

// =============================================================================
// Visual Metadata
// =============================================================================

export interface VisualMetadata {
    [key: string]: unknown;
    /** Table identity for cross-table references */
    id?: number;
    columns?: ColumnsMetadata;
    validation?: ValidationMetadata;
    filters?: FiltersMetadata;
    formulas?: FormulaMetadata;
    // Legacy support
    column_widths?: Record<string, number> | number[];
}

/**
 * Table metadata as stored in the parsed markdown.
 * The parser wraps custom metadata (including VisualMetadata) under the 'visual' key.
 */
export interface TableMetadata {
    /** Visual metadata containing columns, validation, formulas, etc. */
    visual?: VisualMetadata;
    /** Other metadata properties may exist */
    [key: string]: unknown;
}

// =============================================================================
// Tab Order
// =============================================================================

export interface TabOrderItem {
    type: 'sheet' | 'document';
    index: number;
}

// =============================================================================
// Table Identity (for computed column cross-references)
// =============================================================================

/**
 * Table identity stored in table metadata.
 * ID is auto-incrementing within a file scope (0, 1, 2...).
 */
export interface TableIdentity {
    id: number;
}

// =============================================================================
// Update Result (returned by most operations)
// =============================================================================

export interface UpdateResult {
    [key: string]: unknown; // Index signature for compatibility
    type?: 'updateRange';
    startLine?: number;
    endLine?: number;
    endCol?: number;
    content?: string;
    error?: string;
    file_changed?: boolean;
}

// =============================================================================
// Cell Range (for move_cells, paste_cells)
// =============================================================================

export interface CellRange {
    minR: number;
    maxR: number;
    minC: number;
    maxC: number;
}

// =============================================================================
// Structure Section (from extract_structure)
// =============================================================================

export interface DocumentSection {
    type: 'document';
    title: string;
    content: string;
}

export interface WorkbookSection {
    type: 'workbook';
}

export interface FrontmatterSection {
    type: 'frontmatter';
    title: string;
    content: string;
}

export type StructureSection = DocumentSection | WorkbookSection | FrontmatterSection;

// =============================================================================
// Editor Config
// =============================================================================

export interface EditorConfig {
    rootMarker?: string;
    sheetHeaderLevel?: number;
    tableHeaderLevel?: number;
    captureDescription?: boolean;
    columnSeparator?: string;
    headerSeparatorChar?: string;
    requireOuterPipes?: boolean;
    stripWhitespace?: boolean;
}
