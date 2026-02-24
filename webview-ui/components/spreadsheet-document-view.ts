import { html, LitElement, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import documentViewStyles from './styles/document-view.css?inline';
import easymdeStyles from 'easymde/dist/easymde.min.css?inline';
import codiconsStyles from '@vscode/codicons/dist/codicon.css?inline';
import hljsStyles from 'highlight.js/styles/vs2015.min.css?inline';
import EasyMDE from 'easymde';
import { t } from '../utils/i18n';

@customElement('spreadsheet-document-view')
export class SpreadsheetDocumentView extends LitElement {
    protected createRenderRoot() {
        return this;
    }

    @property({ type: String })
    title: string = '';

    @property({ type: String })
    content: string = '';

    @property({ type: Number })
    sectionIndex: number = 0;

    @property({ type: Boolean })
    isDocSheet: boolean = false;

    @property({ type: Boolean })
    isRootTab: boolean = false;

    @property({ type: Number })
    sheetIndex: number = 0;

    @state()
    private _isEditing: boolean = false;

    @state()
    private _editContent: string = '';

    private _debounceTimer: number | null = null;
    private _easymde: EasyMDE | null = null;

    protected willUpdate(changedProperties: PropertyValues): void {
        super.willUpdate(changedProperties);
        if (changedProperties.has('content') && !this._isEditing) {
            this._editContent = this.content;
        }
    }

    private _getFullContent(): string {
        // Root tab has no title header, just content
        if (this.isRootTab) {
            return this.content;
        }
        // Combine title (h1) with body content for documents
        return `# ${this.title}\n${this.content}`;
    }

    private _getRenderedContent(): string {
        const fullContent = this._getFullContent();
        if (!fullContent.trim()) return `<p><em>${t('clickToEdit')}...</em></p>`;

        marked.use(
            markedHighlight({
                langPrefix: 'hljs language-',
                highlight(code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return hljs.highlightAuto(code).value;
                }
            }) as marked.MarkedExtension
        );
        marked.setOptions({
            gfm: true,
            breaks: false
        });

        try {
            return marked.parse(fullContent) as string;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return `<pre>${fullContent}</pre>`;
        }
    }

    private async _enterEditMode(): Promise<void> {
        this._editContent = this.isRootTab ? this.content : this._getFullContent();
        this._isEditing = true;

        await this.updateComplete;

        const textarea = this.querySelector('textarea.editor') as HTMLTextAreaElement;
        if (textarea && !this._easymde) {
            this._easymde = new EasyMDE({
                element: textarea,
                initialValue: this._editContent,
                autoDownloadFontAwesome: false,
                spellChecker: false,
                autofocus: true,
                status: false,
                minHeight: '400px',
                toolbar: [
                    {
                        name: 'bold',
                        action: EasyMDE.toggleBold,
                        className: 'easymde-icon',
                        title: 'Bold',
                        icon: '<span class="codicon codicon-bold"></span>'
                    },
                    {
                        name: 'italic',
                        action: EasyMDE.toggleItalic,
                        className: 'easymde-icon',
                        title: 'Italic',
                        icon: '<span class="codicon codicon-italic"></span>'
                    },
                    {
                        name: 'heading',
                        action: EasyMDE.toggleHeadingSmaller,
                        className: 'easymde-icon',
                        title: 'Heading',
                        icon: '<span class="codicon codicon-text-size"></span>'
                    },
                    '|',
                    {
                        name: 'quote',
                        action: EasyMDE.toggleBlockquote,
                        className: 'easymde-icon',
                        title: 'Quote',
                        icon: '<span class="codicon codicon-quote"></span>'
                    },
                    {
                        name: 'unordered-list',
                        action: EasyMDE.toggleUnorderedList,
                        className: 'easymde-icon',
                        title: 'Generic List',
                        icon: '<span class="codicon codicon-list-unordered"></span>'
                    },
                    {
                        name: 'ordered-list',
                        action: EasyMDE.toggleOrderedList,
                        className: 'easymde-icon',
                        title: 'Numbered List',
                        icon: '<span class="codicon codicon-list-ordered"></span>'
                    },
                    '|',
                    {
                        name: 'link',
                        action: EasyMDE.drawLink,
                        className: 'easymde-icon',
                        title: 'Create Link',
                        icon: '<span class="codicon codicon-link"></span>'
                    },
                    {
                        name: 'image',
                        action: EasyMDE.drawImage,
                        className: 'easymde-icon',
                        title: 'Insert Image',
                        icon: '<span class="codicon codicon-file-media"></span>'
                    },
                    {
                        name: 'preview',
                        action: EasyMDE.togglePreview,
                        className: 'no-disable',
                        title: 'Toggle Preview',
                        icon: '<span class="codicon codicon-open-preview"></span>'
                    },
                    {
                        name: 'side-by-side',
                        action: EasyMDE.toggleSideBySide,
                        className: 'no-disable no-mobile',
                        title: 'Toggle Side by Side',
                        icon: '<span class="codicon codicon-split-horizontal"></span>'
                    }
                ],
                uploadImage: true,
                imageAccept: 'image/png, image/jpeg, image/gif, image/webp',
                imageUploadFunction: async (file: File, onSuccess: (url: string) => void, onError: (error: string) => void) => {
                    try {
                        const buffer = await file.arrayBuffer();
                        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

                        // Send message to extension host to save the image
                        const messageId = Math.random().toString(36).substring(7);
                        this.dispatchEvent(
                            new CustomEvent('toolbar-action', {
                                bubbles: true,
                                composed: true,
                                detail: {
                                    action: 'saveImage',
                                    messageId,
                                    fileName: file.name,
                                    fileData: base64
                                }
                            })
                        );

                        // Wait for response (a real implementation would listen to a global event or message)
                        // For now we will just use a global window callback or a custom event listener
                        const handleImageResponse = (e: Event) => {
                            const customEvent = e as CustomEvent;
                            if (customEvent.detail.messageId === messageId) {
                                window.removeEventListener('imageSaved', handleImageResponse);
                                if (customEvent.detail.success) {
                                    onSuccess(customEvent.detail.url);
                                } else {
                                    onError(customEvent.detail.error || 'Failed to upload image');
                                }
                            }
                        };
                        window.addEventListener('imageSaved', handleImageResponse);
                    } catch (e) {
                        onError('Failed to process image');
                    }
                }
            });

            this._easymde.codemirror.on('change', () => {
                this._editContent = this._easymde!.value();
            });


            // Handle Escape key inside CodeMirror
            this._easymde.codemirror.setOption('extraKeys', {
                Esc: () => {
                    this._exitEditMode(false);
                }
            });
        }
    }

    private _exitEditMode(shouldSave: boolean = false): void {
        if (!this._isEditing) return;

        if (this._easymde) {
            this._editContent = this._easymde.value();
            this._easymde.toTextArea();
            this._easymde = null;
        }

        this._isEditing = false;
        const currentFullContent = this._getFullContent();

        if (this._editContent !== currentFullContent) {
            this._saveContent(shouldSave);
        } else if (shouldSave) {
            this.dispatchEvent(
                new CustomEvent('toolbar-action', {
                    bubbles: true,
                    composed: true,
                    detail: { action: 'save' }
                })
            );
        }
    }

    private _extractTitleAndBody(content: string): { title: string; body: string } {
        const lines = content.split('\n');
        let title = this.title;
        let bodyStartIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;
            if (line.startsWith('# ')) {
                title = line.substring(2).trim();
                bodyStartIndex = i + 1;
            }
            break;
        }

        let body = lines.slice(bodyStartIndex).join('\n');
        if (body.startsWith('\n')) {
            body = body.substring(1);
        }
        return { title, body };
    }

    private _saveContent(shouldSave: boolean = false): void {
        console.log("SpreadsheetDocumentView: _saveContent called, shouldSave=", shouldSave);
        if (this._debounceTimer) {
            window.clearTimeout(this._debounceTimer);
        }

        this._debounceTimer = window.setTimeout(() => {
            console.log("SpreadsheetDocumentView: _saveContent timeout executing");
            const { title, body } = this._extractTitleAndBody(this._editContent);
            console.log("Extracted title:", title, "body:", body, "isRootTab:", this.isRootTab, "isDocSheet:", this.isDocSheet);

            if (this.isRootTab) {
                this.dispatchEvent(
                    new CustomEvent('root-content-change', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            content: this._editContent,
                            save: shouldSave
                        }
                    })
                );
            } else if (this.isDocSheet) {
                this.dispatchEvent(
                    new CustomEvent('doc-sheet-change', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            sheetIndex: this.sheetIndex,
                            content: body,
                            title: title,
                            save: shouldSave
                        }
                    })
                );
            } else {
                console.log("Dispatching document-change event");
                this.dispatchEvent(
                    new CustomEvent('document-change', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            sectionIndex: this.sectionIndex,
                            content: body,
                            title: title,
                            save: shouldSave
                        }
                    })
                );
            }
        }, 100);
    }

    render() {
        console.log("Running render() for SpreadsheetDocumentView", this.title, this._isEditing);
        console.log("easymdeStyles type:", typeof easymdeStyles);
        return html`
            <style>
                ${documentViewStyles}
                ${easymdeStyles}
                ${codiconsStyles}
                ${hljsStyles}
                
                /* Override to fix Light DOM global bleeding if necessary */
                .spreadsheet-document-view-container {
                    /* Container specificity */
                }
                
                .editor-toolbar {
                    background-color: var(--vscode-editor-background) !important;
                    border-color: var(--vscode-widget-border) !important;
                    color: var(--vscode-editor-foreground) !important;
                }

                .editor-toolbar button {
                    color: var(--vscode-editor-foreground) !important;
                }

                .editor-toolbar button.active,
                .editor-toolbar button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)) !important;
                    border-color: transparent !important;
                }

                /* Codicon spans inside toolbar buttons */
                .editor-toolbar button .codicon {
                    font-size: 16px;
                    line-height: 30px;
                }

                /* Separator divider */
                .editor-toolbar i.separator {
                    border-left-color: var(--vscode-widget-border, rgba(128, 128, 128, 0.35)) !important;
                    border-right: none !important;
                }

                .CodeMirror {
                    background-color: var(--vscode-editor-background) !important;
                    color: var(--vscode-editor-foreground) !important;
                    border-color: var(--vscode-widget-border) !important;
                    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif) !important;
                    font-size: var(--vscode-font-size, 13px) !important;
                    line-height: 1.6 !important;
                    padding: 0 1.5rem !important;
                }

                .CodeMirror-cursor {
                    border-left-color: var(--vscode-editorCursor-foreground) !important;
                }

                /* Selection highlight — match VS Code editor selection */
                .CodeMirror-focused .CodeMirror-selected,
                .CodeMirror .CodeMirror-selected {
                    background: var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.5)) !important;
                }

                /* Match heading sizes with preview view (.output h1/h2/h3) */
                .cm-s-easymde .cm-header-1 { font-size: 2em !important; }
                .cm-s-easymde .cm-header-2 { font-size: 1.5em !important; }
                .cm-s-easymde .cm-header-3 { font-size: 1.25em !important; }
                .cm-s-easymde .cm-header-4 { font-size: 1.1em !important; }
                .cm-s-easymde .cm-header-5 { font-size: 1em !important; }
                .cm-s-easymde .cm-header-6 { font-size: 1em !important; }

                /*
                 * Shared content styles for EasyMDE preview panes.
                 * These mirror the .output rules in document-view.css
                 * so that preview and rendered view look identical.
                 */
                .editor-preview,
                .editor-preview-side {
                    background-color: var(--vscode-editor-background) !important;
                    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif) !important;
                    font-size: var(--vscode-font-size, 13px) !important;
                    line-height: 1.6 !important;
                    padding: 0 1.5rem !important;
                    color: var(--vscode-editor-foreground) !important;
                }

                /* Headings */
                .editor-preview h1,
                .editor-preview-side h1 {
                    font-size: 2em !important;
                    margin-bottom: 0.5em;
                    border-bottom: 1px solid var(--vscode-widget-border);
                    padding-bottom: 0.3em;
                }
                .editor-preview h2,
                .editor-preview-side h2 {
                    font-size: 1.5em !important;
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                }
                .editor-preview h3,
                .editor-preview-side h3 {
                    font-size: 1.25em !important;
                    margin-top: 1em;
                    margin-bottom: 0.5em;
                }

                /* Paragraphs and lists */
                .editor-preview p,
                .editor-preview-side p {
                    margin: 0.5em 0;
                }
                .editor-preview ul,
                .editor-preview ol,
                .editor-preview-side ul,
                .editor-preview-side ol {
                    margin: 0.5em 0;
                    padding-left: 2em;
                }
                .editor-preview li,
                .editor-preview-side li {
                    margin: 0.25em 0;
                }

                /* Text formatting */
                .editor-preview strong,
                .editor-preview-side strong {
                    font-weight: bold;
                }
                .editor-preview em,
                .editor-preview-side em {
                    font-style: italic;
                }
                .editor-preview a,
                .editor-preview-side a {
                    color: var(--vscode-textLink-foreground);
                }
                .editor-preview a:hover,
                .editor-preview-side a:hover {
                    text-decoration: underline;
                }

                /* Code */
                .editor-preview code,
                .editor-preview-side code {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 0.1em 0.3em;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 0.9em;
                }
                .editor-preview pre,
                .editor-preview-side pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 1em;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 1em 0;
                }
                .editor-preview pre code,
                .editor-preview-side pre code {
                    background: none;
                    padding: 0;
                }

                /* Blockquotes */
                .editor-preview blockquote,
                .editor-preview-side blockquote {
                    border-left: 3px solid var(--vscode-textBlockQuote-border);
                    padding-left: 1em;
                    margin-left: 0;
                    margin-right: 0;
                    color: var(--vscode-textBlockQuote-foreground);
                }

                /* Horizontal rule */
                .editor-preview hr,
                .editor-preview-side hr {
                    border: none;
                    border-top: 1px solid var(--vscode-widget-border);
                    margin: 1.5em 0;
                }

                /* Tables */
                .editor-preview table,
                .editor-preview-side table {
                    border-collapse: collapse;
                    margin: 1em 0;
                }
                .editor-preview th,
                .editor-preview td,
                .editor-preview-side th,
                .editor-preview-side td {
                    padding: 6px 13px;
                    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
                }
                .editor-preview th,
                .editor-preview-side th {
                    font-weight: 600;
                }

                /* Images */
                .editor-preview img,
                .editor-preview-side img {
                    max-width: 100%;
                    height: auto;
                }
            </style>
            <div class="container spreadsheet-document-view-container">
                ${this._isEditing
                ? html`
                          <div class="edit-container">
                              <textarea class="editor"></textarea>
                          </div>
                          <button
                              class="save-button"
                              @mousedown=${(e: MouseEvent) => e.preventDefault()}
                              @click=${() => this._exitEditMode(true)}
                          >
                              <span class="codicon codicon-check"></span>
                              Save
                          </button>
                      `
                : html`
                          <div class="output" @click=${this._enterEditMode}>
                              ${unsafeHTML(this._getRenderedContent())}
                          </div>
                          <div class="scroll-spacer"></div>
                          <div class="edit-hint">${t('clickToEdit')}</div>
                      `}
            </div>
        `;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this._debounceTimer) {
            window.clearTimeout(this._debounceTimer);
        }
        if (this._easymde) {
            this._easymde.toTextArea();
            this._easymde = null;
        }
    }
}
