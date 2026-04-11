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
