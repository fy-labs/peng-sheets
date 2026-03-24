import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Mock ResizeObserver for jsdom
beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

// EasyMDE mock — stores options so imageUploadFunction is accessible
vi.mock('easymde', () => {
    const EasyMDE = vi.fn().mockImplementation(function (this: any, options: any) {
        this._options = options;
        this.options = options;
        this.codemirror = {
            on: vi.fn(),
            setOption: vi.fn()
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

describe('SpreadsheetDocumentView image saving', () => {
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

        // Import the component
        await import('../../../components/spreadsheet-document-view.js');

        // Create container and element
        container = document.createElement('div');
        document.body.appendChild(container);

        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).title = 'Test Doc';
        (element as any).content = '# Hello';
        (element as any).sectionIndex = 0;
        container.appendChild(element);

        // Wait for component to initialize
        await (element as any).updateComplete;
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('should dispatch saveImage action and handle imageSaved response', async () => {
        let dispatchedEvent: CustomEvent | null = null;
        element.addEventListener('toolbar-action', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.action === 'saveImage') {
                dispatchedEvent = ce;
            }
        });

        // Enter write mode via Write tab
        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLElement;
        if (!writeTab) {
            console.error('Write tab not found! Full HTML:', element.outerHTML);
        }
        writeTab.click();
        await (element as any).updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await (element as any).updateComplete;

        // Since EasyMDE is initialized, access it via the private property
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        // Extract the imageUploadFunction from options
        const options = easymde.options;
        expect(typeof options.imageUploadFunction).toBe('function');

        // Create a mock file
        const file = new File(['fake image data'], 'test.png', { type: 'image/png' });
        // Mock arrayBuffer for JSDOM
        file.arrayBuffer = async () => new TextEncoder().encode('fake image data').buffer;

        let successUrl = '';
        let errorMsg = '';
        const onSuccess = (url: string) => {
            successUrl = url;
        };
        const onError = (msg: string) => {
            errorMsg = msg;
        };

        // Call the upload function
        try {
            await options.imageUploadFunction(file, onSuccess, onError);
        } catch (e) {
            console.error('imageUploadFunction threw:', e);
        }
        console.log('errorMsg:', errorMsg);

        // Wait a tiny bit for the Promise to resolve
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify dispatch
        expect(dispatchedEvent).toBeTruthy();
        const detail = (dispatchedEvent as CustomEvent).detail;
        expect(detail.fileName).toBe('test.png');
        expect(detail.messageId).toBeTruthy();

        // Now simulate the extension host responding with imageSaved
        const responseEvent = new CustomEvent('imageSaved', {
            detail: {
                messageId: detail.messageId,
                success: true,
                url: './images/test.png'
            }
        });
        window.dispatchEvent(responseEvent);

        expect(successUrl).toBe('./images/test.png');
        expect(errorMsg).toBe('');
    });
});
