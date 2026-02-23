import { html, LitElement, unsafeCSS, nothing, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../utils/i18n';
import styles from './styles/tab-context-menu.css?inline';

/**
 * Context menu component for sheet/document tabs.
 *
 * @fires rename - When rename option is clicked
 * @fires delete - When delete option is clicked
 * @fires add-document - When add document option is clicked
 * @fires add-sheet - When add sheet option is clicked
 * @fires close - When menu should close (overlay click)
 */
@customElement('tab-context-menu')
export class TabContextMenu extends LitElement {
    static styles = unsafeCSS(styles);

    /** Whether the menu is open */
    @property({ type: Boolean })
    open = false;

    /** X position of the menu */
    @property({ type: Number })
    x = 0;

    /** Y position of the menu */
    @property({ type: Number })
    y = 0;

    /** Type of the tab: 'sheet', 'document', or 'root' */
    @property({ type: String })
    tabType: 'sheet' | 'document' | 'root' = 'sheet';

    /** Adjusted Y position after overflow check */
    @state()
    private _adjustedY: number | null = null;

    /** Adjusted X position after overflow check */
    @state()
    private _adjustedX: number | null = null;

    protected updated(changedProperties: PropertyValues): void {
        super.updated(changedProperties);

        // Adjust position after render if menu opened or position changed
        if (this.open && (changedProperties.has('open') || changedProperties.has('x') || changedProperties.has('y'))) {
            this._adjustedY = null; // Reset on new open/position
            this._adjustedX = null;
            setTimeout(() => {
                const menuEl = this.shadowRoot?.querySelector('.context-menu') as HTMLElement;
                if (menuEl) {
                    const rect = menuEl.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const viewportWidth = window.innerWidth;

                    // Adjust Y if menu extends below viewport
                    if (rect.bottom > viewportHeight) {
                        this._adjustedY = this.y - rect.height;
                    }

                    // Adjust X if menu extends beyond right edge
                    if (rect.right > viewportWidth) {
                        this._adjustedX = this.x - rect.width;
                    }
                }
            }, 0);
        }

        // Reset adjusted position when closed
        if (!this.open && changedProperties.has('open')) {
            this._adjustedY = null;
            this._adjustedX = null;
        }
    }

    private _dispatchAction(action: string) {
        this.dispatchEvent(
            new CustomEvent(action, {
                bubbles: true,
                composed: true
            })
        );
    }

    private _handleOverlayClick() {
        this._dispatchAction('close');
    }

    render() {
        if (!this.open) return nothing;

        const displayY = this._adjustedY ?? this.y;
        const displayX = this._adjustedX ?? this.x;

        return html`
            <div class="context-menu" style="top: ${displayY}px; left: ${displayX}px;">
                ${this.tabType === 'sheet'
                    ? html`
                          <div class="context-menu-item" @click="${() => this._dispatchAction('rename')}">
                              ${t('renameSheet')}
                          </div>
                          <div class="context-menu-item" @click="${() => this._dispatchAction('delete')}">
                              ${t('deleteSheet')}
                          </div>
                      `
                    : this.tabType === 'root'
                      ? html`
                            <div class="context-menu-item" @click="${() => this._dispatchAction('rename')}">
                                ${t('renameTabName')}
                            </div>
                            <div class="context-menu-item" @click="${() => this._dispatchAction('delete')}">
                                ${t('deleteOverviewTab')}
                            </div>
                        `
                      : html`
                            <div class="context-menu-item" @click="${() => this._dispatchAction('rename')}">
                                ${t('renameDocument')}
                            </div>
                            <div class="context-menu-item" @click="${() => this._dispatchAction('delete')}">
                                ${t('deleteDocument')}
                            </div>
                        `}
                <div class="menu-divider"></div>
                <div class="context-menu-item" @click="${() => this._dispatchAction('add-document')}">
                    ${t('addNewDocument')}
                </div>
                <div class="context-menu-item" @click="${() => this._dispatchAction('add-sheet')}">
                    ${t('addNewSheet')}
                </div>
            </div>
            <!-- Overlay to close menu on click outside -->
            <div class="overlay" @click="${this._handleOverlayClick}"></div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'tab-context-menu': TabContextMenu;
    }
}
