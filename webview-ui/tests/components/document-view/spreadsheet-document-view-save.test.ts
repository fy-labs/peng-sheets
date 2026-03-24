import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE mock — captures options and simulates toolbar creation
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.options = options;
        this.codemirror = {
            on: vi.fn(),
            setOption: vi.fn()
        };
        // value() returns whatever was set via value(newVal), or initialValue
        let _val = options?.initialValue ?? '';
        this.value = vi.fn().mockImplementation((newVal?: string) => {
            if (newVal !== undefined) _val = newVal;
            return _val;
        });
        this.toTextArea = vi.fn();

        // Simulate EasyMDE creating .editor-toolbar in parent
        if (options?.element?.parentElement) {
            const toolbar = document.createElement('div');
            toolbar.className = 'editor-toolbar';
            options.element.parentElement.insertBefore(toolbar, options.element);
        }
    });
    (EasyMDE as any).toggleBold = vi.fn();
    (EasyMDE as any).toggleItalic = vi.fn();
    (EasyMDE as any).toggleHeadingSmaller = vi.fn();
    (EasyMDE as any).toggleBlockquote = vi.fn();
    (EasyMDE as any).toggleUnorderedList = vi.fn();
    (EasyMDE as any).toggleOrderedList = vi.fn();
    (EasyMDE as any).drawLink = vi.fn();
    (EasyMDE as any).drawImage = vi.fn();
    (EasyMDE as any).togglePreview = vi.fn();
    (EasyMDE as any).toggleSideBySide = vi.fn();
    return { default: EasyMDE };
});

/** Helper: switch to the Write tab and wait for EasyMDE to initialize. */
async function enterWriteMode(element: HTMLElement): Promise<void> {
    const tabs = element.querySelectorAll('.sdv-tab');
    (tabs[1] as HTMLElement).click();
    await (element as any).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (element as any).updateComplete;
}

// Test the document-change event dispatch mechanism
describe('SpreadsheetDocumentView save functionality', () => {
    let element: HTMLElement;
    let container: HTMLElement;

    beforeEach(async () => {
        // Mock getBoundingClientRect for JSDOM and CodeMirror
        Range.prototype.getBoundingClientRect = () => ({
            bottom: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            width: 0,
            x: 0,
            y: 0,
            toJSON() {
                return this;
            }
        });

        Range.prototype.getClientRects = () => {
            return { length: 0, item: () => null, [Symbol.iterator]: function* () {} } as unknown as DOMRectList;
        };

        // Import the component
        await import('../../../components/spreadsheet-document-view.js');

        // Create container and element
        container = document.createElement('div');
        document.body.appendChild(container);

        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Test Content';
        (element as any).content = 'Some text';
        (element as any).sectionIndex = 0;
        container.appendChild(element);

        // Wait for component to initialize
        await (element as any).updateComplete;
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should show View tab as active in view mode', async () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        expect(tabs.length).toBe(2);
        // View tab (index 0) should be active
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
        expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    });

    it('should NOT enter write mode when clicking on content area', async () => {
        const outputDiv = element.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();

        await (element as any).updateComplete;

        // Should still be in view mode (_activeTab === 'view')
        expect((element as any)._activeTab).toBe('view');
        expect((element as any)._easymde).toBeNull();
        expect(element.querySelector('.output')).toBeTruthy();
    });

    it('should enter write mode and initialize EasyMDE when Write tab is clicked', async () => {
        await enterWriteMode(element);

        expect((element as any)._activeTab).toBe('write');
        expect((element as any)._easymde).toBeTruthy();
        expect(element.querySelector('.edit-container')).toBeTruthy();
    });

    it('should dispatch document-change event when content is edited and View tab is clicked', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const eventSpy = vi.fn();
            element.addEventListener('document-change', eventSpy);

            await enterWriteMode(element);

            const easymde = (element as any)._easymde;
            expect(easymde).toBeTruthy();

            // Modify the content via the mock
            easymde.value('New text');

            // Switch back to View tab (calls _switchToViewTab(true))
            (element as any)._switchToViewTab(true);
            await (element as any).updateComplete;

            vi.advanceTimersByTime(500);
            expect(eventSpy).toHaveBeenCalled();
            expect(eventSpy.mock.calls[0][0].detail.sectionIndex).toEqual(0);
            expect(eventSpy.mock.calls[0][0].detail.content).toEqual('New text');
            expect(eventSpy.mock.calls[0][0].detail.title).toEqual('Test Content');
        } finally {
            vi.useRealTimers();
        }
    });

    it('should NOT dispatch document-change event if content is unchanged', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        await enterWriteMode(element);

        // Exit without modifying (switch to View tab)
        (element as any)._switchToViewTab(true);

        // Event should NOT be dispatched (content unchanged)
        expect(eventSpy).not.toHaveBeenCalled();
    });

    it('should cancel edit and NOT save when Escape handler is called', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        await enterWriteMode(element);

        const easymde = (element as any)._easymde;

        // Change content
        easymde.value('Modified Content');

        // Cancel edit mode (shouldSave=false, like Escape key)
        (element as any)._switchToViewTab(false);

        await (element as any).updateComplete;

        // Event should NOT be dispatched
        expect(eventSpy).not.toHaveBeenCalled();

        // Should be back in view mode
        const outputDivAfter = element.querySelector('.output');
        expect(outputDivAfter).toBeTruthy();
    });

    it('should set save: false in document-change when View tab is clicked (Fix 2)', async () => {
        // Fix 2: View tab click no longer triggers VS Code save (save: false).
        // save: true is only sent when the user explicitly saves (e.g. Ctrl+S).
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const eventSpy = vi.fn();
            element.addEventListener('document-change', eventSpy);

            await enterWriteMode(element);

            const easymde = (element as any)._easymde;

            // Change content
            easymde.value('Changed Content');

            // Switch to View tab (calls _switchToViewTab(false) after Fix 2)
            const tabsAfter = element.querySelectorAll('.sdv-tab');
            (tabsAfter[0] as HTMLElement).click();

            vi.advanceTimersByTime(500);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            const detail = eventSpy.mock.calls[0][0].detail;
            expect(detail.content).toContain('Changed Content');
            expect(detail.save).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
