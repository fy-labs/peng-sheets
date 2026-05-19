/**
 * TDD tests for Task 2: Remove obsolete 'click to edit' hint from document view.
 *
 * The 'Click to edit...' hint in _getRenderedContent() points to a feature that
 * was reverted. The View/Write tab UI now provides the editing affordance, so
 * showing a stale hint is misleading. These tests verify the empty state renders
 * no hint text.
 *
 * Test a: View tab with empty content renders empty output (no hint text).
 * Test b: View tab with non-empty content still renders content.
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

// EasyMDE mock
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

async function createElement(overrides: Partial<SpreadsheetDocumentView> = {}): Promise<{
    element: SpreadsheetDocumentView;
    container: HTMLDivElement;
}> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const element = document.createElement('spreadsheet-document-view') as SpreadsheetDocumentView;
    element.title = '';
    element.content = '';
    element.headerText = '';
    Object.assign(element, overrides);
    container.appendChild(element);
    await element.updateComplete;
    return { element, container };
}

describe('Task 2: empty state renders no hint text', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('a. View tab with empty content and isRootTab=true renders empty output', async () => {
        // content='', headerText='', isRootTab=true
        // _getRenderedContent() currently returns <p><em>Click to edit...</em></p>
        // After fix: should return '' so .output is empty.
        const { element, container } = await createElement({
            content: '',
            headerText: '',
            isRootTab: true
        });

        // _editContent is null (Write mode not entered), so _getRenderedContent falls
        // back to _getFullContent(false) which returns content='' for isRootTab=true.
        // fullContent.trim() === '' triggers the hint branch.
        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
        // After fix: textContent should be empty (no hint text).
        expect(output!.textContent!.trim()).toBe('');

        container.remove();
    });

    it('b. View tab with non-empty content renders the content (not empty)', async () => {
        // When content is non-empty, the empty-state branch is not reached.
        const { element, container } = await createElement({
            content: 'Hello World',
            headerText: '',
            isRootTab: true
        });

        const output = element.querySelector('.output');
        expect(output).toBeTruthy();
        expect(output!.textContent).toContain('Hello World');

        container.remove();
    });
});
