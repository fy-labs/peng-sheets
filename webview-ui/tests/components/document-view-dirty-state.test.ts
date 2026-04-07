/**
 * Tests for dirty state notification timing.
 *
 * Dirty content is NOT sent during editing (no debounce).
 * It is sent only when:
 * 1. Switching from Write mode to View mode
 * 2. Component is destroyed (e.g. bottom tab switch via keyed() directive)
 * 3. Ctrl+S triggers a 'flush-edit-content' window event before save
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import '../../components/spreadsheet-document-view';
import { SpreadsheetDocumentView } from '../../components/spreadsheet-document-view';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE mock that captures the codemirror 'change' callback
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this._currentValue = options?.initialValue ?? '';
        this.codemirror = {
            on: vi.fn((event: string, cb: () => void) => {
                if (event === 'change') {
                    this._changeCallback = cb;
                }
            }),
            setOption: vi.fn()
        };
        this.value = vi.fn(() => this._currentValue);
        this.toTextArea = vi.fn();
        this.setValue = vi.fn((v: string) => {
            this._currentValue = v;
        });

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

// ─── helpers ──────────────────────────────────────────────────────────────────

async function createElement(overrides: Partial<SpreadsheetDocumentView> = {}): Promise<{
    element: SpreadsheetDocumentView;
    container: HTMLDivElement;
}> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const element = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
    element.title = 'My Doc';
    element.content = 'Original content';
    element.headerText = '## My Doc';
    Object.assign(element, overrides);
    container.appendChild(element);
    await element.updateComplete;
    return { element, container };
}

/** Switch to Write tab and return the EasyMDE mock instance. */
async function switchToWriteTab(element: SpreadsheetDocumentView): Promise<any> {
    const EasyMDEModule = await import('easymde');
    const EasyMDE = (EasyMDEModule as any).default;

    const tabs = element.querySelectorAll('.sdv-tab');
    (tabs[1] as HTMLButtonElement).click();
    await element.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await element.updateComplete;

    return EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];
}

// ─── Test 1: no event during editing ────────────────────────────────────────

describe('Dirty state: no event dispatched during editing', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should NOT dispatch document-change while typing in write mode', async () => {
        const { element, container } = await createElement({ content: 'Hello world' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        // Simulate user typing
        instance._currentValue = 'Hello world edited';
        instance._changeCallback?.();

        // Wait well past old debounce period
        await new Promise((r) => setTimeout(r, 600));

        // No event should be dispatched during editing
        expect(events).toHaveLength(0);

        container.remove();
    });

    it('should NOT dispatch event for multiple rapid changes during editing', async () => {
        const { element, container } = await createElement({ content: 'Hello' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        // Simulate rapid keystrokes
        instance._currentValue = 'H';
        instance._changeCallback?.();
        instance._currentValue = 'He';
        instance._changeCallback?.();
        instance._currentValue = 'Hel';
        instance._changeCallback?.();

        await new Promise((r) => setTimeout(r, 600));
        expect(events).toHaveLength(0);

        container.remove();
    });
});

// ─── Test 2: event dispatched on view tab switch ────────────────────────────

describe('Dirty state: event dispatched when switching to view tab', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('switching to view tab should dispatch dirty notification', async () => {
        const { element, container } = await createElement({ content: 'Initial' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        // Simulate edit
        instance._currentValue = 'Initial modified';
        instance._changeCallback?.();

        // No event yet
        expect(events).toHaveLength(0);

        // Switch to view tab
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[0] as HTMLButtonElement).click();

        // Event dispatched synchronously on view switch
        expect(events).toHaveLength(1);
        expect(events[0].detail.save).toBe(false);

        container.remove();
    });
});

// ─── Test 3: event dispatched on disconnectedCallback (bottom tab switch) ───

describe('Dirty state: event dispatched on component destroy', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('removing element should dispatch dirty notification for pending edits', async () => {
        const { element, container } = await createElement({ content: 'Initial' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        // Listen on window because disconnectedCallback dispatches on window
        // (element is already disconnected from DOM at that point)
        const handler = (e: Event) => events.push(e as CustomEvent);
        window.addEventListener('document-change', handler);

        // Simulate edit
        instance._currentValue = 'Edited in write mode';
        instance._changeCallback?.();

        expect(events).toHaveLength(0);

        // Remove element (simulates bottom tab switch with keyed() directive)
        element.remove();

        expect(events).toHaveLength(1);
        expect(events[0].detail.save).toBe(false);

        window.removeEventListener('document-change', handler);
        container.remove();
    });
});

// ─── Test 4: flush-edit-content event (Ctrl+S) ─────────────────────────────

describe('Dirty state: flush-edit-content event triggers dirty notification', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch dirty notification on flush-edit-content window event', async () => {
        const { element, container } = await createElement({ content: 'Test' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        // Simulate edit
        instance._currentValue = 'Test edited for save';
        instance._changeCallback?.();

        expect(events).toHaveLength(0);

        // Dispatch flush-edit-content (what Ctrl+S handler does before save)
        window.dispatchEvent(new Event('flush-edit-content'));

        expect(events).toHaveLength(1);
        expect(events[0].detail.save).toBe(false);
        expect(events[0].detail.content).toBe('Test edited for save');

        container.remove();
    });

    it('should NOT dispatch if not in write mode', async () => {
        const { element, container } = await createElement({ content: 'Test' });

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        // In view mode, flush-edit-content should be a no-op
        window.dispatchEvent(new Event('flush-edit-content'));

        expect(events).toHaveLength(0);

        container.remove();
    });
});

// ─── Test 5: root-content-change dispatched for isRootTab ─────────────────

describe('Dirty state: root-content-change dispatched for isRootTab=true', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch root-content-change on view switch for isRootTab documents', async () => {
        const { element, container } = await createElement({ content: 'Root content', isRootTab: true });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('root-content-change', (e) => events.push(e as CustomEvent));

        instance._currentValue = 'Root content edited';
        instance._changeCallback?.();

        // Switch to view tab to trigger notification
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[0] as HTMLButtonElement).click();

        expect(events).toHaveLength(1);
        expect(events[0].detail.save).toBe(false);
        expect(events[0].detail.content).toBe('Root content edited');

        container.remove();
    });
});

// ─── Test 6: doc-sheet-change dispatched for isDocSheet ───────────────────

describe('Dirty state: doc-sheet-change dispatched for isDocSheet=true', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch doc-sheet-change on view switch for isDocSheet documents', async () => {
        const { element, container } = await createElement({
            content: 'Sheet content',
            isDocSheet: true,
            sheetIndex: 2
        });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('doc-sheet-change', (e) => events.push(e as CustomEvent));

        instance._currentValue = 'Sheet content edited';
        instance._changeCallback?.();

        // Switch to view tab to trigger notification
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[0] as HTMLButtonElement).click();

        expect(events).toHaveLength(1);
        expect(events[0].detail.save).toBe(false);
        expect(events[0].detail.sheetIndex).toBe(2);

        container.remove();
    });
});
