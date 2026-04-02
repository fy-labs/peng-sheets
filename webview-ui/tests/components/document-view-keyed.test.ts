/**
 * Tests to verify that the keyed() directive fix for Write-mode forced switch
 * works correctly at the component level.
 *
 * After the keyed() fix:
 * - The willUpdate echo-back guard is REMOVED
 * - Changing content prop while in Write mode does NOT force-switch to View mode
 *   (because keyed() recreates the component on tab switch, so this scenario
 *   is only triggered by genuine external updates, which the component now ignores)
 * - _editContent is initialized from content prop on first Write mode entry
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import '../../components/spreadsheet-document-view';
import { SpreadsheetDocumentView } from '../../components/spreadsheet-document-view';

beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

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

describe('keyed() fix: Write mode is not forcibly reset by prop changes', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('changing content prop while in Write mode does NOT switch to view mode', async () => {
        const { element, container } = await createElement({ content: 'Original content' });
        const instance = await switchToWriteTab(element);

        // User edits in Write mode
        instance._currentValue = 'Modified content';
        instance._changeCallback?.();

        // Even if content prop is changed from outside, Write mode is preserved
        // (with keyed(), this scenario should not occur from tab switches,
        // but we verify the guard is gone and no forced switch happens)
        element.content = 'Some other content';
        await element.updateComplete;

        expect((element as any)._activeTab).toBe('write');

        container.remove();
    });

    it('EasyMDE initialValue is set from content prop on first Write mode entry', async () => {
        const { element, container } = await createElement({ content: 'Hello from prop' });

        const EasyMDEModule = await import('easymde');
        const EasyMDE = (EasyMDEModule as any).default;

        const tabs = element.querySelectorAll('.sdv-tab');
        (tabs[1] as HTMLButtonElement).click();
        await element.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await element.updateComplete;

        const instance = EasyMDE.mock.instances[EasyMDE.mock.instances.length - 1];
        expect(instance._options.initialValue).toBe('Hello from prop');

        container.remove();
    });
});
