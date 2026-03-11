/**
 * PengSheets Editor - TypeScript module for markdown spreadsheet editing.
 *
 * This is the main entry point that exports everything from the editor module.
 */

// Re-export all API functions
export * from './api';

// Export types
export type {
    UpdateResult,
    TabOrderItem,
    CellRange,
    EditorConfig,
    StructureSection,
    DocumentSection,
    WorkbookSection,
    FrontmatterSection,
    NumberFormat,
    ColumnFormat,
    ColumnMetadata,
    ColumnsMetadata,
    ValidationRule,
    ValidationMetadata,
    FiltersMetadata,
    VisualMetadata,
    ListValidationRule,
    DateValidationRule,
    IntegerValidationRule,
    EmailValidationRule,
    UrlValidationRule
} from './types';

// Export context class for advanced usage
export { EditorContext, getEditorContext } from './context';

// Export structure utilities
export { extractFrontmatter } from './utils/structure';
