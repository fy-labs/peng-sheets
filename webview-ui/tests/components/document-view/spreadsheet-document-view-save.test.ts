import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the document-change event dispatch mechanism
describe('SpreadsheetDocumentView save functionality', () => {
    let element: HTMLElement;
    let container: HTMLElement;

    beforeEach(async () => {
        // Import the component
        await import('../../../components/spreadsheet-document-view.js');

        // Create container and element
        container = document.createElement('div');
        document.body.appendChild(container);

        element = document.createElement('spreadsheet-document-view') as HTMLElement;
        (element as any).content = '# Test Content\n\nSome text';
        (element as any).sectionIndex = 0;
        container.appendChild(element);

        // Wait for component to initialize
        await (element as any).updateComplete;
    });

    afterEach(() => {
        container.remove();
    });

    it('should dispatch document-change event when content is edited and blur occurs', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        // Get shadow root
        const shadowRoot = element.shadowRoot;
        expect(shadowRoot).toBeTruthy();

        // Find and click the output div to enter edit mode
        const outputDiv = shadowRoot!.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();

        // Wait for edit mode to activate
        await (element as any).updateComplete;

        // Find the textarea
        const textarea = shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();

        // Modify the content
        textarea.value = '# Modified Content\n\nNew text';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Trigger blur to save
        textarea.dispatchEvent(new FocusEvent('blur'));

        // Wait for debounce timer (100ms + buffer)
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Verify event was dispatched
        expect(eventSpy).toHaveBeenCalled();
        // Event includes both content (body) and title
        expect(eventSpy.mock.calls[0][0].detail.sectionIndex).toEqual(0);
        expect(eventSpy.mock.calls[0][0].detail.content).toEqual('New text');
        expect(eventSpy.mock.calls[0][0].detail.title).toEqual('Modified Content');
    });

    it('should NOT dispatch document-change event if content is unchanged', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const shadowRoot = element.shadowRoot;
        const outputDiv = shadowRoot!.querySelector('.output') as HTMLElement;
        outputDiv.click();

        await (element as any).updateComplete;

        const textarea = shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;

        // Blur without changing content
        textarea.dispatchEvent(new FocusEvent('blur'));

        await new Promise((resolve) => setTimeout(resolve, 150));

        // Event should NOT be dispatched
        expect(eventSpy).not.toHaveBeenCalled();
    });

    it('should cancel edit and NOT save when Escape is pressed', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const shadowRoot = element.shadowRoot;
        const outputDiv = shadowRoot!.querySelector('.output') as HTMLElement;
        outputDiv.click();

        await (element as any).updateComplete;

        const textarea = shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;

        // Change content
        textarea.value = '# Modified Content';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Press Escape
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        await (element as any).updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Event should NOT be dispatched
        expect(eventSpy).not.toHaveBeenCalled();

        // Should be back in view mode
        const outputDivAfter = shadowRoot!.querySelector('.output');
        expect(outputDivAfter).toBeTruthy();
    });
    it('should set save: true in document-change when Save button is clicked, ignoring subsequent blur', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const shadowRoot = element.shadowRoot;
        (shadowRoot!.querySelector('.output') as HTMLElement).click();
        await (element as any).updateComplete;

        const textarea = shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
        const saveButton = shadowRoot!.querySelector('.save-button') as HTMLElement;

        // Change content
        textarea.value = '# Changed\n\nContent';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Click Save (this calls _exitEditMode(true))
        saveButton.click();

        // Simulate blur that happens when element is removed or focus changes
        textarea.dispatchEvent(new FocusEvent('blur'));

        // Wait for debounce
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(eventSpy).toHaveBeenCalledTimes(1);
        const detail = eventSpy.mock.calls[0][0].detail;
        expect(detail.content).toContain('Content');
        expect(detail.save).toBe(true);
    });
});
