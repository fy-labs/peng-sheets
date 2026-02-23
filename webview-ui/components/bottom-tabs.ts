import { html, LitElement, unsafeCSS, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../utils/i18n';
import styles from './styles/bottom-tabs.css?inline';
import codiconsStyles from '@vscode/codicons/dist/codicon.css?inline';
import { TabDragController } from '../controllers/tab-drag-controller';
import { isRealEnterKey } from '../utils/keyboard-utils';

export interface TabDefinition {
    title: string;
    type: 'sheet' | 'document' | 'root' | 'add-sheet' | 'onboarding';
    data?: unknown;
    sheetIndex?: number;
    documentIndex?: number;
    index: number;
}

/**
 * Bottom tabs component for sheet/document navigation.
 *
 * @fires tab-select - When a tab is selected { index: number }
 * @fires tab-rename - When a tab is renamed { index: number, newName: string }
 * @fires tab-context-menu - When context menu is requested { x, y, index, tabType }
 * @fires tab-reorder - When tabs are reordered via drag-drop { fromIndex, toIndex }
 * @fires add-sheet-click - When add sheet tab is clicked { x, y }
 */
@customElement('bottom-tabs')
export class BottomTabs extends LitElement {
    static styles = [unsafeCSS(codiconsStyles), unsafeCSS(styles)];

    @property({ type: Array })
    tabs: TabDefinition[] = [];

    @property({ type: Number })
    activeIndex = 0;

    @property({ type: Number })
    editingIndex: number | null = null;

    @state()
    private _isScrollableRight = false;

    // Mouse-based drag controller
    private _dragCtrl = new TabDragController(this, {
        onDragStart: () => {
            this.requestUpdate();
        },
        onDragOver: () => {
            this.requestUpdate();
        },
        onDragLeave: () => {
            this.requestUpdate();
        },
        onDragEnd: (fromIndex, toIndex) => {
            if (toIndex !== null && fromIndex !== toIndex) {
                this.dispatchEvent(
                    new CustomEvent('tab-reorder', {
                        detail: { fromIndex, toIndex },
                        bubbles: true,
                        composed: true
                    })
                );
            }
        }
    });

    protected updated(changedProperties: PropertyValues): void {
        super.updated(changedProperties);
        if (changedProperties.has('tabs') || changedProperties.has('activeIndex')) {
            setTimeout(() => this._checkScrollOverflow(), 0);
        }
        if (changedProperties.has('editingIndex') && this.editingIndex !== null) {
            setTimeout(() => this._focusInput(), 0);
        }
    }

    private _focusInput() {
        const input = this.shadowRoot?.querySelector('.tab-input') as HTMLInputElement;
        if (input) {
            input.focus();
            input.select();
        }
    }

    private _checkScrollOverflow() {
        const container = this.shadowRoot?.querySelector('.bottom-tabs') as HTMLElement;
        if (container) {
            const isScrollable = container.scrollWidth > container.clientWidth;
            const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 2;
            this._isScrollableRight = isScrollable && !atEnd;
        }
    }

    private _handleScroll() {
        this._checkScrollOverflow();
    }

    private _handleTabClick(e: MouseEvent, index: number, tab: TabDefinition) {
        // Ignore if we just finished a drag
        if (this._dragCtrl.isDragging) return;

        if (tab.type === 'add-sheet') {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            this.dispatchEvent(
                new CustomEvent('add-sheet-click', {
                    detail: { x: rect.left, y: rect.top },
                    bubbles: true,
                    composed: true
                })
            );
        } else {
            this.dispatchEvent(
                new CustomEvent('tab-select', {
                    detail: { index },
                    bubbles: true,
                    composed: true
                })
            );
        }
    }

    private _handleDoubleClick(index: number, tab: TabDefinition) {
        if (tab.type === 'sheet' || tab.type === 'document' || tab.type === 'root') {
            this.dispatchEvent(
                new CustomEvent('tab-edit-start', {
                    detail: { index },
                    bubbles: true,
                    composed: true
                })
            );
        }
    }

    private _handleContextMenu(e: MouseEvent, index: number, tab: TabDefinition) {
        if (tab.type === 'add-sheet') return;
        e.preventDefault();
        this.dispatchEvent(
            new CustomEvent('tab-context-menu', {
                detail: {
                    x: e.clientX,
                    y: e.clientY,
                    index,
                    tabType: tab.type
                },
                bubbles: true,
                composed: true
            })
        );
    }

    private _handleInputKeydown(e: KeyboardEvent) {
        if (isRealEnterKey(e) || e.key === 'Escape') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
        }
    }

    private _handleInputBlur(e: FocusEvent, index: number, tab: TabDefinition) {
        const newName = (e.target as HTMLInputElement).value;
        this.dispatchEvent(
            new CustomEvent('tab-rename', {
                detail: { index, newName, tab },
                bubbles: true,
                composed: true
            })
        );
    }

    // Mouse-based drag handlers
    private _handleMouseDown(e: MouseEvent, index: number, tab: TabDefinition) {
        // Blur any currently focused element to ensure editing components
        // (e.g., document textarea) properly receive the blur event
        // We need to traverse Shadow DOM boundaries to find the actual focused element
        let activeElement = document.activeElement as HTMLElement | null;
        while (activeElement?.shadowRoot?.activeElement) {
            activeElement = activeElement.shadowRoot.activeElement as HTMLElement;
        }
        if (activeElement && typeof activeElement.blur === 'function') {
            activeElement.blur();
        }

        if (tab.type === 'add-sheet' || tab.type === 'root') return;
        if (this.editingIndex === index) return;
        this._dragCtrl.startPotentialDrag(e, index);
    }

    private _handleMouseMove(e: MouseEvent, index: number, tab: TabDefinition) {
        if (!this._dragCtrl.isDragging) return;
        if (tab.type === 'add-sheet' || tab.type === 'root') return;

        const target = e.currentTarget as HTMLElement;
        this._dragCtrl.updateDropTarget(index, target, e.clientX);
    }

    private _handleMouseLeave() {
        if (this._dragCtrl.isDragging) {
            this._dragCtrl.clearDropTarget();
        }
    }

    private _renderTabIcon(tab: TabDefinition) {
        if (tab.type === 'sheet') {
            return html`<span class="codicon codicon-table"></span>`;
        } else if (tab.type === 'document') {
            return html`<span class="codicon codicon-file"></span>`;
        } else if (tab.type === 'root') {
            return html`<span class="codicon codicon-home"></span>`;
        } else if (tab.type === 'add-sheet') {
            return html`<span class="codicon codicon-add"></span>`;
        } else if (tab.type === 'onboarding') {
            return html`<span class="codicon codicon-add"></span>`;
        }
        return html``;
    }

    render() {
        const isDragging = this._dragCtrl.isDragging;
        const targetIndex = this._dragCtrl.targetIndex;
        const targetSide = this._dragCtrl.targetSide;
        const sourceIndex = this._dragCtrl.dragSourceIndex;

        return html`
            <div class="bottom-tabs-container">
                <div class="bottom-tabs" @scroll="${this._handleScroll}">
                    ${this.tabs.map(
                        (tab, index) => html`
                            <div
                                class="tab-item ${this.activeIndex === index ? 'active' : ''} ${tab.type === 'add-sheet'
                                    ? 'add-sheet-tab'
                                    : ''} ${isDragging && sourceIndex === index ? 'dragging' : ''} ${targetIndex ===
                                    index && targetSide === 'left'
                                    ? 'drag-over-left'
                                    : ''} ${targetIndex === index && targetSide === 'right' ? 'drag-over-right' : ''}"
                                @mousedown="${(e: MouseEvent) => this._handleMouseDown(e, index, tab)}"
                                @mousemove="${(e: MouseEvent) => this._handleMouseMove(e, index, tab)}"
                                @mouseleave="${this._handleMouseLeave}"
                                @click="${(e: MouseEvent) => this._handleTabClick(e, index, tab)}"
                                @dblclick="${() => this._handleDoubleClick(index, tab)}"
                                @contextmenu="${(e: MouseEvent) => this._handleContextMenu(e, index, tab)}"
                                title="${tab.type === 'add-sheet' ? t('addNewSheet') : ''}"
                                data-index="${index}"
                            >
                                ${this._renderTabIcon(tab)}
                                ${this.editingIndex === index
                                    ? html`
                                          <input
                                              class="tab-input"
                                              .value="${tab.title}"
                                              @click="${(e: Event) => e.stopPropagation()}"
                                              @dblclick="${(e: Event) => e.stopPropagation()}"
                                              @mousedown="${(e: Event) => e.stopPropagation()}"
                                              @keydown="${this._handleInputKeydown}"
                                              @blur="${(e: FocusEvent) => this._handleInputBlur(e, index, tab)}"
                                          />
                                      `
                                    : html` ${tab.type !== 'add-sheet' ? tab.title : ''} `}
                            </div>
                        `
                    )}
                </div>
                <div class="scroll-indicator-right ${this._isScrollableRight ? 'visible' : ''}"></div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'bottom-tabs': BottomTabs;
    }
}
