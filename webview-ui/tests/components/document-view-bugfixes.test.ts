/**
 * Tests for SpreadsheetDocumentView - 3 bug fix reproductions.
 *
 * Bug Fix 1: Tab click outline should only appear on keyboard focus (:focus-visible).
 *   Root cause: .sdv-tab:focus shows outline on mouse click too.
 *   Fix: Change .sdv-tab:focus to .sdv-tab:focus-visible in CSS.
 *
 * Bug Fix 2: View tab flicker when switching from Write mode.
 *   Root cause: _getRenderedContent() calls _getFullContent(false) which uses
 *   this.content (the prop), not _editContent (the in-memory edited content).
 *   Fix: _getRenderedContent() uses _editContent when non-empty.
 *
 * Bug Fix 3: render() fires on every keystroke in Write mode.
 *   Root cause: _editContent has @state() decorator, so LitElement re-renders
 *   on every EasyMDE codemirror 'change' event.
 *   Fix: Remove @state() from _editContent.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
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

// EasyMDE mock — captures options and simulates toolbar creation
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

// ─── Fix 1: :focus vs :focus-visible ─────────────────────────────────────────

describe('Fix 1: .sdv-tab should use :focus-visible not :focus', () => {
    it('document-view.css should NOT have .sdv-tab:focus rule', () => {
        const cssPath = resolve(__dirname, '../../components/styles/document-view.css');
        const cssText = readFileSync(cssPath, 'utf-8');
        // Must NOT have bare :focus (which shows outline on mouse click)
        expect(cssText).not.toMatch(/\.sdv-tab:focus\s*\{/);
    });

    it('document-view.css should have .sdv-tab:focus-visible rule', () => {
        const cssPath = resolve(__dirname, '../../components/styles/document-view.css');
        const cssText = readFileSync(cssPath, 'utf-8');
        // Must have :focus-visible (keyboard navigation only)
        expect(cssText).toMatch(/\.sdv-tab:focus-visible\s*\{/);
    });
});

// ─── Fix 2: _getRenderedContent uses _editContent when available ───────────────

describe('Fix 2: View tab renders _editContent (no flicker)', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('View tab shows updated content after Write tab editing when switching back', async () => {
        const { element, container } = await createElement({
            content: 'Original content'
        });

        // Switch to Write tab
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // Simulate editing in EasyMDE: update _editContent via change callback
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;
        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];

        // Simulate user typing new content
        instance._currentValue = 'Updated content after editing';
        // Fire the change callback to sync _editContent
        if (instance._changeCallback) {
            instance._changeCallback();
        }

        // Now switch back to View tab
        const tabsAfter = element.querySelectorAll('.sdv-tab');
        (tabsAfter[0] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // The View tab should show the edited content, not the original prop content
        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
        expect(output!.textContent).toContain('Updated content after editing');
        expect(output!.textContent).not.toContain('Original content');

        container.remove();
    });

    it('View tab shows initial content via willUpdate sync on load', async () => {
        // On initial load, willUpdate() detects the content property change and
        // copies it into _editContent (null → string). _getRenderedContent() then
        // uses _editContent (the synced value) to render.
        const { element, container } = await createElement({
            content: 'Initial prop content',
            isRootTab: false
        });

        // After willUpdate, _editContent holds the content prop value (not null).
        expect((element as any)._editContent).toBe('Initial prop content');

        // The rendered View tab should display the prop content.
        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
        expect(output!.textContent).toContain('Initial prop content');

        container.remove();
    });

    it('_getRenderedContent falls back to _getFullContent(false) when _editContent is null', async () => {
        // This tests the real null-sentinel fallback path introduced in the fix.
        // We construct the element, then forcibly reset _editContent to null to
        // simulate the state before willUpdate has ever fired.
        const { element, container } = await createElement({
            content: 'Fallback content',
            isRootTab: false
        });

        // Force _editContent back to null to exercise the fallback branch directly.
        (element as any)._editContent = null;

        // _getRenderedContent() should now call _getFullContent(false) which returns
        // this.content, so the rendered HTML should contain 'Fallback content'.
        const rendered: string = (element as any)._getRenderedContent();
        expect(rendered).toContain('Fallback content');

        container.remove();
    });
});

// ─── Fix 3: _editContent without @state() - no extra render per keystroke ─────

describe('Fix 3: _editContent update does not trigger render()', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('changing _editContent via codemirror change event does not trigger LitElement re-render', async () => {
        const { element, container } = await createElement({
            content: 'Original content'
        });

        // Switch to Write tab (this does trigger a render via _activeTab @state change)
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;
        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];

        // Spy on render by tracking updateComplete promise resolution counts
        // If @state() is removed from _editContent, calling the change callback
        // should NOT schedule a new LitElement update.
        const updateCount = 0;
        const originalUpdateComplete = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(element),
            'updateComplete'
        );

        // Track via requestUpdate spy - if _editContent has @state, requestUpdate
        // will be called on every change. Without @state, it won't be.
        const requestUpdateSpy = vi.spyOn(element as any, 'requestUpdate');

        // Simulate multiple keystrokes (change callback fires multiple times)
        instance._currentValue = 'a';
        if (instance._changeCallback) instance._changeCallback();
        instance._currentValue = 'ab';
        if (instance._changeCallback) instance._changeCallback();
        instance._currentValue = 'abc';
        if (instance._changeCallback) instance._changeCallback();

        // Without @state(), requestUpdate should NOT be called from the change handler
        // (It only gets called when @state properties change)
        expect(requestUpdateSpy).not.toHaveBeenCalled();

        void updateCount; // suppress unused warning
        void originalUpdateComplete;

        container.remove();
    });
});
