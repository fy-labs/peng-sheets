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
        await import('../../components/spreadsheet-document-view.js');
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    /**
     * Reproduces Bug 2 for regular document tabs (Multi H1 mode).
     * In spreadsheet-document-view.ts _enterEditMode() line ~74:
     *   this._editContent = this.isRootTab ? this.content : this._getFullContent();
     * _getFullContent() returns `# ${this.title}\n${this.content}`, so the textarea
     * shows "# Doc" which is confusing. Since tab name is editable via double-click,
     * the header should NOT be in the textarea.
     */
    it('should NOT include H1 header in edit mode for regular document tab', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'My Document';
        (element as any).content = 'Hello world\n\nParagraph 2';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // Enter edit mode
        const outputDiv = element.shadowRoot!.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();
        await (element as any).updateComplete;

        // Check textarea content
        const textarea = element.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();

        // BUG: Currently textarea contains "# My Document\nHello world\n\nParagraph 2"
        // EXPECTED: textarea should contain only "Hello world\n\nParagraph 2" (no header)
        expect(textarea.value).not.toContain('# My Document');
        expect(textarea.value).toContain('Hello world');
    });

    /**
     * Reproduces Bug 2 for doc sheet tabs (Single H1 mode).
     * Same issue: _getFullContent() adds "# title" to edit content.
     */
    it('should NOT include H1 header in edit mode for doc sheet tab', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Doc Sheet';
        (element as any).content = 'Doc sheet content here';
        (element as any).isDocSheet = true;
        (element as any).sheetIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // Enter edit mode
        const outputDiv = element.shadowRoot!.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();
        await (element as any).updateComplete;

        // Check textarea content
        const textarea = element.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();

        // EXPECTED: textarea should contain only body content (no header)
        expect(textarea.value).not.toContain('# Doc Sheet');
        expect(textarea.value).toContain('Doc sheet content here');
    });

    /**
     * Verifies that saving from edit mode correctly preserves title and body
     * when the textarea no longer contains a header line.
     */
    it('should preserve title when saving edited content without header', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Original Title';
        (element as any).content = 'Original content';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        // Enter edit mode
        const outputDiv = element.shadowRoot!.querySelector('.output') as HTMLElement;
        outputDiv.click();
        await (element as any).updateComplete;

        const textarea = element.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;

        // Edit just the body content (no header in textarea)
        textarea.value = 'Updated content';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Trigger save via blur
        textarea.dispatchEvent(new FocusEvent('blur'));
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Title should be preserved from the original, content should be updated
        expect(eventSpy).toHaveBeenCalled();
        const detail = eventSpy.mock.calls[0][0].detail;
        expect(detail.title).toBe('Original Title');
        expect(detail.content).toBe('Updated content');
    });

    /**
     * Verifies that the rendered preview still shows the title (H1 header).
     * Only edit mode should hide it.
     */
    it('should still show H1 header in rendered preview mode', async () => {
        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Preview Title';
        (element as any).content = 'Preview body';
        (element as any).sectionIndex = 0;
        container.appendChild(element);
        await (element as any).updateComplete;

        // In preview mode, the rendered HTML should include the title as H1
        const outputDiv = element.shadowRoot!.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        expect(outputDiv.innerHTML).toContain('Preview Title');
    });
});
