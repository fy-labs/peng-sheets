import { html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import documentViewStyles from './styles/document-view.css?inline';
import { t } from '../utils/i18n';

@customElement('spreadsheet-document-view')
export class SpreadsheetDocumentView extends LitElement {
    static styles = unsafeCSS(documentViewStyles);

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

    private _enterEditMode(): void {
        // For root tab, edit content directly without header
        // For documents, include h1 header in edit content
        this._editContent = this.isRootTab ? this.content : this._getFullContent();
        this._isEditing = true;

        // Focus the textarea after it renders
        this.updateComplete.then(() => {
            const textarea = this.shadowRoot?.querySelector('textarea');
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(0, 0);
            }
        });
    }

    private _exitEditMode(shouldSave: boolean = false): void {
        if (!this._isEditing) return;
        this._isEditing = false;

        const currentFullContent = this._getFullContent();

        // Only save if content changed (compare full content including title)
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

    private _handleInput(e: Event): void {
        const target = e.target as HTMLTextAreaElement;
        this._editContent = target.value;
    }

    private _handleKeyDown(e: KeyboardEvent): void {
        // Escape exits edit mode without saving
        if (e.key === 'Escape') {
            this._editContent = this._getFullContent();
            this._isEditing = false;
        }
    }

    private _extractTitleAndBody(content: string): { title: string; body: string } {
        // Extract h1 header from content
        const lines = content.split('\n');
        let title = this.title; // default to existing title
        let bodyStartIndex = 0;

        // Look for # header at the beginning
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue; // skip empty lines
            if (line.startsWith('# ')) {
                title = line.substring(2).trim();
                bodyStartIndex = i + 1;
            }
            break; // stop after first non-empty line
        }

        let body = lines.slice(bodyStartIndex).join('\n');
        // Strip exactly one leading newline to avoid double blank lines
        // The markdown generator already adds a blank line after sheet headers
        if (body.startsWith('\n')) {
            body = body.substring(1);
        }
        return { title, body };
    }

    private _saveContent(shouldSave: boolean = false): void {
        if (this._debounceTimer) {
            window.clearTimeout(this._debounceTimer);
        }

        this._debounceTimer = window.setTimeout(() => {
            const { title, body } = this._extractTitleAndBody(this._editContent);

            if (this.isRootTab) {
                // For root tab, dispatch root-content-change event
                this.dispatchEvent(
                    new CustomEvent('root-content-change', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            content: this._editContent, // Root tab uses raw edit content
                            save: shouldSave
                        }
                    })
                );
            } else if (this.isDocSheet) {
                // For doc sheets within workbook, dispatch doc-sheet-change event
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
                // For standalone document sections
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
        return html`
            <div class="container">
                ${this._isEditing
                    ? html`
                          <div class="edit-container">
                              <div class="edit-hint visible">${t('pressEscapeToCancel')}</div>
                              <textarea
                                  class="editor"
                                  .value=${this._editContent}
                                  @input=${this._handleInput}
                                  @blur=${() => this._exitEditMode(false)}
                                  @keydown=${this._handleKeyDown}
                              ></textarea>
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
    }
}
