import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE mock — stores options so static action functions are accessible
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.options = options;
        this.codemirror = {
            on: vi.fn(),
            setOption: vi.fn(),
            replaceSelection: vi.fn(),
            focus: vi.fn()
        };
        this.value = vi.fn().mockReturnValue('');
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

describe('SpreadsheetDocumentView - triggerEditorAction', () => {
    let container: HTMLElement;
    let element: HTMLElement;

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

        await import('../../../components/spreadsheet-document-view.js');

        container = document.createElement('div');
        document.body.appendChild(container);

        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Test Doc';
        (element as any).content = '# Hello';
        (element as any).sectionIndex = 0;
        container.appendChild(element);

        await (element as any).updateComplete;

        // Switch to Write tab so EasyMDE is initialized
        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLElement;
        writeTab.click();
        await (element as any).updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await (element as any).updateComplete;
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('calls EasyMDE.toggleBold when action is bold', async () => {
        const EasyMDE = (await import('easymde')).default;
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        (element as any).triggerEditorAction('bold');

        expect(EasyMDE.toggleBold).toHaveBeenCalledOnce();
        expect(EasyMDE.toggleBold).toHaveBeenCalledWith(easymde);
    });

    it('calls EasyMDE.toggleItalic when action is italic', async () => {
        const EasyMDE = (await import('easymde')).default;
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        (element as any).triggerEditorAction('italic');

        expect(EasyMDE.toggleItalic).toHaveBeenCalledOnce();
        expect(EasyMDE.toggleItalic).toHaveBeenCalledWith(easymde);
    });

    it('calls EasyMDE.toggleHeadingSmaller when action is heading', async () => {
        const EasyMDE = (await import('easymde')).default;
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        (element as any).triggerEditorAction('heading');

        expect(EasyMDE.toggleHeadingSmaller).toHaveBeenCalledOnce();
        expect(EasyMDE.toggleHeadingSmaller).toHaveBeenCalledWith(easymde);
    });

    it('calls EasyMDE.drawLink when action is link', async () => {
        const EasyMDE = (await import('easymde')).default;
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        (element as any).triggerEditorAction('link');

        expect(EasyMDE.drawLink).toHaveBeenCalledOnce();
        expect(EasyMDE.drawLink).toHaveBeenCalledWith(easymde);
    });

    it('does nothing when easymde is not initialized', async () => {
        const EasyMDE = (await import('easymde')).default;

        // Forcibly clear _easymde to simulate uninitialized state
        (element as any)._easymde = null;

        (element as any).triggerEditorAction('bold');

        expect(EasyMDE.toggleBold).not.toHaveBeenCalled();
        expect(EasyMDE.toggleItalic).not.toHaveBeenCalled();
        expect(EasyMDE.toggleHeadingSmaller).not.toHaveBeenCalled();
        expect(EasyMDE.drawLink).not.toHaveBeenCalled();
    });

    it('does nothing when in view mode even if easymde is initialized', async () => {
        const EasyMDE = (await import('easymde')).default;

        // Switch back to view mode
        const tabs = element.querySelectorAll('.sdv-tab');
        const viewTab = tabs[0] as HTMLElement;
        viewTab.click();
        await (element as any).updateComplete;

        // _easymde should still be non-null (kept alive)
        expect((element as any)._easymde).toBeTruthy();
        expect((element as any)._activeTab).toBe('view');

        (element as any).triggerEditorAction('bold');

        expect(EasyMDE.toggleBold).not.toHaveBeenCalled();
    });
});
