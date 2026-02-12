/**
 * EditorContext - Singleton state management for the PengSheets editor.
 * Converted from python-modules/src/md_spreadsheet_editor/context.py
 */

import { parseWorkbook, Workbook, MultiTableParsingSchema } from 'md-spreadsheet-parser';
import type { EditorConfig, StructureSection } from './types';
import { extractStructure, augmentWorkbookMetadata } from './utils/structure';
import { initializeTabOrderFromStructure } from './services/workbook';

// =============================================================================
// Editor State
// =============================================================================

export interface EditorState {
    workbook: Workbook | null;
    schema: MultiTableParsingSchema | null;
    mdText: string;
    config: string | null;
}

function createEditorState(): EditorState {
    return {
        workbook: null,
        schema: null,
        mdText: '',
        config: null
    };
}

// =============================================================================
// Editor Context (Singleton)
// =============================================================================

export class EditorContext {
    private static instance: EditorContext | null = null;
    private state: EditorState = createEditorState();

    private constructor() { }

    static getInstance(): EditorContext {
        if (!EditorContext.instance) {
            EditorContext.instance = new EditorContext();
        }
        return EditorContext.instance;
    }

    // ---------------------------------------------------------------------------
    // Properties
    // ---------------------------------------------------------------------------

    get workbook(): Workbook | null {
        return this.state.workbook;
    }

    set workbook(value: Workbook | null) {
        this.state.workbook = value;
    }

    get schema(): MultiTableParsingSchema | null {
        return this.state.schema;
    }

    set schema(value: MultiTableParsingSchema | null) {
        this.state.schema = value;
    }

    get mdText(): string {
        return this.state.mdText;
    }

    set mdText(value: string) {
        this.state.mdText = value;
    }

    get config(): string | null {
        return this.state.config;
    }

    set config(value: string | null) {
        this.state.config = value;
    }

    // ---------------------------------------------------------------------------
    // Methods
    // ---------------------------------------------------------------------------

    updateState(updates: Partial<EditorState>): void {
        if (updates.workbook !== undefined) {
            this.state.workbook = updates.workbook;
        }
        if (updates.schema !== undefined) {
            this.state.schema = updates.schema;
        }
        if (updates.mdText !== undefined) {
            this.state.mdText = updates.mdText;
        }
        if (updates.config !== undefined) {
            this.state.config = updates.config;
        }
    }

    getFullStateDict(): string {
        if (!this.state.workbook) {
            return JSON.stringify({ workbook: null, structure: null });
        }

        // Use .json getter (not toDTO()) to get metadata as plain objects
        // This matches Python's .json property behavior
        let workbookJson = this.state.workbook.json;
        let structure: StructureSection[] | null = null;

        if (this.state.schema) {
            // When rootMarker is undefined (auto-detection), use workbook.name
            // Parser sets workbook.name from the detected root section (e.g., "Tables")
            const rootMarker = this.state.schema.rootMarker ?? `# ${this.state.workbook.name}`;
            const sheetHeaderLevel = this.state.schema.sheetHeaderLevel ?? 2;

            // Augment workbook with line numbers
            workbookJson = augmentWorkbookMetadata(workbookJson, this.state.mdText, rootMarker, sheetHeaderLevel);

            // Extract structure
            const structureJson = extractStructure(this.state.mdText, rootMarker);
            structure = JSON.parse(structureJson);
        }

        return JSON.stringify({
            workbook: workbookJson,
            structure: structure
        });
    }

    updateWorkbook(newWorkbook: Workbook): void {
        this.state.workbook = newWorkbook;
    }

    reset(): void {
        this.state = createEditorState();
    }

    getState(): string {
        return this.getFullStateDict();
    }

    initializeWorkbook(mdText: string, configJson: string): void {
        this.state.mdText = mdText;
        this.state.config = configJson;

        const configDict: EditorConfig = configJson ? JSON.parse(configJson) : {};

        // Default header levels for generator:
        // - sheetHeaderLevel defaults to 2 (## Sheet)
        // - tableHeaderLevel defaults to sheetLevel + 1 (### Table)
        // Without these, toMarkdown() omits table name headers for auto-detected workbooks.
        const sheetLevel = configDict.sheetHeaderLevel ?? 2;
        const tableLevel = configDict.tableHeaderLevel ?? sheetLevel + 1;

        this.state.schema = new MultiTableParsingSchema({
            // Only override rootMarker if user explicitly configured it
            // Parser defaults to '# Tables' which also works
            rootMarker: configDict.rootMarker,
            sheetHeaderLevel: sheetLevel,
            tableHeaderLevel: tableLevel,
            captureDescription: configDict.captureDescription ?? true,
            columnSeparator: configDict.columnSeparator ?? '|',
            headerSeparatorChar: configDict.headerSeparatorChar ?? '-',
            requireOuterPipes: configDict.requireOuterPipes ?? true,
            stripWhitespace: configDict.stripWhitespace ?? true
        });

        let workbook = parseWorkbook(this.state.mdText, this.state.schema);

        // Update schema with parser-detected rootMarker so toMarkdown
        // generates the correct workbook header (e.g., "# Doc" not "# Workbook")
        if (!configDict.rootMarker && workbook.name) {
            this.state.schema = new MultiTableParsingSchema({
                ...this.state.schema,
                rootMarker: `# ${workbook.name}`
            });
        }

        // Initialize tab_order if not present in metadata
        if (!workbook.metadata?.tab_order) {
            const numSheets = (workbook.sheets ?? []).length;

            // Use the Parser-detected workbook name for rootMarker
            // This ensures tab_order reflects the actual file structure
            let effectiveConfig = configJson;
            if (workbook.name) {
                const configWithRootMarker = configJson ? JSON.parse(configJson) : {};
                configWithRootMarker.rootMarker = `# ${workbook.name}`;
                effectiveConfig = JSON.stringify(configWithRootMarker);
            }

            const tabOrder = initializeTabOrderFromStructure(mdText, effectiveConfig, numSheets);

            const metadata = { ...(workbook.metadata || {}), tab_order: tabOrder };
            workbook = new Workbook({ ...workbook, metadata });
        }

        this.state.workbook = workbook;
    }
}

// Export singleton getter for convenience
export function getEditorContext(): EditorContext {
    return EditorContext.getInstance();
}
