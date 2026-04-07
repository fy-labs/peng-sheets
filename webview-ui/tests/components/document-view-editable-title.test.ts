/**
 * Tests for SpreadsheetDocumentView - Editable title in Write mode.
 *
 * Covers:
 * 1. parseHeaderPrefix utility: prefix extraction from markdown headerText
 * 2. View mode: title is read-only (.sdv-title-text shown, no input)
 * 3. Write mode: .sdv-title-input appears with title text (without prefix)
 * 4. Write mode: .sdv-title-prefix shows prefix when present
 * 5. Title input event updates internal state
 * 6. document-change event detail.title reflects edited title
 * 7. Frontmatter tab (no prefix): entire title text goes into input
 * 8. Root tab: no .sdv-title-bar rendered (regression guard)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../../components/spreadsheet-document-view';
import { SpreadsheetDocumentView, parseHeaderPrefix } from '../../components/spreadsheet-document-view';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE mock — identical to document-view-tab-ui.test.ts
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.codemirror = {
            on: vi.fn((event: string, cb: () => void) => {
                if (event === 'change') {
                    this._changeCallback = cb;
                }
            }),
            setOption: vi.fn()
        };
        this.value = vi.fn().mockReturnValue(options?.initialValue ?? '');
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

// ─── helpers ──────────────────────────────────────────────────────────────────

async function createElement(
    overrides: Partial<SpreadsheetDocumentView> = {}
): Promise<{ element: SpreadsheetDocumentView; container: HTMLDivElement }> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const element = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
    element.title = 'My Doc';
    element.content = 'Hello world';
    element.headerText = '## My Doc';
    Object.assign(element, overrides);
    container.appendChild(element);
    await element.updateComplete;
    return { element, container };
}

/** Click Write tab and wait for async EasyMDE initialization. */
async function switchToWriteTab(element: SpreadsheetDocumentView): Promise<void> {
    const tabs = element.querySelectorAll('.sdv-tab');
    (tabs[1] as HTMLButtonElement).click();
    await element.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await element.updateComplete;
}

// ─── 1. parseHeaderPrefix utility ─────────────────────────────────────────────

describe('parseHeaderPrefix - utility function', () => {
    it('should export parseHeaderPrefix as a named export', () => {
        // The function must be importable; will fail until Step 2 of the plan is implemented
        expect(typeof parseHeaderPrefix).toBe('function');
    });

    it('should parse "## Doc 1" into prefix "## " and text "Doc 1"', () => {
        // ## is the canonical doc-section prefix
        const result = parseHeaderPrefix('## Doc 1');
        expect(result.prefix).toBe('## ');
        expect(result.text).toBe('Doc 1');
    });

    it('should parse "# Title" into prefix "# " and text "Title"', () => {
        // Single # (h1) is used for root documents
        const result = parseHeaderPrefix('# Title');
        expect(result.prefix).toBe('# ');
        expect(result.text).toBe('Title');
    });

    it('should parse "### Deep Header" into prefix "### " and text "Deep Header"', () => {
        // Three hashes — ensures up to h6 depth is handled
        const result = parseHeaderPrefix('### Deep Header');
        expect(result.prefix).toBe('### ');
        expect(result.text).toBe('Deep Header');
    });

    it('should return empty prefix for plain text without # prefix', () => {
        // frontmatter tab titles have no markdown heading prefix
        const result = parseHeaderPrefix('My Title');
        expect(result.prefix).toBe('');
        expect(result.text).toBe('My Title');
    });

    it('should return empty prefix and empty text for empty string', () => {
        // Edge case: no header text set at all
        const result = parseHeaderPrefix('');
        expect(result.prefix).toBe('');
        expect(result.text).toBe('');
    });

    it('should not match "##NoSpace" (missing space after #)', () => {
        // Markdown spec: space required between # and text; no space → no prefix
        const result = parseHeaderPrefix('##NoSpace');
        expect(result.prefix).toBe('');
        expect(result.text).toBe('##NoSpace');
    });
});

// ─── 2. View mode: title is read-only ─────────────────────────────────────────

describe('SpreadsheetDocumentView - Editable Title: View mode (read-only)', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement({ headerText: '## My Doc' }));
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should render .sdv-title-text div in view mode', () => {
        // View is the default; title must be rendered as read-only text
        const titleText = element.querySelector('.sdv-title-text');
        expect(titleText).not.toBeNull();
    });

    it('should NOT render input.sdv-title-input in view mode', () => {
        // Input must not appear until the user enters Write mode
        const input = element.querySelector('input.sdv-title-input');
        expect(input).toBeNull();
    });

    it('should display the full headerText in .sdv-title-text', () => {
        // The complete header string (prefix + text) is shown in read-only mode
        const titleText = element.querySelector('.sdv-title-text') as HTMLElement;
        expect(titleText).not.toBeNull();
        expect(titleText.textContent).toBe('## My Doc');
    });
});

// ─── 3. Write mode: title is editable ─────────────────────────────────────────

