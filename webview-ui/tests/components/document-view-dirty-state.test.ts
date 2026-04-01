/**
 * Reproduction tests for: EasyMDE editing does not mark VS Code document dirty.
 *
 * Root cause: CodeMirror 'change' handler only updates _editContent in-memory.
 * No event is dispatched to the extension host during Write mode editing.
 * Fix: Call _debouncedNotifyDirty() in the 'change' handler so that a
 * 'document-change' (or 'root-content-change'/'doc-sheet-change') event with
 * save: false is dispatched after DIRTY_NOTIFY_DEBOUNCE_MS (500ms) of inactivity.
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

// ─── Test 1: dirty notification event dispatched after debounce ───────────────

describe('Dirty state: document-change with save:false dispatched after EasyMDE change', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch document-change with save:false after 500ms of inactivity', async () => {
        const { element, container } = await createElement({ content: 'Hello world' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // Simulate user typing
            instance._currentValue = 'Hello world edited';
            instance._changeCallback?.();

            // Before debounce resolves, no event should be dispatched
            expect(events).toHaveLength(0);

            // Advance timers past DIRTY_NOTIFY_DEBOUNCE_MS (500ms)
            vi.advanceTimersByTime(500);

            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);
            expect(events[0].detail.content).toBe('Hello world edited');
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });

    it('should dispatch only once for multiple rapid changes (debounce)', async () => {
        const { element, container } = await createElement({ content: 'Hello' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // Simulate rapid keystrokes
            instance._currentValue = 'H';
            instance._changeCallback?.();
            vi.advanceTimersByTime(100);

            instance._currentValue = 'He';
            instance._changeCallback?.();
            vi.advanceTimersByTime(100);

            instance._currentValue = 'Hel';
            instance._changeCallback?.();
            vi.advanceTimersByTime(100);

            // 300ms elapsed but debounce timer reset each time — no dispatch yet
            expect(events).toHaveLength(0);

            // Wait past the full debounce period after the last call
            vi.advanceTimersByTime(400);

            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });
});

// ─── Test 2: save:true vs save:false distinction ──────────────────────────────

describe('Dirty state: change event dispatches save:false', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('change-only dispatch (dirty notification) uses save:false', async () => {
        const { element, container } = await createElement({ content: 'Test' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            instance._currentValue = 'Test edited';
            instance._changeCallback?.();

            vi.advanceTimersByTime(500);

            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });
});

// ─── Test 3: dirty debounce flushed on tab switch ────────────────────────────

describe('Dirty state: _debouncedNotifyDirty flushed on _switchToViewTab', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('switching to view tab should flush pending dirty notification immediately', async () => {
        const { element, container } = await createElement({ content: 'Initial' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // Simulate edit
            instance._currentValue = 'Initial modified';
            instance._changeCallback?.();

            // Only 100ms elapsed: dirty debounce (500ms) has NOT fired yet
            vi.advanceTimersByTime(100);
            expect(events).toHaveLength(0);

            // Switch to view tab — flush() should fire the pending dirty notification immediately
            const tabs = element.querySelectorAll('.sdv-tab');
            (tabs[0] as HTMLButtonElement).click();

            // The event should be dispatched synchronously by flush()
            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);

            // No additional events after the debounce period
            vi.advanceTimersByTime(500);
            expect(events).toHaveLength(1);
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });

    it('switching to view tab after save should NOT dispatch any event (no pending dirty)', async () => {
        const { element, container } = await createElement({ content: 'Initial' });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('document-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // Simulate edit
            instance._currentValue = 'Content edited';
            instance._changeCallback?.();

            // Let the dirty debounce fire naturally (500ms)
            vi.advanceTimersByTime(500);
            expect(events).toHaveLength(1); // dirty notification sent

            // Clear events for next assertion
            events.length = 0;

            // Switch to view tab — no pending dirty, so flush() is a no-op
            const tabs = element.querySelectorAll('.sdv-tab');
            (tabs[0] as HTMLButtonElement).click();

            // No event dispatched
            expect(events).toHaveLength(0);

            // No delayed event either
            vi.advanceTimersByTime(500);
            expect(events).toHaveLength(0);
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });
});

// ─── Test 4: root-content-change dispatched for isRootTab ─────────────────────

describe('Dirty state: root-content-change dispatched for isRootTab=true', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch root-content-change with save:false for isRootTab documents', async () => {
        const { element, container } = await createElement({ content: 'Root content', isRootTab: true });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('root-content-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            instance._currentValue = 'Root content edited';
            instance._changeCallback?.();

            vi.advanceTimersByTime(500);

            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);
            expect(events[0].detail.content).toBe('Root content edited');
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });
});

// ─── Test 5: doc-sheet-change dispatched for isDocSheet ───────────────────────

describe('Dirty state: doc-sheet-change dispatched for isDocSheet=true', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should dispatch doc-sheet-change with save:false for isDocSheet documents', async () => {
        const { element, container } = await createElement({
            content: 'Sheet content',
            isDocSheet: true,
            sheetIndex: 2
        });
        const instance = await switchToWriteTab(element);

        const events: CustomEvent[] = [];
        element.addEventListener('doc-sheet-change', (e) => events.push(e as CustomEvent));

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            instance._currentValue = 'Sheet content edited';
            instance._changeCallback?.();

            vi.advanceTimersByTime(500);

            expect(events).toHaveLength(1);
            expect(events[0].detail.save).toBe(false);
            expect(events[0].detail.sheetIndex).toBe(2);
        } finally {
            vi.useRealTimers();
            container.remove();
        }
    });
});
