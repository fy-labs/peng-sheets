import * as vscode from 'vscode';

import { SpreadsheetEditorProvider } from './spreadsheet-editor-provider';
import { getDefaultColumnNames } from './i18n-utils';

export function activate(context: vscode.ExtensionContext) {
    // Register Custom Editor Provider
    context.subscriptions.push(SpreadsheetEditorProvider.register(context));

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('pengSheets.validation')) {
                const newConfig = vscode.workspace.getConfiguration('pengSheets.validation');
                SpreadsheetEditorProvider.postMessageToActive({
                    type: 'update_config',
                    config: { validation: newConfig }
                });
            }
        })
    );

    // New Workbook command: create a new .md file with workbook template
    context.subscriptions.push(vscode.commands.registerCommand('peng-sheets.newWorkbook', newWorkbookHandler));

    // Open Editor command (wrapper for vscode.openWith)
    const openEditorFunction = async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                editor.document.uri,
                SpreadsheetEditorProvider.viewType
            );
        } else {
            vscode.window.showErrorMessage('No active editor found to open.');
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('peng-sheets.openEditor', openEditorFunction));

    // Open Editor from Context Menu command
    context.subscriptions.push(
        vscode.commands.registerCommand('peng-sheets.openEditorFromContextMenu', async (uri: vscode.Uri) => {
            if (uri) {
                await vscode.commands.executeCommand('vscode.openWith', uri, SpreadsheetEditorProvider.viewType);
            } else {
                // Fallback if no URI provided (though unlikely from context menu)
                openEditorFunction();
            }
        })
    );

    // Insert current date command (Excel-like: Ctrl+;)
    context.subscriptions.push(
        vscode.commands.registerCommand('peng-sheets.insertDate', () => {
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
            SpreadsheetEditorProvider.postMessageToActive({
                type: 'insertValue',
                value: dateStr
            });
        })
    );

    // Insert current time command (Excel-like: Ctrl+Shift+;)
    context.subscriptions.push(
        vscode.commands.registerCommand('peng-sheets.insertTime', () => {
            const now = new Date();
            const timeStr = now.toTimeString().slice(0, 5); // HH:MM
            SpreadsheetEditorProvider.postMessageToActive({
                type: 'insertValue',
                value: timeStr
            });
        })
    );

    // Insert copied cells command (Excel-like: Ctrl+Shift+=)
    context.subscriptions.push(
        vscode.commands.registerCommand('peng-sheets.insertCopiedCells', () => {
            SpreadsheetEditorProvider.postMessageToActive({
                type: 'insertCopiedCells'
            });
        })
    );
}

export function deactivate() {}

export async function newWorkbookHandler() {
    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    let uri: vscode.Uri | undefined;

    if (workspaceFolder) {
        // Prompt for filename if in workspace
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter filename for new workbook',
            value: 'workbook.md',
            validateInput: (value) => {
                if (!value) {
                    return 'Filename is required';
                }
                if (!value.endsWith('.md')) {
                    return 'Filename must end with .md';
                }
                return null;
            }
        });

        if (!fileName) return;
        uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
    } else {
        // No workspace: use save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('workbook.md'),
            filters: { Markdown: ['md'] }
        });
        if (!saveUri) return;
        uri = saveUri;
    }

    // Create template content
    const config = vscode.workspace.getConfiguration('pengSheets.parsing');
    const rootMarker = config.get<string>('rootMarker') || '# Workbook';
    const [col1, col2, col3] = getDefaultColumnNames();
    const template = `${rootMarker}\n\n## Sheet 1\n\n### Table 1\n\n| ${col1} | ${col2} | ${col3} |\n|---|---|---|\n|   |   |   |\n`;

    // Write file
    await vscode.workspace.fs.writeFile(uri, Buffer.from(template, 'utf8'));

    // Open using Custom Editor
    // This assumes the user wants to edit it immediately in the spreadsheet view.
    await vscode.commands.executeCommand('vscode.openWith', uri, SpreadsheetEditorProvider.viewType);
}

