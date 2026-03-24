/**
 * Tests for SpreadsheetDocumentView - GitHub Wiki style tab UI.
 *
 * Covers:
 * 1. Tab display: .sdv-tab-bar exists, View tab has aria-selected="true" by default
 * 2. Tab switching: clicking Write tab sets _activeTab to 'write', EasyMDE is initialized
 * 3. Title bar: .sdv-title-bar shown when headerText is set, hidden for isRootTab
 * 4. View mode rendering: no h1 title in .output (body-only rendering)
 * 5. Write mode: EasyMDE constructor is called
 * 6. i18n: tab labels localized in ja
 * 7. Escape key: pressing Escape in Write mode switches back to View tab
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

// EasyMDE mock — same pattern as document-view.test.ts
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.codemirror = {
            on: vi.fn(),
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

async function createElement(overrides: Partial<SpreadsheetDocumentView> = {}): Promise<{
    element: SpreadsheetDocumentView;
    container: HTMLDivElement;
}> {
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

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SpreadsheetDocumentView - Tab UI: initial state', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement());
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should render .sdv-tab-bar with two tab buttons', () => {
        const tabBar = element.querySelector('.sdv-tab-bar');
        expect(tabBar).toBeTruthy();
        const tabs = element.querySelectorAll('.sdv-tab');
        expect(tabs.length).toBe(2);
    });

    it('should have View tab with aria-selected="true" by default', () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        const viewTab = tabs[0] as HTMLButtonElement;
        expect(viewTab.getAttribute('aria-selected')).toBe('true');
        expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    });

    it('should have View tab with sdv-tab--active class', () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        expect(tabs[0].classList.contains('sdv-tab--active')).toBe(true);
        expect(tabs[1].classList.contains('sdv-tab--active')).toBe(false);
    });

    it('should display .sdv-title-bar when headerText is set', () => {
        const titleBar = element.querySelector('.sdv-title-bar');
        expect(titleBar).toBeTruthy();
    });

    it('should show .output in view mode', () => {
        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
    });

    it('should NOT show .edit-container in view mode', () => {
        const editContainer = element.querySelector('.edit-container');
        expect(editContainer).toBeNull();
    });
});

describe('SpreadsheetDocumentView - Tab UI: title bar visibility', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should hide .sdv-title-bar when isRootTab is true', async () => {
        const { element, container } = await createElement({ isRootTab: true });
        const titleBar = element.querySelector('.sdv-title-bar');
        expect(titleBar).toBeNull();
        container.remove();
    });

    it('should show .sdv-title-bar when headerText is provided and isRootTab is false', async () => {
        const { element, container } = await createElement({ headerText: '## Test', isRootTab: false });
        const titleBar = element.querySelector('.sdv-title-bar');
        expect(titleBar).toBeTruthy();
        container.remove();
    });
});

describe('SpreadsheetDocumentView - Tab UI: tab switching', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement());
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should switch to Write tab on Write tab click', async () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLButtonElement;
        writeTab.click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        expect(writeTab.getAttribute('aria-selected')).toBe('true');
        expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    });

    it('should initialize EasyMDE when switching to Write tab', async () => {
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLButtonElement;
        writeTab.click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        expect(EasyMDE).toHaveBeenCalled();
    });

    it('should show .edit-container after switching to Write tab', async () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const editContainer = element.querySelector('.edit-container');
        expect(editContainer).toBeTruthy();
    });

    it('should switch back to View tab when View tab is clicked from Write', async () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        // Go to Write
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // Re-query tabs after re-render
        const tabsAfter = element.querySelectorAll('.sdv-tab');
        (tabsAfter[0] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const tabsFinal = element.querySelectorAll('.sdv-tab');
        expect(tabsFinal[0].getAttribute('aria-selected')).toBe('true');
        expect(tabsFinal[1].getAttribute('aria-selected')).toBe('false');
    });

    it('should call EasyMDE.toTextArea() when switching from Write to View', async () => {
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        // Go to Write
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];

        // Switch back to View
        const tabsAfter = element.querySelectorAll('.sdv-tab');
        (tabsAfter[0] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        expect(instance.toTextArea).toHaveBeenCalled();
    });
});

describe('SpreadsheetDocumentView - Tab UI: View mode rendering', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should NOT render h1 in .output when isRootTab is false', async () => {
        const { element, container } = await createElement({
            title: 'My Section',
            content: 'Body text only',
            isRootTab: false
        });

        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
        // Should not contain h1 from _getFullContent() with includeHeader=true
        expect(output!.querySelector('h1')).toBeNull();
        container.remove();
    });

    it('should render body content in .output', async () => {
        const { element, container } = await createElement({
            title: 'My Section',
            content: 'Hello world content',
            isRootTab: false
        });

        const output = element.querySelector('.output');
        expect(output!.textContent).toContain('Hello world content');
        container.remove();
    });
});

describe('SpreadsheetDocumentView - Tab UI: Escape key', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        ({ element, container } = await createElement());
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should switch to View tab when Escape is pressed in Write mode', async () => {
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        // Switch to Write
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // Get the EasyMDE instance and invoke the Esc key handler
        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];
        const extraKeys = instance.codemirror.setOption.mock.calls.find((call: any[]) => call[0] === 'extraKeys');
        expect(extraKeys).toBeTruthy();
        const escHandler = extraKeys[1].Esc;
        expect(escHandler).toBeInstanceOf(Function);

        // Call the Esc handler
        escHandler();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // Should be back in View tab
        const tabsFinal = element.querySelectorAll('.sdv-tab');
        expect(tabsFinal[0].getAttribute('aria-selected')).toBe('true');
        expect(tabsFinal[1].getAttribute('aria-selected')).toBe('false');
    });
});

describe('SpreadsheetDocumentView - Tab UI: EasyMDE toolbar entries', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should NOT include "preview" in EasyMDE toolbar', async () => {
        const { element, container } = await createElement();
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];
        const toolbar = instance._options?.toolbar as Array<{ name: string } | string>;
        const hasPreview = toolbar.some((b) => typeof b === 'object' && b.name === 'preview');
        expect(hasPreview).toBe(false);
        container.remove();
    });

    it('should NOT include "side-by-side" in EasyMDE toolbar', async () => {
        const { element, container } = await createElement();
        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];
        const toolbar = instance._options?.toolbar as Array<{ name: string } | string>;
        const hasSideBySide = toolbar.some((b) => typeof b === 'object' && b.name === 'side-by-side');
        expect(hasSideBySide).toBe(false);
        container.remove();
    });
});

describe('SpreadsheetDocumentView - Tab UI: i18n tab labels', () => {
    let originalLang: string | undefined;

    beforeEach(() => {
        originalLang = (window as any).vscodeLanguage;
    });

    afterEach(() => {
        (window as any).vscodeLanguage = originalLang;
        vi.clearAllMocks();
    });

    it('should display "View" and "Write" tab labels in English', async () => {
        (window as any).vscodeLanguage = 'en';
        const { element, container } = await createElement();
        const tabs = element.querySelectorAll('.sdv-tab');
        expect(tabs[0].textContent?.trim()).toBe('View');
        expect(tabs[1].textContent?.trim()).toBe('Write');
        container.remove();
    });

    it('should display "表示" and "編集" tab labels in Japanese', async () => {
        (window as any).vscodeLanguage = 'ja';
        const { element, container } = await createElement();
        const tabs = element.querySelectorAll('.sdv-tab');
        expect(tabs[0].textContent?.trim()).toBe('表示');
        expect(tabs[1].textContent?.trim()).toBe('編集');
        container.remove();
    });
});

describe('SpreadsheetDocumentView - Tab UI: sticky structure', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('.sdv-title-bar should have position:sticky in CSS', async () => {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        const cssPath = resolve(__dirname, '../../components/styles/document-view.css');
        const cssText = readFileSync(cssPath, 'utf-8');
        expect(cssText).toContain('.sdv-title-bar');
        expect(cssText).toMatch(/\.sdv-title-bar\s*\{[^}]*position\s*:\s*sticky/s);
    });

    it('.sdv-tab-bar should have position:sticky in CSS', async () => {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        const cssPath = resolve(__dirname, '../../components/styles/document-view.css');
        const cssText = readFileSync(cssPath, 'utf-8');
        expect(cssText).toContain('.sdv-tab-bar');
        expect(cssText).toMatch(/\.sdv-tab-bar\s*\{[^}]*position\s*:\s*sticky/s);
    });

    it('Write mode toolbar should get sticky position via JS', async () => {
        const { element, container } = await createElement();

        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const toolbar = element.querySelector('.editor-toolbar') as HTMLElement;
        expect(toolbar).toBeTruthy();
        expect(toolbar.style.position).toBe('sticky');
        expect(toolbar.style.zIndex).toBe('28');
        container.remove();
    });
});
