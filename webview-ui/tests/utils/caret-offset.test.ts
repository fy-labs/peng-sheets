/**
 * Round-trip tests for getCaretOffsetInElement / setCaretAtOffset.
 *
 * Verifies that setting a caret to offset N and then reading it back
 * returns N, for various DOM structures (plain text, BR, ZWS mixed).
 */
import { describe, it, expect, vi } from 'vitest';
import { getCaretOffsetInElement, setCaretAtOffset } from '../../utils/spreadsheet-helpers';

/**
 * Create a DOM element with the given innerHTML.
 * Uses an actual HTMLDivElement so Range/Selection APIs are available in jsdom.
 */
function makeElement(innerHTML: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = innerHTML;
    return el;
}

/**
 * Build a mock Selection that wraps the given Range.
 */
function makeSelectionFromRange(range: Range): Selection {
    return {
        rangeCount: 1,
        getRangeAt: (_i: number) => range,
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
        anchorNode: range.startContainer,
        anchorOffset: range.startOffset,
        focusNode: range.endContainer,
        focusOffset: range.endOffset,
        isCollapsed: true
    } as unknown as Selection;
}

/**
 * Helper: position a DOM range at the given offset into a text node
 * (for building mock selections that simulate a real browser caret).
 */
function buildRangeAt(el: HTMLElement, textNodeIndex: number, charOffset: number): Range {
    const range = document.createRange();
    const textNodes: Text[] = [];
    function collectText(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node as Text);
        } else {
            for (const child of node.childNodes) collectText(child);
        }
    }
    collectText(el);
    const textNode = textNodes[textNodeIndex];
    if (textNode) {
        range.setStart(textNode, charOffset);
        range.collapse(true);
    } else {
        range.setStart(el, 0);
        range.collapse(true);
    }
    return range;
}

describe('getCaretOffsetInElement', () => {
    it('plain text: offset 0 maps to start of text node', () => {
        const el = makeElement('ABCDE');
        const range = buildRangeAt(el, 0, 0);
        const sel = makeSelectionFromRange(range);
        expect(getCaretOffsetInElement(el, sel).start).toBe(0);
    });

    it('plain text: offset in the middle', () => {
        const el = makeElement('ABCDE');
        const range = buildRangeAt(el, 0, 3);
        const sel = makeSelectionFromRange(range);
        expect(getCaretOffsetInElement(el, sel).start).toBe(3);
    });

    it('plain text: offset at end', () => {
        const el = makeElement('ABCDE');
        const range = buildRangeAt(el, 0, 5);
        const sel = makeSelectionFromRange(range);
        expect(getCaretOffsetInElement(el, sel).start).toBe(5);
    });

    it('ZWS is counted as 0 characters', () => {
        // "AB\u200BC" — ZWS between B and C
        const el = makeElement('AB\u200BC');
        // The text node is "AB\u200BC". Dom offset 3 = after ZWS = string offset 2 (ZWS not counted)
        const range = buildRangeAt(el, 0, 3);
        const sel = makeSelectionFromRange(range);
        // "A"(0), "B"(1), ZWS at dom 2 (not counted), "C" at dom 3
        // dom offset 3 means "just before C" => string offset 2 (A=0->1, B=1->2, ZWS ignored)
        expect(getCaretOffsetInElement(el, sel).start).toBe(2);
    });

    it('BR counts as 1 character (\\n)', () => {
        // "AB<br>CD" — BR = \n = 1 char, so "AB\nCD" is 5 string chars
        const el = makeElement('AB<br>CD');
        // Text nodes: [0]="AB", [1]="CD"
        // dom offset 1 in text node 1 ("CD") = 1 char into "CD"
        // Before that: "AB"(2) + BR(1) = 3, plus 1 more = offset 4
        const range = buildRangeAt(el, 1, 1);
        const sel = makeSelectionFromRange(range);
        expect(getCaretOffsetInElement(el, sel).start).toBe(4);
    });

    it('BR + ZWS: offset after ZWS following BR', () => {
        // "AB<br>\u200B" — used for caret positioning after trailing BR
        // String = "AB\n" (3 chars). ZWS at end doesn't count.
        // Text nodes: [0]="AB", [1]="\u200B"
        // Position in text node [1] at offset 1 = just after ZWS = string offset 3
        const el = makeElement('AB<br>\u200B');
        const range = buildRangeAt(el, 1, 1);
        const sel = makeSelectionFromRange(range);
        // "AB"=2, BR=1, ZWS=0 => total string length=3
        expect(getCaretOffsetInElement(el, sel).start).toBe(3);
    });
});

