/**
 * Reproduction test for Root Tab display bug
 *
 * This test verifies that workbook.rootContent correctly triggers
 * creation of a Root Tab in the UI tabs array.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as editor from '../../../src/editor/api';

// Simulate the TabDefinition type from main.ts
interface TabDefinition {
    type: string;
    title: string;
    index: number;
    docIndex?: number;
    sheetIndex?: number;
    data?: unknown;
}

// Simulate the StructureItem type
interface StructureItem {
    type: string;
    title?: string;
}

describe('Root Tab Display Bug Reproduction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * THIS IS THE KEY TEST
     * Simulates the exact logic from main.ts:1345-1387
     * to verify Root Tab is added to newTabs array
     */
    it('REPRO: User sample - Root Tab should be created in tabs array', () => {
        // User's exact sample markdown
        const markdown = `# Doc

test text

`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const stateJson = editor.getState();
        const state = JSON.parse(stateJson);

        console.log('=== User Sample DEBUG: Full state ===');
        console.log(JSON.stringify(state, null, 2));

        // Simulate main.ts _parseWorkbook logic (lines 1345-1387)
        const workbook = state.workbook;
        const structure: StructureItem[] = state.structure;
        const newTabs: TabDefinition[] = [];
        let workbookFound = false;
        let docIndex = 0;

        for (const section of structure) {
            if (section.type === 'document') {
                newTabs.push({
                    type: 'document',
                    title: section.title!,
                    index: newTabs.length,
                    docIndex: docIndex++,
                    data: section
                });
            } else if (section.type === 'workbook') {
                workbookFound = true;

                // This is line 1358 in main.ts
                const rootContent = (workbook as unknown as { rootContent?: string })?.rootContent;
                console.log('=== CRITICAL: rootContent check ===', rootContent);

                if (rootContent) {
                    const rootTabName = 'Root'; // Simplified, main.ts uses i18n
                    newTabs.push({
                        type: 'root',
                        title: rootTabName,
                        index: newTabs.length,
                        data: { type: 'root', content: rootContent }
                    });
                    console.log('=== Root Tab ADDED ===');
                } else {
                    console.log('=== Root Tab NOT ADDED - rootContent is falsy ===');
                }

                if (workbook && workbook.sheets && workbook.sheets.length > 0) {
                    workbook.sheets.forEach((sheet: { name?: string }, shIdx: number) => {
                        newTabs.push({
                            type: 'sheet',
                            title: sheet.name || `Sheet ${shIdx + 1}`,
                            index: newTabs.length,
                            sheetIndex: shIdx,
                            data: sheet
                        });
                    });
                } else if (!rootContent) {
                    newTabs.push({
                        type: 'onboarding',
                        title: 'New Spreadsheet',
                        index: newTabs.length
                    });
                }
            }
        }

        console.log('=== Final newTabs array ===');
        console.log(JSON.stringify(newTabs, null, 2));

        // ASSERTIONS
        expect(workbookFound).toBe(true);

        // Critical: Root Tab MUST be in newTabs
        const rootTab = newTabs.find((t) => t.type === 'root');
        expect(rootTab).toBeDefined();
        expect(rootTab?.title).toBe('Root');
        expect(rootTab?.data).toEqual({ type: 'root', content: 'test text' });

        // No sheets in this sample, so no sheet tabs
        const sheetTabs = newTabs.filter((t) => t.type === 'sheet');
        expect(sheetTabs.length).toBe(0);

        // No onboarding because rootContent exists
        const onboardingTab = newTabs.find((t) => t.type === 'onboarding');
        expect(onboardingTab).toBeUndefined();
    });

    it('REPRO: workbook with rootContent should have rootContent property accessible after parsing', () => {
        const markdown = `# My Workbook

This is the root content that should appear in Root Tab.

## Sheet 1

| A | B |
|---|---|
| 1 | 2 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const stateJson = editor.getState();
        const state = JSON.parse(stateJson);

        expect(state.workbook).toBeDefined();
        expect(state.workbook.name).toBe('My Workbook');
        expect(state.workbook.rootContent).toBe('This is the root content that should appear in Root Tab.');

        const workbook = state.workbook;
        const rootContent = (workbook as unknown as { rootContent?: string })?.rootContent;
        expect(rootContent).toBeTruthy();
    });

    it('REPRO: state.structure should contain workbook section', () => {
        const markdown = `# My Workbook

Root content here.

## Sheet 1

| A |
|---|
| 1 |
`;
        editor.initializeWorkbook(markdown, JSON.stringify({}));
        const stateJson = editor.getState();
        const state = JSON.parse(stateJson);

        expect(state.structure).toBeDefined();
        const workbookSection = state.structure.find((s: { type: string }) => s.type === 'workbook');
        expect(workbookSection).toBeDefined();
    });
});
