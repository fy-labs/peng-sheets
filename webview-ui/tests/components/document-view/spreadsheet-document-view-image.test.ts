import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { generateImageAltText } from '../../../components/spreadsheet-document-view.js';

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

        let errorMsg = '';
        const onSuccess = vi.fn();
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

        // Verify CodeMirror direct insertion is used instead of onSuccess
        const cm = (element as any)._easymde.codemirror;
        expect(cm.replaceSelection).toHaveBeenCalledOnce();
        const insertedText = (cm.replaceSelection as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(insertedText).toMatch(/^!\[.+\]\(\.\/images\/test\.png\)$/);
        expect(cm.focus).toHaveBeenCalledOnce();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(errorMsg).toBe('');
    });
});

describe('generateImageAltText', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-30T14:30:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('generates alt text from filename with timestamp suffix removed', () => {
        expect(generateImageAltText('image-1774851129595.png')).toBe('image - 2026-03-30 14:30');
    });

    it('generates alt text from simple filename', () => {
        expect(generateImageAltText('screenshot.png')).toBe('screenshot - 2026-03-30 14:30');
    });

    it('generates alt text from filename with spaces', () => {
        expect(generateImageAltText('my photo.jpg')).toBe('my photo - 2026-03-30 14:30');
    });

    it('generates alt text from filename without extension', () => {
        expect(generateImageAltText('image')).toBe('image - 2026-03-30 14:30');
    });
});

describe('image upload with direct CodeMirror insertion', () => {
    let container: HTMLElement;
    let element: HTMLElement;

    beforeEach(async () => {
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
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    it('inserts markdown with alt text via cm.replaceSelection instead of onSuccess', async () => {
        // Switch to Write tab to initialize EasyMDE
        const tabs = element.querySelectorAll('.sdv-tab');
        const writeTab = tabs[1] as HTMLElement;
        writeTab.click();
        await (element as any).updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        await (element as any).updateComplete;

        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        const options = easymde.options;
        expect(typeof options.imageUploadFunction).toBe('function');

        const file = new File(['fake image data'], 'image-1774851129595.png', { type: 'image/png' });
        file.arrayBuffer = async () => new TextEncoder().encode('fake image data').buffer;

        const onSuccess = vi.fn();
        const onError = vi.fn();

        let dispatchedMessageId = '';
        element.addEventListener('toolbar-action', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.action === 'saveImage') {
                dispatchedMessageId = ce.detail.messageId;
            }
        });

        try {
            await options.imageUploadFunction(file, onSuccess, onError);
        } catch (e) {
            // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(dispatchedMessageId).toBeTruthy();

        // Simulate extension host responding
        const responseEvent = new CustomEvent('imageSaved', {
            detail: {
                messageId: dispatchedMessageId,
                success: true,
                url: './images/image-1774851129595.png'
            }
        });
        window.dispatchEvent(responseEvent);

        const cm = easymde.codemirror;
        expect(cm.replaceSelection).toHaveBeenCalledOnce();
        // Verify format: ![<sanitized name> - <YYYY-MM-DD HH:mm>](<url>)
        const insertedText = (cm.replaceSelection as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        const expectedPattern =
            /^!\[image - \d{4}-\d{2}-\d{2} \d{2}:\d{2}\]\(\.\/images\/image-1774851129595\.png\)$/;
        expect(insertedText).toMatch(expectedPattern);
        expect(cm.focus).toHaveBeenCalledOnce();
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