describe('setCaretAtOffset', () => {
    it('sets caret at start of plain text', () => {
        const el = makeElement('ABCDE');
        document.body.appendChild(el);

        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn(),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 0);

        expect(mockSel.addRange).toHaveBeenCalledTimes(1);
        const range = mockSel.addRange.mock.calls[0][0] as Range;
        expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
        expect(range.startOffset).toBe(0);
        document.body.removeChild(el);
    });

    it('sets caret in the middle of plain text', () => {
        const el = makeElement('ABCDE');
        document.body.appendChild(el);

        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn(),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 3);

        expect(mockSel.addRange).toHaveBeenCalledTimes(1);
        const range = mockSel.addRange.mock.calls[0][0] as Range;
        expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
        expect(range.startOffset).toBe(3);
        document.body.removeChild(el);
    });

    it('sets caret at end of plain text', () => {
        const el = makeElement('ABCDE');
        document.body.appendChild(el);

        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn(),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 5);

        expect(mockSel.addRange).toHaveBeenCalledTimes(1);
        const range = mockSel.addRange.mock.calls[0][0] as Range;
        // Should be at end of text node or after last child
        const offset = range.startOffset;
        expect(offset).toBeGreaterThanOrEqual(4); // at least at char 4 or 5
        document.body.removeChild(el);
    });

    it('sets caret after BR (offset = chars before + 1)', () => {
        // "AB<br>CD" → string "AB\nCD"
        // Offset 3 = just after BR (start of "CD")
        const el = makeElement('AB<br>CD');
        document.body.appendChild(el);

        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn(),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 3);

        expect(mockSel.addRange).toHaveBeenCalledTimes(1);
        const range = mockSel.addRange.mock.calls[0][0] as Range;
        // Caret should be at start of the "CD" text node (offset 0)
        expect(range.startContainer.textContent).toBe('CD');
        expect(range.startOffset).toBe(0);
        document.body.removeChild(el);
    });
});

describe('round-trip: getCaretOffsetInElement ↔ setCaretAtOffset (via jsdom)', () => {
    // Helper used by round-trip tests
    function roundTrip(el: HTMLElement, offset: number): number {
        let capturedRange: Range | undefined;
        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn((r: Range) => {
                capturedRange = r;
            }),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, offset);
        if (!capturedRange) return -1;

        const readSel = {
            rangeCount: 1,
            getRangeAt: () => capturedRange!,
            anchorNode: capturedRange!.startContainer,
            anchorOffset: capturedRange!.startOffset,
            focusNode: capturedRange!.endContainer,
            focusOffset: capturedRange!.endOffset
        } as unknown as Selection;

        return getCaretOffsetInElement(el, readSel).start;
    }

    it('ZWS at end: trailing ZWS round-trips correctly', () => {
        // 'AB<br>&#x200B;' represents "AB\n" (3 string chars). ZWS is decorative.
        // Offsets 0..3 should all round-trip.
        const el = makeElement('AB<br>&#x200B;');
        document.body.appendChild(el);
        expect(roundTrip(el, 0)).toBe(0);
        expect(roundTrip(el, 2)).toBe(2);
        expect(roundTrip(el, 3)).toBe(3);
        document.body.removeChild(el);
    });

    it('ZWS in middle: mid-string ZWS round-trips correctly', () => {
        // 'A&#x200B;B' — ZWS between A and B, string has 2 visible chars "AB"
        // Offsets 0, 1, 2 should round-trip: ZWS is counted as 0 chars
        const el = makeElement('A&#x200B;B');
        document.body.appendChild(el);
        expect(roundTrip(el, 0)).toBe(0);
        expect(roundTrip(el, 1)).toBe(1);
        expect(roundTrip(el, 2)).toBe(2);
        document.body.removeChild(el);
    });

    /**
     * The full round-trip test uses window.getSelection() mock to capture what
     * setCaretAtOffset places, then feeds that range into getCaretOffsetInElement.
     */
    it('plain text: offset 0 round-trips', () => {
        const el = makeElement('ABCDE');
        document.body.appendChild(el);

        let capturedRange: Range | undefined;
        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn((r: Range) => {
                capturedRange = r;
            }),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 0);
        expect(capturedRange).toBeDefined();

        const readSel = {
            rangeCount: 1,
            getRangeAt: () => capturedRange!,
            anchorNode: capturedRange!.startContainer,
            anchorOffset: capturedRange!.startOffset,
            focusNode: capturedRange!.endContainer,
            focusOffset: capturedRange!.endOffset
        } as unknown as Selection;

        expect(getCaretOffsetInElement(el, readSel).start).toBe(0);
        document.body.removeChild(el);
    });

    it('plain text: offset 3 round-trips', () => {
        const el = makeElement('ABCDE');
        document.body.appendChild(el);

        let capturedRange: Range | undefined;
        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn((r: Range) => {
                capturedRange = r;
            }),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 3);
        expect(capturedRange).toBeDefined();

        const readSel = {
            rangeCount: 1,
            getRangeAt: () => capturedRange!,
            anchorNode: capturedRange!.startContainer,
            anchorOffset: capturedRange!.startOffset,
            focusNode: capturedRange!.endContainer,
            focusOffset: capturedRange!.endOffset
        } as unknown as Selection;

        expect(getCaretOffsetInElement(el, readSel).start).toBe(3);
        document.body.removeChild(el);
    });

    it('BR content: offset 3 (after newline) round-trips', () => {
        const el = makeElement('AB<br>CD');
        document.body.appendChild(el);

        let capturedRange: Range | undefined;
        const mockSel = {
            removeAllRanges: vi.fn(),
            addRange: vi.fn((r: Range) => {
                capturedRange = r;
            }),
            rangeCount: 0
        };
        vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

        setCaretAtOffset(el, 3);
        expect(capturedRange).toBeDefined();

        const readSel = {
            rangeCount: 1,
            getRangeAt: () => capturedRange!,
            anchorNode: capturedRange!.startContainer,
            anchorOffset: capturedRange!.startOffset,
            focusNode: capturedRange!.endContainer,
            focusOffset: capturedRange!.endOffset
        } as unknown as Selection;

        expect(getCaretOffsetInElement(el, readSel).start).toBe(3);
        document.body.removeChild(el);
    });
});
