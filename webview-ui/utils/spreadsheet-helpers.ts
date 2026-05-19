import { marked } from 'marked';

/**
 * Spreadsheet utility functions for HTML/DOM manipulation and formatting.
 * Extracted from SpreadsheetTable for better organization and testability.
 */

import type { NumberFormat } from '../types/metadata';

export type { NumberFormat };

/**
 * Convert text to HTML suitable for contenteditable editing.
 * Escapes special characters and converts newlines to <br> tags.
 */
export function getEditingHtml(text: string): string {
    if (!text) return '';
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    // Convert \n to <br> for contenteditable - browsers handle BR better for Backspace
    escaped = escaped.replace(/\n/g, '<br>');
    // Add zero-width space after trailing BR for caret positioning
    if (escaped.endsWith('<br>')) {
        escaped += '\u200B';
    }
    return escaped;
}

/**
 * Extract plain text from a DOM node, handling BR and block elements.
 * Used to convert contenteditable HTML back to plain text.
 */
export function getDOMText(node: Node, isRoot = false): string {
    // Handle BR specifically
    if (node.nodeName === 'BR') {
        return '\n';
    }

    // Handle text nodes - strip zero-width space used for caret positioning
    if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent || '';
        // Remove zero-width spaces that were added for caret positioning
        return content.replace(/\u200B/g, '');
    }

    const isBlock = ['DIV', 'P', 'LI'].includes(node.nodeName);
    let text = '';

    node.childNodes.forEach((child) => {
        text += getDOMText(child);
    });

    // Block elements often imply a newline if they are not the last child
    // If isRoot is true, we ignore this check because the root container shouldn't add a newline
    if (!isRoot && isBlock) {
        const hasNextSibling = !!node.nextSibling;
        if (hasNextSibling) {
            return text + '\n';
        }
    }
    return text;
}

/**
 * Walk `target`'s child nodes and compute the string-level offset at which
 * `node` (a descendant of `target`) sits, using the same rules as `getDOMText`:
 *   - Text nodes: every character counts, except U+200B (zero-width space) = 0 chars
 *   - BR nodes: count as 1 character (\n)
 *
 * Returns the cumulative character count up to (but not including) `offsetInNode`
 * characters into `node`.  Returns -1 when `node` is not found inside `target`.
 */
function _domOffsetToStringOffset(target: HTMLElement, node: Node, offsetInNode: number): number {
    let count = 0;

    function walk(current: Node): boolean {
        if (current === node) {
            // We reached the exact node. Add offsetInNode characters.
            if (current.nodeType === Node.TEXT_NODE) {
                // Each char counts except ZWS
                const text = current.textContent || '';
                let chars = 0;
                for (let i = 0; i < offsetInNode; i++) {
                    if (text[i] !== '\u200B') {
                        chars++;
                    }
                }
                count += chars;
            }
            // For element nodes used as boundary (e.g. offset = 0 inside BR parent), nothing to add.
            return true; // found
        }

        if (current.nodeName === 'BR') {
            count += 1; // BR = \n = 1 char
            return false;
        }

        if (current.nodeType === Node.TEXT_NODE) {
            const text = current.textContent || '';
            for (const ch of text) {
                if (ch !== '\u200B') count++;
            }
            return false;
        }

        // Element node: recurse into children
        for (const child of current.childNodes) {
            if (walk(child)) return true;
        }
        return false;
    }

    // Walk the target's children (skip target itself as root)
    for (const child of target.childNodes) {
        if (walk(child)) return count;
    }

    // `node` is the target itself (selection at boundary of the container)
    if (node === target) {
        // offsetInNode = number of child nodes to skip over
        let skipped = 0;
        for (const child of target.childNodes) {
            if (skipped >= offsetInNode) break;
            if (child.nodeName === 'BR') {
                count += 1;
            } else if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent || '';
                for (const ch of text) {
                    if (ch !== '\u200B') count++;
                }
            }
            skipped++;
        }
        return count;
    }

    return -1; // not found
}

/**
 * Compute the string-level caret offset (matching `getDOMText` semantics) from
 * a Selection object within `target`.
 *
 * Handles:
 *   - ZWS (U+200B) characters: counted as 0 characters
 *   - BR elements: counted as 1 character (\n)
 *
 * Returns `{ start, end }` where start <= end.
 * Falls back to `{ start: 0, end: 0 }` if the selection is outside `target`.
 */
export function getCaretOffsetInElement(target: HTMLElement, selection: Selection): { start: number; end: number } {
    if (!selection || selection.rangeCount === 0) {
        return { start: 0, end: 0 };
    }

    const range = selection.getRangeAt(0);
    const anchorNode = range.startContainer;
    const anchorOffset = range.startOffset;
    const focusNode = range.endContainer;
    const focusOffset = range.endOffset;

    let start = _domOffsetToStringOffset(target, anchorNode, anchorOffset);
    let end = _domOffsetToStringOffset(target, focusNode, focusOffset);

    if (start < 0) start = 0;
    if (end < 0) end = start;

    // Normalize so start <= end
    if (start > end) {
        return { start: end, end: start };
    }
    return { start, end };
}