export function getWebviewContent(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
): string {
    const isProduction = context.extensionMode === vscode.ExtensionMode.Production;
    let scriptUri: vscode.Uri | string;
    let codiconFontUri: vscode.Uri | string;
    let cspScriptSrc: string;
    let cspConnectSrc: string;
    let cspFontSrc: string;
    let viteClient = '';

    if (isProduction) {
        scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'main.js'));
        codiconFontUri = webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'codicon.ttf')
        );

        cspScriptSrc = `'unsafe-eval' ${webview.cspSource}`;
        cspConnectSrc = `${webview.cspSource}`;
        cspFontSrc = `${webview.cspSource}`;
    } else {
        scriptUri = 'http://localhost:5173/webview-ui/main.ts';
        codiconFontUri = 'http://localhost:5173/node_modules/@vscode/codicons/dist/codicon.ttf';

        cspScriptSrc = `'unsafe-eval' http://localhost:5173`;
        cspConnectSrc = `http://localhost:5173 ws://localhost:5173 ${webview.cspSource}`;
        cspFontSrc = `http://localhost:5173 ${webview.cspSource}`;
        viteClient = '<script type="module" src="http://localhost:5173/@vite/client"></script>';
    }

    const config = vscode.workspace.getConfiguration('pengSheets.parsing');
    const validationConfig = vscode.workspace.getConfiguration('pengSheets.validation');
    const initialConfig = {
        ...config,
        validation: validationConfig
    };
    const generalConfig = vscode.workspace.getConfiguration('pengSheets');
    const languageSetting = generalConfig.get<string>('language') || 'auto';
    const extensionLanguage = languageSetting === 'auto' ? vscode.env.language : languageSetting;
    const initialContent = document.getText();
    const escapedContent = initialContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src ${cspFontSrc}; script-src 'unsafe-inline' ${cspScriptSrc}; connect-src ${cspConnectSrc};">
        <title>Markdown Spreadsheet</title>
        <style>
            @font-face {
                font-family: "codicon";
                src: url("${codiconFontUri}") format("truetype");
            }
            
            html, body {
                padding: 0;
                margin: 0;
                height: 100%;
            }

            /* Loading Indicator - Material Design Style */
            .loading-container {
                position: fixed;
                top: 0;
                left: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                width: 100%;
                background: var(--vscode-editor-background);
                z-index: 9999;
            }

            .loader {
                font-family: var(--vscode-font-family), system-ui, -apple-system, sans-serif;
                font-size: 1.25rem;
                font-weight: 500;
                letter-spacing: 0.15em;
                color: var(--vscode-foreground);
                opacity: 0.5;
                display: flex;
                gap: 0.08em;
            }

            .loader span {
                display: inline-block;
                animation: wave 1.4s ease-in-out infinite;
            }

            .loader span:nth-child(1) { animation-delay: 0s; }
            .loader span:nth-child(2) { animation-delay: 0.05s; }
            .loader span:nth-child(3) { animation-delay: 0.1s; }
            .loader span:nth-child(4) { animation-delay: 0.15s; }
            .loader span:nth-child(5) { animation-delay: 0.2s; }
            .loader span:nth-child(6) { animation-delay: 0.25s; }
            .loader span:nth-child(7) { animation-delay: 0.3s; }
            .loader span:nth-child(8) { animation-delay: 0.35s; }
            .loader span:nth-child(9) { animation-delay: 0.4s; }
            .loader span:nth-child(10) { animation-delay: 0.45s; }

            @keyframes wave {
                0%, 60%, 100% {
                    transform: translateY(0);
                    opacity: 1;
                }
                30% {
                    transform: translateY(-0.25em);
                    opacity: 0.6;
                }
            }
        </style>
    </head>
    <body>
        <md-spreadsheet-editor></md-spreadsheet-editor>
        <div class="loading-container"><div class="loader"><span>N</span><span>o</span><span>w</span><span>&nbsp;</span><span>L</span><span>o</span><span>a</span><span>d</span><span>i</span><span>n</span><span>g</span><span>.</span><span>.</span><span>.</span></div></div>
        <script>
            window.vscodeLanguage = ${JSON.stringify(extensionLanguage)};
            window.initialContent = \`${escapedContent}\`;
            window.initialConfig = ${JSON.stringify(initialConfig)};
        </script>
        ${viteClient}
        <script type="module" src="${scriptUri}"></script>
    </body>
    </html>`;
}
