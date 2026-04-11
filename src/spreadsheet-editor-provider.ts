import * as vscode from 'vscode';

import { getWebviewContent } from './extension';
import { MessageDispatcher } from './message-dispatcher';

export class SpreadsheetEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'peng-sheets.editor';

    // Track all active webview panels
    private static activePanels: Map<string, vscode.WebviewPanel> = new Map();
    private static currentActiveUri: string | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new SpreadsheetEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            SpreadsheetEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                    enableFindWidget: true
                }
            }
        );
        return providerRegistration;
    }

    /**
     * Post a message to the currently active webview panel
     */
    public static postMessageToActive(message: unknown): boolean {
        if (SpreadsheetEditorProvider.currentActiveUri) {
            const panel = SpreadsheetEditorProvider.activePanels.get(SpreadsheetEditorProvider.currentActiveUri);
            if (panel) {
                panel.webview.postMessage(message);
                return true;
            }
        }
        return false;
    }

    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Allow the webview to load resources from:
        // 1. Extension's own output directory
        // 2. Extension's resources directory
        // 3. The document's directory (for relative image paths)
        // 4. All workspace folders
        const localResourceRoots: vscode.Uri[] = [
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
            vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
            vscode.Uri.file(document.uri.fsPath).with({ path: document.uri.path.replace(/\/[^/]+$/, '') })
        ];
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            localResourceRoots.push(folder.uri);
        }
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, this.context, document);

        let isSaving = false;

        const dispatcher = new MessageDispatcher({
            activeDocument: document,
            webviewPanel: webviewPanel,
            getSavingState: () => isSaving,
            setSavingState: (state) => {
                isSaving = state;
            }
        });

        // Hook up event handlers so that we can synchronize the webview with the text document.
        //
        // The text document acts as our model, so we have to sync change in the document to our
        // editor and sync changes in the editor back to the document.
        //
        // Remember that a single text document can also be shared between multiple custom
        // editors (this happens for example when you split a custom editor)

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
                webviewPanel.webview.postMessage({
                    type: 'update',
                    content: e.document.getText()
                });
            }
        });

        const changeConfigSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('pengSheets.parsing')) {
                webviewPanel.webview.postMessage({
                    type: 'configUpdate',
                    config: vscode.workspace.getConfiguration('pengSheets.parsing')
                });
            }
        });

        // Receive message from the webview.
        webviewPanel.webview.onDidReceiveMessage((e) => {
            dispatcher.dispatch(e);
        });

        // Track this panel
        const docUri = document.uri.toString();
        SpreadsheetEditorProvider.activePanels.set(docUri, webviewPanel);

        // Track when this panel becomes active/inactive
        webviewPanel.onDidChangeViewState((e) => {
            if (e.webviewPanel.active) {
                SpreadsheetEditorProvider.currentActiveUri = docUri;
            } else if (SpreadsheetEditorProvider.currentActiveUri === docUri) {
                SpreadsheetEditorProvider.currentActiveUri = undefined;
            }
        });

        // Set as active if it's currently visible
        if (webviewPanel.active) {
            SpreadsheetEditorProvider.currentActiveUri = docUri;
        }

        // Make sure we get rid of the listener when our editor is closed.
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            changeConfigSubscription.dispose();
            SpreadsheetEditorProvider.activePanels.delete(docUri);
            if (SpreadsheetEditorProvider.currentActiveUri === docUri) {
                SpreadsheetEditorProvider.currentActiveUri = undefined;
            }
        });

        // Initial update
        webviewPanel.webview.postMessage({
            type: 'update',
            content: document.getText()
        });
    }
}
