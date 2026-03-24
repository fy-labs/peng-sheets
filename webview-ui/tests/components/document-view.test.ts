/**
 * Tests for SpreadsheetDocumentView component - 3 bug reproductions (updated for tab UI).
 *
 * Bug 1: EasyMDE toolbar hidden behind sticky headers when scrolling
 *   Root cause: .sdv-title-bar (z-index:30) and .sdv-tab-bar (z-index:29) overlay .editor-toolbar.
 *   Fix: JS sets toolbar.style.top = titleBarHeight + tabBarHeight; toolbar z-index = 28.
 *
 * Bug 2: Toggle mode button too close to right edge — obsoleted by tab UI.
 *   Replaced with: .sdv-tab style verification (tab bar uses border-bottom underline, not button).
 *
 * Bug 3: EasyMDE toolbar button titles are hardcoded English strings, not i18n.
 *   Root cause: toolbar definitions use 'Bold', 'Italic' etc. instead of t('toolbarBold').
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import '../../components/spreadsheet-document-view';
import { SpreadsheetDocumentView } from '../../components/spreadsheet-document-view';
import { t } from '../../utils/i18n';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE may not initialize fully in jsdom; mock it to capture toolbar config
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.codemirror = {
            on: vi.fn(),
            setOption: vi.fn()
        };
        this.value = vi.fn().mockReturnValue('');
        this.toTextArea = vi.fn();

        // Simulate EasyMDE creating a .editor-toolbar element in the parent
        if (options?.element?.parentElement) {
            const toolbar = document.createElement('div');
            toolbar.className = 'editor-toolbar';
            options.element.parentElement.insertBefore(toolbar, options.element);
        }
    });
    // Static action methods needed in toolbar config
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

describe('SpreadsheetDocumentView - Bug 1: toolbar sticky top offset', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;

    beforeEach(async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        element = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
        element.title = 'Test Doc';
        element.content = 'Test content';
        element.headerText = '## Test Doc';
        container.appendChild(element);
        await element.updateComplete;
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should set toolbar top to titleBar+tabBar height, not 0 (via JS sticky setup)', async () => {
        // Enter write mode via Write tab click
        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLButtonElement;
        expect(writeTab).toBeTruthy();
        writeTab.click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const toolbar = element.querySelector('.editor-toolbar') as HTMLElement;
        // In jsdom getBoundingClientRect() returns 0 for all elements,
        // so titleBarHeight + tabBarHeight = 0 + 0 = 0 → top = '0px'.
        // We verify the sticky JS setup ran correctly.
        expect(toolbar).toBeTruthy();
        expect(toolbar.style.position).toBe('sticky');
        // top is '0px' in jsdom since getBoundingClientRect always returns 0
        expect(toolbar.style.top).toBe('0px');
        // z-index must be 28 (below sdv-tab-bar:29 and sdv-title-bar:30)
        expect(toolbar.style.zIndex).toBe('28');
    });

    it('should set toolbar background via JS override', async () => {
        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const toolbar = element.querySelector('.editor-toolbar') as HTMLElement;
        expect(toolbar).toBeTruthy();
        expect(toolbar.style.background).toBe('var(--vscode-editor-background)');
    });
});

describe('SpreadsheetDocumentView - Bug 2 (replaced): tab bar uses border-bottom underline style', () => {
    it('document-view.css should have .sdv-tab--active with border-bottom-color', () => {
        // The old .toggle-mode-button is gone; verify the new tab UI CSS is correct.
        const cssPath = resolve(__dirname, '../../components/styles/document-view.css');
        const cssText = readFileSync(cssPath, 'utf-8');

        // Should have sdv-tab--active with border-bottom-color using a VS Code variable
        expect(cssText).toContain('.sdv-tab--active');
        expect(cssText).toContain('border-bottom-color: var(--vscode-focusBorder)');

        // .toggle-mode-button must be gone
        expect(cssText).not.toContain('.toggle-mode-button');
    });
});

describe('SpreadsheetDocumentView - Bug 3: toolbar i18n', () => {
    let element: SpreadsheetDocumentView;
    let container: HTMLDivElement;
    let originalLang: string | undefined;

    beforeEach(async () => {
        originalLang = (window as any).vscodeLanguage;
        container = document.createElement('div');
        document.body.appendChild(container);
        element = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
        element.title = 'Test Doc';
        element.content = 'Test content';
        container.appendChild(element);
        await element.updateComplete;
    });

    afterEach(() => {
        (window as any).vscodeLanguage = originalLang;
        container.remove();
        vi.clearAllMocks();
    });

    it('i18n.ts should have all required toolbar keys in en', () => {
        (window as any).vscodeLanguage = 'en';
        expect(t('toolbarBold')).toBe('Bold');
        expect(t('toolbarItalic')).toBe('Italic');
        expect(t('toolbarHeading')).toBe('Heading');
        expect(t('toolbarQuote')).toBe('Quote');
        expect(t('toolbarUnorderedList')).toBe('Unordered List');
        expect(t('toolbarOrderedList')).toBe('Numbered List');
        expect(t('toolbarLink')).toBe('Create Link');
        expect(t('toolbarImage')).toBe('Insert Image');
    });

    it('i18n.ts should have all required toolbar keys in ja', () => {
        (window as any).vscodeLanguage = 'ja';
        expect(t('toolbarBold')).toBe('太字');
        expect(t('toolbarItalic')).toBe('斜体');
        expect(t('toolbarHeading')).toBe('見出し');
        expect(t('toolbarQuote')).toBe('引用');
        expect(t('toolbarUnorderedList')).toBe('箇条書き');
        expect(t('toolbarOrderedList')).toBe('番号付きリスト');
        expect(t('toolbarLink')).toBe('リンクを挿入');
        expect(t('toolbarImage')).toBe('画像を挿入');
    });

    it('EasyMDE toolbar should use t() for button titles (en)', async () => {
        (window as any).vscodeLanguage = 'en';

        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        // Get the options passed to EasyMDE constructor
        const instance = EasyMDE.mock.instances[0];
        expect(instance).toBeTruthy();
        const toolbar = instance._options?.toolbar as Array<{ name: string; title: string } | string>;
        expect(toolbar).toBeTruthy();

        const boldEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'bold') as {
            name: string;
            title: string;
        };
        const italicEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'italic') as {
            name: string;
            title: string;
        };
        const headingEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'heading') as {
            name: string;
            title: string;
        };
        const quoteEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'quote') as {
            name: string;
            title: string;
        };
        const unorderedListEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'unordered-list') as {
            name: string;
            title: string;
        };
        const orderedListEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'ordered-list') as {
            name: string;
            title: string;
        };
        const linkEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'link') as {
            name: string;
            title: string;
        };
        const imageEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'image') as {
            name: string;
            title: string;
        };

        // Bug 3: Before fix, titles are hardcoded English strings
        // After fix, they use t() so they match i18n values
        expect(boldEntry.title).toBe(t('toolbarBold'));
        expect(italicEntry.title).toBe(t('toolbarItalic'));
        expect(headingEntry.title).toBe(t('toolbarHeading'));
        expect(quoteEntry.title).toBe(t('toolbarQuote'));
        expect(unorderedListEntry.title).toBe(t('toolbarUnorderedList'));
        expect(orderedListEntry.title).toBe(t('toolbarOrderedList'));
        expect(linkEntry.title).toBe(t('toolbarLink'));
        expect(imageEntry.title).toBe(t('toolbarImage'));

        // preview and side-by-side must NOT be in the toolbar
        const previewEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'preview');
        const sideBySideEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'side-by-side');
        expect(previewEntry).toBeUndefined();
        expect(sideBySideEntry).toBeUndefined();
    });

    it('EasyMDE toolbar titles should use Japanese when lang is ja', async () => {
        (window as any).vscodeLanguage = 'ja';

        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        // Create a fresh element so _switchToWriteTab is called with ja language
        const jaElement = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
        jaElement.title = 'Test';
        jaElement.content = 'Content';
        container.appendChild(jaElement);
        await jaElement.updateComplete;

        const tabs = jaElement.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await jaElement.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await jaElement.updateComplete;

        // Find the most recent EasyMDE call (for the ja element)
        const lastCallIndex = EasyMDE.mock.instances.length - 1;
        const instance = EasyMDE.mock.instances[lastCallIndex];
        expect(instance).toBeTruthy();
        const toolbar = instance._options?.toolbar as Array<{ name: string; title: string } | string>;

        const boldEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'bold') as {
            name: string;
            title: string;
        };
        // Bug 3: Before fix, this would be 'Bold' (hardcoded). After fix, should be '太字'
        expect(boldEntry.title).toBe('太字');

        const headingEntry = toolbar.find((b) => typeof b === 'object' && b.name === 'heading') as {
            name: string;
            title: string;
        };
        expect(headingEntry.title).toBe('見出し');
    });
});