/**
 * Set the caret in `target` at the string-level `offset` (matching getDOMText semantics).
 * Walks child nodes counting characters the same way as getDOMText / getCaretOffsetInElement.
 *
 * If `offset` is beyond the content length, the caret is placed at the very end.
 */
export function setCaretAtOffset(target: HTMLElement, offset: number): void {
    const selection = window.getSelection();
    if (!selection) return;

    let remaining = offset;
    const range = document.createRange();
    let placed = false;

    function walk(node: Node): boolean {
        if (node.nodeName === 'BR') {
            if (remaining === 0) {
                // Place caret before this BR
                range.setStartBefore(node);
                range.collapse(true);
                placed = true;
                return true;
            }
            remaining -= 1;
            return false;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            let realChars = 0;
            for (let i = 0; i < text.length; i++) {
                if (text[i] === '\u200B') continue; // ZWS = 0 chars
                if (remaining === 0) {
                    // Place caret at this position (dom offset = i)
                    range.setStart(node, i);
                    range.collapse(true);
                    placed = true;
                    return true;
                }
                remaining--;
                realChars++;
            }
            // If we consumed all real chars in this node and remaining == 0,
            // place caret at the end of this text node (after last real char)
            if (remaining === 0 && realChars > 0) {
                range.setStart(node, text.length);
                range.collapse(true);
                placed = true;
                return true;
            }
            return false;
        }

        // Element node: recurse into children
        for (const child of node.childNodes) {
            if (walk(child)) return true;
        }
        return false;
    }

    for (const child of target.childNodes) {
        if (walk(child)) break;
    }

    if (!placed) {
        // Offset is at or beyond the end — place caret at end of content
        const lastChild = target.lastChild;
        if (lastChild) {
            if (lastChild.nodeType === Node.TEXT_NODE) {
                range.setStart(lastChild, (lastChild.textContent || '').length);
            } else {
                range.setStartAfter(lastChild);
            }
        } else {
            range.setStart(target, 0);
        }
        range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Format a cell value based on number format settings.
 * Returns the original value if not a valid number.
 */
export function formatCellValue(value: string, format?: NumberFormat): string {
    if (!format || !value) return value;

    const num = parseFloat(value);
    if (isNaN(num)) return value; // Non-numeric values pass through

    const decimals = format.decimals ?? 0;

    if (format.type === 'percent') {
        const percentVal = num * 100;
        return percentVal.toFixed(decimals) + '%';
    }

    let result: string;
    if (format.useThousandsSeparator) {
        result = num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    } else {
        result = num.toFixed(decimals);
    }

    if (format.type === 'currency' && format.currencySymbol) {
        result = format.currencySymbol + result;
    }

    return result;
}

/**
 * Render markdown content to HTML using marked.
 * Handles newline conversion and trailing BR issues.
 */
export function renderMarkdown(content: string): string {
    if (!content) return '';
    // Use parseInline to avoid <p> tags and enable GFM line breaks
    let html = marked.parseInline(content, { breaks: true }) as string;

    // Browsers collapse literal newlines in innerHTML unless white-space: pre is used.
    // We enforce <br> for every newline to be safe.
    // marked with breaks:true handles most, but parseInline might differ.
    html = html.replace(/\n/g, '<br>');

    // Browsers collapse trailing <br> elements. We append a zero-width space
    // so the <br> is treated as having content after it and renders correctly.
    if (html.endsWith('<br>')) {
        html += '\u200B'; // Zero-width space
    }

    return html;
}

/**
 * Generate alt text for an image file.
 * Strips timestamp suffixes and appends current date/time.
 */
export function generateImageAltText(fileName: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const sanitized = baseName.replace(/-\d{10,}$/, '');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
    return `${sanitized} - ${dateStr}`;
}

/**
 * Upload an image file via the extension host and invoke a callback with the saved URL.
 *
 * Flow: file → base64 → 'toolbar-action' saveImage event → wait for 'imageSaved' response.
 * The caller provides `dispatchSaveEvent` to control how the saveImage event is dispatched
 * (e.g. via element.dispatchEvent or window.dispatchEvent) and `onSaved` to handle the result.
 */
export async function uploadImageAndGetUrl(
    file: File,
    dispatchSaveEvent: (detail: { action: string; messageId: string; fileName: string; fileData: string }) => void,
    onSaved: (url: string, altText: string) => void,
    onError?: (error: string) => void
): Promise<void> {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const messageId = Math.random().toString(36).substring(7);
    dispatchSaveEvent({
        action: 'saveImage',
        messageId,
        fileName: file.name,
        fileData: base64
    });

    const handleImageResponse = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail.messageId === messageId) {
            window.removeEventListener('imageSaved', handleImageResponse);
            if (customEvent.detail.success) {
                const altText = generateImageAltText(file.name);
                onSaved(customEvent.detail.url, altText);
            } else {
                onError?.(customEvent.detail.error || 'Failed to upload image');
            }
        }
    };
    window.addEventListener('imageSaved', handleImageResponse);
}
