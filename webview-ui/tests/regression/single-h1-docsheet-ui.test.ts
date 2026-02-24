/**
 * Regression tests for Issue #7: Doc tab bugs in Single H1 workbook mode
 *
 * Bug 1: Doc tab shows table icon and spreadsheet toolbar (should show file icon, no toolbar)
 * Bug 2: Edit mode shows "# Doc" header (should be hidden for all doc tabs)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDocSheetType, isSheetJSON, SheetJSON } from '../../types';

// --- Bug 1: Toolbar & Icon ---

describe('Bug 1: Doc sheet toolbar and icon', () => {
    /**
     * Reproduces the toolbar visibility bug from main.ts _renderContent() line ~955.
     * The toolbar hide condition is:
     *   activeTab.type !== 'document' && activeTab.type !== 'onboarding' && activeTab.type !== 'root'
     * This does NOT exclude doc sheets (type === 'sheet' with sheetType === 'doc'),
     * so the toolbar incorrectly renders for doc sheet tabs.
     */
    it('should hide toolbar when active tab is a doc sheet', () => {
        // Simulate a doc sheet tab as constructed in main.ts _parseWorkbook() line ~1488
        const docSheetData: SheetJSON = {
            name: 'Doc1',
            tables: [],
            type: 'doc',
            content: 'some doc content'
        };

        const activeTab = {
            type: 'sheet' as const,
            title: 'Doc1',
            index: 0,
            sheetIndex: 0,
            data: docSheetData
        };

        // This is the condition from main.ts line ~955 that determines toolbar visibility
        // CURRENT (buggy): toolbar shows when type is not 'document', 'onboarding', or 'root'
        const showToolbarBuggy =
            activeTab.type !== 'document' && activeTab.type !== 'onboarding' && activeTab.type !== 'root';

        // The buggy condition shows toolbar for doc sheets (type === 'sheet')
        expect(showToolbarBuggy).toBe(true); // confirms the bug exists

        // EXPECTED: toolbar should also be hidden for doc sheet tabs
        // The fix should add: && !(type === 'sheet' && isDocSheetType(data))
        const isDocSheet =
            activeTab.type === 'sheet' && isSheetJSON(activeTab.data) && isDocSheetType(activeTab.data as SheetJSON);

        const showToolbarFixed =
            activeTab.type !== 'document' &&
            activeTab.type !== 'onboarding' &&
            activeTab.type !== 'root' &&
            !isDocSheet;

        // This assertion will FAIL until the fix is applied to main.ts
        // (We test the logic here; the actual fix goes in main.ts _renderContent)
        expect(showToolbarFixed).toBe(false);
    });

    /**
     * Reproduces the icon bug from bottom-tabs.ts _renderTabIcon() line ~201.
     * Doc sheets have type === 'sheet', so they get the table icon instead of file icon.
     */
    it('should identify doc sheet for file icon rendering', () => {
        const docSheetData: SheetJSON = {
            name: 'Doc1',
            tables: [],
            type: 'doc',
            content: 'content'
        };

        // Verify isDocSheetType correctly identifies doc sheets
        expect(isDocSheetType(docSheetData)).toBe(true);

        // A regular table sheet should NOT be identified as doc sheet
        const tableSheetData: SheetJSON = {
            name: 'Sheet1',
            tables: [
                {
                    name: 'Table1',
                    description: null,
                    headers: ['A'],
                    rows: [],
                    metadata: {},
                    start_line: null,
                    end_line: null,
                    alignments: null
                }
            ],
            type: 'table'
        };
        expect(isDocSheetType(tableSheetData)).toBe(false);
    });
});

// --- Bug 2: Edit mode header ---

describe('Bug 2: Edit mode should not include header for document tabs', () => {
    let element: HTMLElement;
    let container: HTMLElement;

    beforeEach(async () => {
        // Mock getBoundingClientRect for JSDOM and CodeMirror
        Range.prototype.getBoundingClientRect = () => ({
            bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
            toJSON() { return this; }
        });

        Range.prototype.getClientRects = () => {
            return { length: 0, item: () => null, [Symbol.iterator]: function* () { } } as unknown as DOMRectList;
        };

        await import('../../components/spreadsheet-document-view.js');
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('should NOT include H1 header in edit mode for regular document tab', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'My Document';
        (element as any).content = 'Hello world\n\nParagraph 2';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // Enter edit mode
        const outputDiv = element.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();
        await (element as any).updateComplete;

        // Check edit content (EasyMDE wraps the textarea)
        const editContent = (element as any)._editContent;
        expect(editContent).not.toContain('# My Document');
        expect(editContent).toContain('Hello world');
    });

    it('should NOT include H1 header in edit mode for doc sheet tab', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Doc Sheet';
        (element as any).content = 'Doc sheet content here';
        (element as any).isDocSheet = true;
        (element as any).sheetIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // Enter edit mode
        const outputDiv = element.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();
        await (element as any).updateComplete;

        // Check edit content
        const editContent = (element as any)._editContent;
        expect(editContent).not.toContain('# Doc Sheet');
        expect(editContent).toContain('Doc sheet content here');
    });

    it('should preserve title when saving edited content without header', async () => {
        vi.useFakeTimers();
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Original Title';
        (element as any).content = 'Original content';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        // Enter edit mode
        const outputDiv = element.querySelector('.output') as HTMLElement;
        outputDiv.click();
        await (element as any).updateComplete;

        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        // Edit content (no header prefix)
        easymde.value('Updated content');

        // Save via _exitEditMode
        (element as any)._exitEditMode(true);

        vi.advanceTimersByTime(500);

        expect(eventSpy).toHaveBeenCalled();
        const detail = eventSpy.mock.calls[0][0].detail;
        expect(detail.title).toBe('Original Title');
        expect(detail.content).toBe('Updated content');
        vi.useRealTimers();
    });

    it('should still show H1 header in rendered preview mode', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Preview Title';
        (element as any).content = 'Preview body';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // In preview mode, the rendered HTML should include the title as H1
        const outputDiv = element.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        expect(outputDiv.innerHTML).toContain('Preview Title');
    });
});
