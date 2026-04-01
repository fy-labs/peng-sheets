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
import { debounce } from '../utils/debounce';

const DIRTY_NOTIFY_DEBOUNCE_MS = 500;

// Configure marked once at module level (NOT inside render methods).
// marked.use() is cumulative — calling it repeatedly adds duplicate extensions
// and degrades performance exponentially.
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
marked.setOptions({ gfm: true, breaks: false });

/**
 * Generate meaningful alt text from a filename.
 * Format: "{sanitized basename} - {YYYY-MM-DD HH:mm}"
 */
export function generateImageAltText(fileName: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const sanitized = baseName.replace(/-\d{10,}$/, '');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
    return `${sanitized} - ${dateStr}`;
}

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

    /** Raw markdown header text (e.g. "## Doc 1") or plain title for frontmatter */
    @property({ type: String })
    headerText: string = '';

    @property({ type: Number })
    sheetIndex: number = 0;

    @state()
    private _activeTab: 'view' | 'write' = 'view';

    private _editContent: string | null = null;

    private _debouncedNotifyDirty = debounce(() => this._doSaveContent(false), DIRTY_NOTIFY_DEBOUNCE_MS);

    private _easymde: EasyMDE | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _editorHost: HTMLDivElement | null = null;
    private _boundEditorAction = (e: Event) => {
        const action = (e as CustomEvent<{ action: string }>).detail.action;
        this.triggerEditorAction(action);
    };

    connectedCallback(): void {
        super.connectedCallback();
        window.addEventListener('editor-action', this._boundEditorAction);
    }

    protected willUpdate(changedProperties: PropertyValues): void {
        super.willUpdate(changedProperties);
        // Only sync content prop into _editContent when in view mode and _editContent
        // is still null (Write mode has never been entered). Once the user has entered
        // Write mode (_editContent !== null), we never overwrite their in-memory edits
        // with a stale prop value.
        if (changedProperties.has('content') && this._activeTab === 'view' && this._editContent === null) {
            this._editContent = this.content;
        }
    }

    protected firstUpdated(): void {
        const container = this.querySelector('.sdv-container') as HTMLElement;
        if (container) {
            this._editorHost = document.createElement('div');
            this._editorHost.className = 'edit-container';
            this._editorHost.setAttribute('role', 'tabpanel');
            this._editorHost.style.display = 'none';
            container.appendChild(this._editorHost);
        }
    }

    private _getFullContent(includeHeader: boolean = true): string {
        // Root tab has no title header, just content
        if (this.isRootTab) {
            return this.content;
        }
        // Edit mode: body content only (tab name is editable via double-click)
        if (!includeHeader) {
            return this.content;
        }
        // Preview mode: combine title (h1) with body content for rendering
        return `# ${this.title}\n${this.content}`;
    }

    private _getRenderedContent(): string {
        // Use _editContent (in-memory, always up-to-date) when Write mode has been
        // entered at least once (_editContent !== null). null means we haven't entered
        // Write mode yet, so fall back to the content prop. This correctly handles the
        // case where the user deleted all text (empty string is valid edited content).
        const fullContent = this._editContent !== null ? this._editContent : this._getFullContent(false);
        if (!fullContent.trim()) return `<p><em>${t('clickToEdit')}...</em></p>`;

        try {
            return marked.parse(fullContent) as string;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return `<pre>${fullContent}</pre>`;
        }
    }

    private async _switchToWriteTab(): Promise<void> {
        if (this._activeTab === 'write') return;

        // On first Write mode entry, _editContent is null — initialise from the prop.
        // On subsequent entries, preserve whatever the user had already typed.
        if (this._editContent === null) {
            this._editContent = this.isRootTab ? this.content : this._getFullContent(false);
        }
        this._activeTab = 'write';

        await this.updateComplete;

        if (this._editorHost) {
            // Show the editor host (lives outside Lit template, so no parts-marker risk)
            this._editorHost.style.display = '';

            if (!this._easymde) {
                // Create textarea manually inside _editorHost on first activation
                const textarea = document.createElement('textarea');
                textarea.className = 'editor';
                this._editorHost.appendChild(textarea);

                this._easymde = new EasyMDE({
                    element: textarea,
                    initialValue: this._editContent ?? this._getFullContent(false),
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
                            title: t('toolbarBold'),
                            icon: '<span class="codicon codicon-bold"></span>'
                        },
                        {
                            name: 'italic',
                            action: EasyMDE.toggleItalic,
                            className: 'easymde-icon',
                            title: t('toolbarItalic'),
                            icon: '<span class="codicon codicon-italic"></span>'
                        },
                        {
                            name: 'heading',
                            action: EasyMDE.toggleHeadingSmaller,
                            className: 'easymde-icon',
                            title: t('toolbarHeading'),
                            icon: '<span class="codicon codicon-text-size"></span>'
                        },
                        '|',
                        {
                            name: 'quote',
                            action: EasyMDE.toggleBlockquote,
                            className: 'easymde-icon',
                            title: t('toolbarQuote'),
                            icon: '<span class="codicon codicon-quote"></span>'
                        },
                        {
                            name: 'unordered-list',
                            action: EasyMDE.toggleUnorderedList,
                            className: 'easymde-icon',
                            title: t('toolbarUnorderedList'),
                            icon: '<span class="codicon codicon-list-unordered"></span>'
                        },
                        {
                            name: 'ordered-list',
                            action: EasyMDE.toggleOrderedList,
                            className: 'easymde-icon',
                            title: t('toolbarOrderedList'),
                            icon: '<span class="codicon codicon-list-ordered"></span>'
                        },
                        '|',
                        {
                            name: 'link',
                            action: EasyMDE.drawLink,
                            className: 'easymde-icon',
                            title: t('toolbarLink'),
                            icon: '<span class="codicon codicon-link"></span>'
                        },
                        {
                            name: 'image',
                            action: EasyMDE.drawImage,
                            className: 'easymde-icon',
                            title: t('toolbarImage'),
                            icon: '<span class="codicon codicon-file-media"></span>'
                        }
                    ],
                    uploadImage: true,
                    imageAccept: 'image/png, image/jpeg, image/gif, image/webp',
                    imageUploadFunction: async (
                        file: File,
                        onSuccess: (url: string) => void,
                        onError: (error: string) => void
                    ) => {
                        try {
                            const buffer = await file.arrayBuffer();
                            const base64 = btoa(
                                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                            );

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

                            // Wait for response via a global window event listener
                            const handleImageResponse = (e: Event) => {
                                const customEvent = e as CustomEvent;
                                if (customEvent.detail.messageId === messageId) {
                                    window.removeEventListener('imageSaved', handleImageResponse);
                                    if (customEvent.detail.success) {
                                        const url = customEvent.detail.url;
                                        const altText = generateImageAltText(file.name);
                                        const cm = this._easymde!.codemirror;
                                        cm.replaceSelection(`![${altText}](${url})`);
                                        cm.focus();
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
                    this._debouncedNotifyDirty();
                });

                // Handle Escape key inside CodeMirror
                this._easymde.codemirror.setOption('extraKeys', {
                    Esc: () => {
                        this._switchToViewTab(false);
                    }
                });

                // Make EasyMDE toolbar sticky below .sdv-title-bar + .sdv-tab-bar
                this._updateStickyPositions();

                // Watch for resize changes
                if (typeof ResizeObserver !== 'undefined') {
                    this._resizeObserver = new ResizeObserver(() => {
                        this._updateStickyPositions();
                    });
                    const titleBar = this.querySelector('.sdv-title-bar') as HTMLElement;
                    const tabBar = this.querySelector('.sdv-tab-bar') as HTMLElement;
                    if (titleBar) this._resizeObserver.observe(titleBar);
                    if (tabBar) this._resizeObserver.observe(tabBar);
                }
            }
        }
    }

    private _switchToViewTab(shouldSave: boolean = false): void {
        if (this._activeTab === 'view') return;

        if (this._easymde) {
            this._editContent = this._easymde.value();
            // Do NOT call toTextArea() -- EasyMDE stays alive in _editorHost.
            // Only toggling display avoids any DOM mutations to Lit-managed nodes.
        }

        // Hide the editor host (outside Lit template, so safe to manipulate directly)
        if (this._editorHost) {
            this._editorHost.style.display = 'none';
        }

        this._activeTab = 'view';

        // Flush any pending dirty notification immediately (no-op if nothing pending)
        this._debouncedNotifyDirty.flush();

        if (shouldSave) {
            this.dispatchEvent(
                new CustomEvent('toolbar-action', {
                    bubbles: true,
                    composed: true,
                    detail: { action: 'save' }
                })
            );
        }
    }

    private _updateStickyPositions(): void {
        const titleBar = this.querySelector('.sdv-title-bar') as HTMLElement;
        const tabBar = this.querySelector('.sdv-tab-bar') as HTMLElement;
        const toolbar = this.querySelector('.editor-toolbar') as HTMLElement;

        const titleBarHeight = titleBar ? titleBar.getBoundingClientRect().height : 0;
        const tabBarHeight = tabBar ? tabBar.getBoundingClientRect().height : 0;

        if (tabBar) {
            tabBar.style.top = `${titleBarHeight}px`;
        }
        if (toolbar) {
            toolbar.style.position = 'sticky';
            toolbar.style.top = `${titleBarHeight + tabBarHeight}px`;
            toolbar.style.zIndex = '28';
            toolbar.style.background = 'var(--vscode-editor-background)';
        }
    }

    private _extractTitleAndBody(content: string): { title: string; body: string } {
        // Edit mode no longer includes header in textarea,
        // so content IS the body. Title is preserved from the component property.
        return { title: this.title, body: content };
    }

    private _doSaveContent(shouldSave: boolean = false): void {
        console.log('SpreadsheetDocumentView: _doSaveContent called, shouldSave=', shouldSave);
        // _doSaveContent is called from _debouncedNotifyDirty (either after the debounce
        // timeout fires naturally, or via flush() on tab switch). In both cases _editContent
        // is a string.
        const editContent = this._editContent ?? '';
        const { title, body } = this._extractTitleAndBody(editContent);
        console.log(
            'Extracted title:',
            title,
            'body:',
            body,
            'isRootTab:',
            this.isRootTab,
            'isDocSheet:',
            this.isDocSheet
        );

        if (this.isRootTab) {
            this.dispatchEvent(
                new CustomEvent('root-content-change', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        content: editContent,
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
            console.log('Dispatching document-change event');
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
    }

    render() {
        console.log('Running render() for SpreadsheetDocumentView', this.title, this._activeTab);
        console.log('easymdeStyles type:', typeof easymdeStyles);
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
                    position: sticky !important;
                    z-index: 28;
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
                .cm-s-easymde .cm-header-1 {
                    font-size: 2em !important;
                }
                .cm-s-easymde .cm-header-2 {
                    font-size: 1.5em !important;
                }
                .cm-s-easymde .cm-header-3 {
                    font-size: 1.25em !important;
                }
                .cm-s-easymde .cm-header-4 {
                    font-size: 1.1em !important;
                }
                .cm-s-easymde .cm-header-5 {
                    font-size: 1em !important;
                }
                .cm-s-easymde .cm-header-6 {
                    font-size: 1em !important;
                }

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
            <div class="sdv-container container spreadsheet-document-view-container">
                <!-- Title bar (hidden for root tab) -->
                ${!this.isRootTab
                    ? html`
                          <div class="sdv-title-bar">
                              <div class="sdv-title-text">${this.headerText || this.title}</div>
                          </div>
                      `
                    : html``}

                <!-- Tab bar -->
                <div class="sdv-tab-bar" role="tablist">
                    <button
                        class="sdv-tab ${this._activeTab === 'view' ? 'sdv-tab--active' : ''}"
                        role="tab"
                        aria-selected="${this._activeTab === 'view'}"
                        aria-label="${t('tabViewAriaLabel')}"
                        @click=${() => this._switchToViewTab(false)}
                    >
                        ${t('tabView')}
                    </button>
                    <button
                        class="sdv-tab ${this._activeTab === 'write' ? 'sdv-tab--active' : ''}"
                        role="tab"
                        aria-selected="${this._activeTab === 'write'}"
                        aria-label="${t('tabWriteAriaLabel')}"
                        @click=${() => this._switchToWriteTab()}
                    >
                        ${t('tabWrite')}
                    </button>
                </div>

                <!-- Tab content: only the view-mode output is Lit-managed.
                     The write-mode editor host (_editorHost) is created outside
                     Lit's template in firstUpdated() to avoid parts-marker corruption
                     by EasyMDE's DOM operations. -->
                ${this._activeTab === 'view'
                    ? html`
                          <div class="output" role="tabpanel">${unsafeHTML(this._getRenderedContent())}</div>
                          <div class="scroll-spacer"></div>
                      `
                    : html``}
            </div>
        `;
    }

    triggerEditorAction(action: string): void {
        if (!this._easymde || this._activeTab !== 'write') return;
        switch (action) {
            case 'bold':
                EasyMDE.toggleBold(this._easymde);
                break;
            case 'italic':
                EasyMDE.toggleItalic(this._easymde);
                break;
            case 'heading':
                EasyMDE.toggleHeadingSmaller(this._easymde);
                break;
            case 'link':
                EasyMDE.drawLink(this._easymde);
                break;
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('editor-action', this._boundEditorAction);
        this._debouncedNotifyDirty.cancel();
        if (this._easymde) {
            this._easymde.toTextArea();
            this._easymde = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._editorHost) {
            this._editorHost.remove();
            this._editorHost = null;
        }
    }
}
