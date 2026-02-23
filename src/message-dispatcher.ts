import * as vscode from 'vscode';
import { WebviewMessage, UpdateRangeMessage, BatchUpdateMessage } from './types/messages';

export interface HandlerContext {
    activeDocument: vscode.TextDocument | undefined;
    webviewPanel: vscode.WebviewPanel | undefined;
    setSavingState: (isSaving: boolean) => void;
    getSavingState: () => boolean;
}

export class MessageDispatcher {
    private _messageQueue: Promise<void> = Promise.resolve();

    constructor(private context: HandlerContext) {}

    public async dispatch(message: unknown): Promise<void> {
        if (!this.isValidMessage(message)) {
            console.warn('Received invalid message format:', message);
            return;
        }

        // process message sequentially
        const processingPromise = this._messageQueue
            .then(async () => {
                await this._dispatchInner(message as WebviewMessage);
            })
            .catch((err) => {
                console.error('Error processing message:', err);
            });

        this._messageQueue = processingPromise;
        return processingPromise;
    }

    private async _dispatchInner(message: WebviewMessage): Promise<void> {
        switch (message.type) {
            case 'updateRange':
                await this.handleUpdateRange(message);
                break;
            case 'batchUpdate':
                await this.handleBatchUpdate(message);
                break;

            case 'save':
                await this.handleSave();
                break;
            case 'undo':
                await this.handleUndo();
                break;
            case 'redo':
                await this.handleRedo();
                break;
        }
    }

    private isValidMessage(message: unknown): message is WebviewMessage {
        const msg = message as { type?: unknown };
        return (
            !!message &&
            typeof message === 'object' &&
            typeof msg.type === 'string' &&
            typeof msg.type === 'string' &&
            ['updateRange', 'batchUpdate', 'save', 'undo', 'redo'].includes(msg.type)
        );
    }

    private async handleUpdateRange(message: UpdateRangeMessage) {
        if (!this.context.activeDocument) {
            console.error('No active document!');
            return;
        }

        const { activeDocument } = this.context;

        // DEBUG: Log the received message
        console.log('[UpdateRange] Received:', {
            startLine: message.startLine,
            endLine: message.endLine,
            endCol: message.endCol,
            contentLines: message.content?.split('\n').length,
            contentPreview: message.content?.substring(0, 100)
        });
        console.log('[UpdateRange] Document lineCount:', activeDocument.lineCount);

        const startPosition = new vscode.Position(message.startLine, 0);
        // Clamp endLine to valid document range, then get end of line for full replacement
        const safeEndLine = Math.min(message.endLine, activeDocument.lineCount - 1);
        const endCol = message.endCol ?? activeDocument.lineAt(safeEndLine).text.length;
        const endPosition = new vscode.Position(safeEndLine, endCol);
        const range = new vscode.Range(startPosition, endPosition);

        console.log('[UpdateRange] Calculated range:', {
            start: `${range.start.line}:${range.start.character}`,
            end: `${range.end.line}:${range.end.character}`,
            safeEndLine,
            endCol
        });

        // Find editor
        const editor = vscode.window.visibleTextEditors.find(
            (e) => e.document.uri.toString() === activeDocument.uri.toString()
        );

        let targetRange = range;
        const validatedRange = activeDocument.validateRange(range);
        if (!validatedRange.isEqual(range)) {
            console.log(
                `Adjusting invalid range: ${range.start.line}-${range.end.line} -> ${validatedRange.start.line}-${validatedRange.end.line}`
            );
        }
        targetRange = validatedRange;

        if (editor) {
            const success = await editor.edit(
                (editBuilder) => {
                    editBuilder.replace(targetRange, message.content);
                },
                {
                    undoStopBefore: message.undoStopBefore ?? true,
                    undoStopAfter: message.undoStopAfter ?? true
                }
            );

            if (!success) {
                console.warn('TextEditor.edit failed. Retrying with WorkspaceEdit...');
                const edit = new vscode.WorkspaceEdit();
                edit.replace(activeDocument.uri, targetRange, message.content);
                const wsSuccess = await vscode.workspace.applyEdit(edit);
                if (!wsSuccess) {
                    console.error('Fallback WorkspaceEdit failed.');
                    vscode.window.showErrorMessage('Failed to update spreadsheet: Sync error.');
                }
            }
        } else {
            // Fallback to WorkspaceEdit
            const edit = new vscode.WorkspaceEdit();
            edit.replace(activeDocument.uri, targetRange, message.content);
            const success = await vscode.workspace.applyEdit(edit);
            if (!success) {
                console.error('Workspace edit failed');
                vscode.window.showErrorMessage('Failed to update spreadsheet: Document version conflict.');
            }
        }
    }