describe('SpreadsheetDocumentView - Editable Title: Write mode (editable input)', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement({ headerText: '## My Doc', title: 'My Doc' }));
        await switchToWriteTab(element);
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should render input.sdv-title-input in write mode', () => {
        // Input field must appear when the user is in Write mode
        const input = element.querySelector('input.sdv-title-input');
        expect(input).not.toBeNull();
    });

    it('should NOT render .sdv-title-text in write mode', () => {
        // The read-only text div must be replaced by the input field
        const titleText = element.querySelector('.sdv-title-text');
        expect(titleText).toBeNull();
    });

    it('should set input value to the text part only (without prefix)', () => {
        // "## My Doc" → input.value should be "My Doc", not "## My Doc"
        const input = element.querySelector('input.sdv-title-input') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.value).toBe('My Doc');
    });

    it('should render .sdv-title-prefix span showing the header prefix', () => {
        // Prefix "## " must be visible but non-editable
        const prefix = element.querySelector('.sdv-title-prefix') as HTMLElement;
        expect(prefix).not.toBeNull();
        expect(prefix.textContent).toBe('## ');
    });
});

// ─── 4. Title editing updates state ───────────────────────────────────────────

describe('SpreadsheetDocumentView - Editable Title: input event updates state', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement({ headerText: '## My Doc', title: 'My Doc' }));
        await switchToWriteTab(element);
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should update the input value when the user types', async () => {
        const input = element.querySelector('input.sdv-title-input') as HTMLInputElement;
        expect(input).not.toBeNull();

        // Simulate user typing a new title
        input.value = 'New Title';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await element.updateComplete;

        // Re-query to pick up any re-render
        const updatedInput = element.querySelector('input.sdv-title-input') as HTMLInputElement;
        expect(updatedInput.value).toBe('New Title');
    });
});

// ─── 5. document-change event carries edited title ────────────────────────────

describe('SpreadsheetDocumentView - Editable Title: document-change event', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement({
            headerText: '## My Doc',
            title: 'My Doc'
            // isDocSheet defaults to false → dispatches document-change
        }));
        await switchToWriteTab(element);
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should include the edited title in document-change event detail', async () => {
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;
        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];

        // Edit the title
        const input = element.querySelector('input.sdv-title-input') as HTMLInputElement;
        expect(input).not.toBeNull();
        input.value = 'Edited Title';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await element.updateComplete;

        // Also fire a content change so _editDirty is set
        instance.value.mockReturnValue('Some body content');
        instance._changeCallback?.();

        // Capture the event
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        // Switch to view tab to trigger dirty notification
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[0] as HTMLButtonElement).click();

        expect(eventSpy).toHaveBeenCalledTimes(1);
        // detail.title must reflect the edited title text (without prefix)
        expect(eventSpy.mock.calls[0][0].detail.title).toBe('Edited Title');

        element.removeEventListener('document-change', eventSpy);
    });
});

// ─── 6. Frontmatter tab: no prefix, full title in input ───────────────────────

describe('SpreadsheetDocumentView - Editable Title: frontmatter tab (no prefix)', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        // Frontmatter tabs have a plain title with no markdown heading prefix
        ({ element, container } = await createElement({
            headerText: 'My Title',
            title: 'My Title',
            isRootTab: false
        }));
        await switchToWriteTab(element);
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should NOT render .sdv-title-prefix when there is no header prefix', () => {
        // Plain-text title has no ## prefix, so the prefix span must be absent
        const prefix = element.querySelector('.sdv-title-prefix');
        expect(prefix).toBeNull();
    });

    it('should put the full title text into the input when there is no prefix', () => {
        // With no prefix, the entire string goes into the editable input
        const input = element.querySelector('input.sdv-title-input') as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.value).toBe('My Title');
    });
});

// ─── 7. Root tab: no title bar ────────────────────────────────────────────────

describe('SpreadsheetDocumentView - Editable Title: root tab regression', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should NOT render .sdv-title-bar when isRootTab is true', async () => {
        // Root tab never shows a title bar — this must hold in both view and write mode
        const { element, container } = await createElement({
            isRootTab: true,
            headerText: '# Root',
            title: 'Root'
        });
        const titleBar = element.querySelector('.sdv-title-bar');
        expect(titleBar).toBeNull();
        container.remove();
    });

    it('should NOT render .sdv-title-bar in write mode when isRootTab is true', async () => {
        const { element, container } = await createElement({
            isRootTab: true,
            headerText: '# Root',
            title: 'Root'
        });
        await switchToWriteTab(element);

        const titleBar = element.querySelector('.sdv-title-bar');
        expect(titleBar).toBeNull();
        container.remove();
    });
});

// ─── 8. Flush on view-tab switch preserves edited title ─────────────────────

describe('SpreadsheetDocumentView - Editable Title: flush on view switch', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement({
            headerText: '## My Doc',
            title: 'My Doc'
        }));
        await switchToWriteTab(element);
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should include edited title in document-change event when switching to view tab', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // Edit the title
            const input = element.querySelector('input.sdv-title-input') as HTMLInputElement;
            expect(input).not.toBeNull();
            input.value = 'Tab Switch Title';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await element.updateComplete;

            // Capture the event
            const eventSpy = vi.fn();
            element.addEventListener('document-change', eventSpy);

            // Switch to view tab — this should flush with the edited title
            const viewTab = element.querySelector('.sdv-tab:first-child') as HTMLButtonElement;
            viewTab.click();
            await element.updateComplete;

            expect(eventSpy).toHaveBeenCalled();
            expect(eventSpy.mock.calls[0][0].detail.title).toBe('Tab Switch Title');

            element.removeEventListener('document-change', eventSpy);
        } finally {
            vi.useRealTimers();
        }
    });
});
