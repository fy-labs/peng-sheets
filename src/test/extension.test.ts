import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { getWebviewContent, newWorkbookHandler } from '../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(async () => {
        sandbox.restore();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('f-y.peng-sheets'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('f-y.peng-sheets');
        assert.ok(ext);
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive);
        }
    });

    test('Command: newWorkbook should register', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('peng-sheets.openEditor'));
        assert.ok(commands.includes('peng-sheets.newWorkbook'));
    });

    suite('getWebviewContent', () => {
        test('Should generate correct HTML content in Production mode', () => {
            const mockWebview = {
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: "'self'"
            } as vscode.Webview;

            const mockContext = {
                extensionUri: vscode.Uri.file('/mock/extension'),
                extensionMode: vscode.ExtensionMode.Production
            } as vscode.ExtensionContext;

            const mockDocument = {
                getText: () => 'Initial Content',
                uri: vscode.Uri.file('/test/path/document.md')
            } as vscode.TextDocument;

            const html = getWebviewContent(mockWebview, mockContext, mockDocument);

            assert.ok(html.includes('<title>Markdown Spreadsheet</title>'));
            assert.ok(html.includes('window.initialContent = `Initial Content`'));
            assert.ok(html.includes('window.vscodeLanguage = "en"'), 'Defaults to en if not specified'); // Assuming default env
        });

        test('Should generate correct HTML content in Development mode', () => {
            const mockWebview = {
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: "'self'"
            } as vscode.Webview;

            const mockContext = {
                extensionUri: vscode.Uri.file('/mock/extension'),
                extensionMode: vscode.ExtensionMode.Development
            } as vscode.ExtensionContext;

            const mockDocument = {
                getText: () => 'Initial Content',
                uri: vscode.Uri.file('/test/path/document.md')
            } as vscode.TextDocument;

            const html = getWebviewContent(mockWebview, mockContext, mockDocument);

            assert.ok(html.includes('http://localhost:5173'), 'Should include localhost in Dev mode');
            assert.ok(html.includes('type="module"'), 'Should use module script');
        });
    });

    suite('Command: newWorkbook', () => {
        test('Should create a new workbook in workspace', async () => {
            const writeFileStub = sandbox.stub();
            // Stub fs property on workspace
            sandbox.stub(vscode.workspace, 'fs').get(() => ({
                writeFile: writeFileStub
            }));

            sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
            const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
            const showInputBoxStub = sandbox.stub(vscode.window, 'showInputBox').resolves('test.md');

            // Mock workspace folder presence
            sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => [{ uri: vscode.Uri.file('/workspace') }]);

            await newWorkbookHandler();

            assert.ok(showInputBoxStub.calledOnce, 'showInputBox should be called');
            assert.ok(writeFileStub.calledOnce, 'writeFile should be called');

            assert.ok(
                executeCommandStub.calledWith('vscode.openWith', sinon.match.any, 'peng-sheets.editor'),
                'openWith command should be executed with correct viewType'
            );
        });

        test('Should create a new workbook via Save Dialog if no workspace', async () => {
            // Mock no workspace folders
            sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);

            const showSaveDialogStub = sandbox
                .stub(vscode.window, 'showSaveDialog')
                .resolves(vscode.Uri.file('/tmp/test.md'));

            const writeFileStub = sandbox.stub();
            sandbox.stub(vscode.workspace, 'fs').get(() => ({
                writeFile: writeFileStub
            }));

            sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
            sandbox.stub(vscode.commands, 'executeCommand').resolves();

            await newWorkbookHandler();

            assert.ok(showSaveDialogStub.calledOnce);
            assert.ok(writeFileStub.calledOnce);
        });
        test('Should handle validation logic in InputBox', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => [{ uri: vscode.Uri.file('/workspace') }]);

            let validateCallback: any;

            sandbox.stub(vscode.window, 'showInputBox').callsFake(async (options) => {
                validateCallback = options ? options.validateInput : undefined;
                return 'valid.md';
            });

            sandbox.stub(vscode.workspace, 'fs').get(() => ({ writeFile: sandbox.stub() }));
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
            sandbox.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
            sandbox.stub(vscode.commands, 'executeCommand').resolves();

            await newWorkbookHandler();

            assert.ok(validateCallback!);
            assert.strictEqual(validateCallback!(''), 'Filename is required');
            assert.strictEqual(validateCallback!('invalid'), 'Filename must end with .md');
            assert.strictEqual(validateCallback!('valid.md'), null);
        });

        test('Should handle cancellation in InputBox', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => [{ uri: vscode.Uri.file('/workspace') }]);

            const writeFileStub = sandbox.stub();
            sandbox.stub(vscode.workspace, 'fs').get(() => ({ writeFile: writeFileStub }));

            // Returns undefined (cancellation)
            sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);

            await newWorkbookHandler();

            assert.ok(writeFileStub.notCalled);
        });

        test('Should handle cancellation in SaveDialog', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);

            // Returns undefined (cancellation)
            sandbox.stub(vscode.window, 'showSaveDialog').resolves(undefined);
            const writeFileStub = sandbox.stub();
            sandbox.stub(vscode.workspace, 'fs').get(() => ({ writeFile: writeFileStub }));

            await newWorkbookHandler();

            assert.ok(writeFileStub.notCalled);
        });
    });
});
