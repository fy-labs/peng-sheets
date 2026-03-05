import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the document-change event dispatch mechanism
describe('SpreadsheetDocumentView save functionality', () => {
    let element: HTMLElement;
    let container: HTMLElement;

    beforeEach(async () => {
        vi.useFakeTimers();

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
        (element as any).title = 'Test Content';
        (element as any).content = 'Some text';
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

        // The component uses Light DOM, so we query directly on element
        const outputDiv = element.querySelector('.output') as HTMLElement;
        expect(outputDiv).toBeTruthy();
        outputDiv.click();

        // Wait for edit mode to activate
        await (element as any).updateComplete;

        // Since we are using EasyMDE, there is no direct textarea dispatch for input/blur that will save
        // Instead, the exit edit mode logic uses EasyMDE's value.
        const easymde = (element as any)._easymde;
        expect(easymde).toBeTruthy();

        // Modify the content (edit mode no longer includes # title)
        easymde.value('New text');
        console.log("Called easymde.value()");

        // Instead of triggering blur, call _exitEditMode directly because tests can't simulate
        // clicking outside easily for EasyMDE structure.
        console.log("Calling _exitEditMode");
        try {
            (element as any)._exitEditMode(true);
            console.log("Successfully called _exitEditMode");
        } catch (err) {
            console.error("_exitEditMode threw error:", err);
        }

        // Wait for component to update
        await (element as any).updateComplete;

        // Verify event was dispatched
        console.log("advancing timers by 500ms");
        vi.advanceTimersByTime(500);
        console.log("eventSpy mock calls:", eventSpy.mock.calls);
        expect(eventSpy).toHaveBeenCalled();
        // Title is preserved from component property, content is from editor
        expect(eventSpy.mock.calls[0][0].detail.sectionIndex).toEqual(0);
        expect(eventSpy.mock.calls[0][0].detail.content).toEqual('New text');
        expect(eventSpy.mock.calls[0][0].detail.title).toEqual('Test Content');
    });

    it('should NOT dispatch document-change event if content is unchanged', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const outputDiv = element.querySelector('.output') as HTMLElement;
        outputDiv.click();

        await (element as any).updateComplete;

        // Exit without modifying
        (element as any)._exitEditMode(true);

        // Event should NOT be dispatched
        expect(eventSpy).not.toHaveBeenCalled();
    });

    it('should cancel edit and NOT save when Escape is pressed', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const outputDiv = element.querySelector('.output') as HTMLElement;
        outputDiv.click();

        await (element as any).updateComplete;

        const easymde = (element as any)._easymde;

        // Change content (no # title prefix)
        easymde.value('Modified Content');

        // Cancel edit mode (save=false)
        (element as any)._exitEditMode(false);

        await (element as any).updateComplete;

        // Event should NOT be dispatched
        expect(eventSpy).not.toHaveBeenCalled();

        // Should be back in view mode
        const outputDivAfter = element.querySelector('.output');
        expect(outputDivAfter).toBeTruthy();
    });
    it('should set save: true in document-change when Save button is clicked, ignoring subsequent blur', async () => {
        const eventSpy = vi.fn();
        element.addEventListener('document-change', eventSpy);

        const outputDiv = element.querySelector('.output') as HTMLElement;
        outputDiv.click();
        await (element as any).updateComplete;

        const easymde = (element as any)._easymde;
        const saveButton = element.querySelector('.save-button') as HTMLElement;

        // Change content (no # title prefix)
        easymde.value('Changed Content');

        // Click Save (this calls _exitEditMode(true))
        saveButton.click();

        console.log("advancing timers by 500ms");
        vi.advanceTimersByTime(500);

        expect(eventSpy).toHaveBeenCalledTimes(1);
        const detail = eventSpy.mock.calls[0][0].detail;
        expect(detail.content).toContain('Changed Content');
        expect(detail.save).toBe(true);
    });
});
