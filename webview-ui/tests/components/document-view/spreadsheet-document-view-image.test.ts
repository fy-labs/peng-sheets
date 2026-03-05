import { expect, fixture, html } from '@open-wc/testing';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { SpreadsheetDocumentView } from '../../../components/spreadsheet-document-view';
import * as sinon from 'sinon';


describe('SpreadsheetDocumentView image saving', () => {
    let container: HTMLElement;
    let element: HTMLElement;

    beforeEach(async () => {
        // Mock getBoundingClientRect for JSDOM and CodeMirror
        Range.prototype.getBoundingClientRect = () => ({
            bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
            toJSON() { return this; }
        });

        Range.prototype.getClientRects = () => {
            return { length: 0, item: () => null, [Symbol.iterator]: function* () { } } as unknown as DOMRectList;
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
        sinon.restore();
    });

    it('should dispatch saveImage action and handle imageSaved response', async () => {
        let dispatchedEvent: CustomEvent | null = null;
        element.addEventListener('toolbar-action', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.action === 'saveImage') {
                dispatchedEvent = ce;
            }
        });

        // Enter edit mode
        const outputDiv = element.querySelector('.output') as HTMLElement;
        if (!outputDiv) {
            console.error("outputDiv not found! Full HTML:", element.outerHTML);
        }
        outputDiv.click();
        await (element as any).updateComplete;

        // Since EasyMDE is initialized, we can access it via the protected/private property using any cast
        const easymde = (element as any)._easymde;
        expect(easymde).to.exist;

        // Extract the imageUploadFunction from options
        const options = easymde.options;
        expect(options.imageUploadFunction).to.be.a('function');

        // Create a mock file
        const file = new File(['fake image data'], 'test.png', { type: 'image/png' });
        // Mock arrayBuffer for JSDOM
        file.arrayBuffer = async () => new TextEncoder().encode('fake image data').buffer;

        let successUrl = '';
        let errorMsg = '';
        const onSuccess = (url: string) => { successUrl = url; };
        const onError = (msg: string) => { errorMsg = msg; };

        // Call the upload function
        try {
            await options.imageUploadFunction(file, onSuccess, onError);
        } catch (e) {
            console.error("imageUploadFunction threw:", e);
        }
        console.log("errorMsg:", errorMsg);

        // Wait a tiny bit for the Promise to resolve
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify dispatch
        expect(dispatchedEvent).to.exist;
        const detail = dispatchedEvent!.detail;
        expect(detail.fileName).to.equal('test.png');
        expect(detail.messageId).to.exist;

        // Now simulate the extension host responding with imageSaved
        const responseEvent = new CustomEvent('imageSaved', {
            detail: {
                messageId: detail.messageId,
                success: true,
                url: './images/test.png'
            }
        });
        window.dispatchEvent(responseEvent);

        expect(successUrl).to.equal('./images/test.png');
        expect(errorMsg).to.equal('');
    });
});