    private async handleBatchUpdate(message: BatchUpdateMessage) {
        const activeDoc = this.context.activeDocument;
        if (!activeDoc) {
            return;
        }

        const activeEditor = vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === activeDoc.uri.toString()
        );

        if (!activeEditor) {
            const edit = new vscode.WorkspaceEdit();
            const uri = activeDoc.uri;

            for (const update of message.updates) {
                const startPos = new vscode.Position(update.startLine, 0);
                // Clamp endLine to valid document range, then get end of line for full replacement
                const safeEndLine = Math.min(update.endLine, activeDoc.lineCount - 1);
                const endCol = update.endCol ?? activeDoc.lineAt(safeEndLine).text.length;
                const endPos = new vscode.Position(safeEndLine, endCol);
                const range = new vscode.Range(startPos, endPos);

                // Validate range against the document
                const validatedRange = activeDoc.validateRange(range);

                if (update.content !== undefined) {
                    edit.replace(uri, validatedRange, update.content);
                }
            }

            const success = await vscode.workspace.applyEdit(edit);
            if (!success) {
                console.error('[MessageDispatcher] Fallback WorkspaceEdit failed.');
                vscode.window.showErrorMessage('Failed to apply batch updates (Sync error).');
            }
            return;
        }

        if (message.updates.length === 0) return;

        const firstUpdate = message.updates[0];
        const lastUpdate = message.updates[message.updates.length - 1];

        const success = await activeEditor.edit(
            (editBuilder) => {
                for (const update of message.updates) {
                    const startPos = new vscode.Position(update.startLine, 0);
                    // Clamp endLine to valid document range, then get end of line for full replacement
                    const safeEndLine = Math.min(update.endLine, this.context.activeDocument!.lineCount - 1);
                    const endCol = update.endCol ?? this.context.activeDocument!.lineAt(safeEndLine).text.length;
                    const endPos = new vscode.Position(safeEndLine, endCol);
                    const range = new vscode.Range(startPos, endPos);
                    const validatedRange = this.context.activeDocument!.validateRange(range);

                    if (update.content !== undefined) {
                        editBuilder.replace(validatedRange, update.content);
                    }
                }
            },
            {
                undoStopBefore: firstUpdate.undoStopBefore ?? true,
                undoStopAfter: lastUpdate.undoStopAfter ?? true
            }
        );

        if (!success) {
            vscode.window.showErrorMessage('Failed to apply batch updates.');
        }
    }

    private async handleSave() {
        console.log('Received save request');
        if (this.context.getSavingState()) {
            console.log('Save already in progress, skipping');
            return;
        }

        this.context.setSavingState(true);

        try {
            const { activeDocument } = this.context;
            if (activeDocument) {
                if (activeDocument.isDirty) {
                    const saved = await activeDocument.save();
                    // save() can return false if document was already saved by VS Code's
                    // native Ctrl+S handler or auto-save - this is normal, not an error
                    if (!saved) {
                        console.log('Document already saved by another process');
                    }
                } else {
                    console.log('Document is not dirty, nothing to save');
                }
            } else {
                console.error('No active document to save');
                vscode.window.showErrorMessage('No active document to save.');
            }
        } catch (error) {
            console.error('Error saving document:', error);
            vscode.window.showErrorMessage('Failed to save document.');
        } finally {
            this.context.setSavingState(false);
        }
    }

    private async handleUndo() {
        await vscode.commands.executeCommand('undo');
    }

    private async handleRedo() {
        await vscode.commands.executeCommand('redo');
    }
}
