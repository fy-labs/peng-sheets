export interface UpdateRangeMessage {
    type: 'updateRange';
    startLine: number;
    endLine: number;
    endCol?: number;
    content: string;
    undoStopBefore?: boolean;
    undoStopAfter?: boolean;
}

export interface BatchUpdateMessage {
    type: 'batchUpdate';
    updates: Omit<UpdateRangeMessage, 'type'>[];
}

export interface UndoMessage {
    type: 'undo';
}

export interface RedoMessage {
    type: 'redo';
}

export interface CreateSpreadsheetMessage {
    type: 'createSpreadsheet';
}

export interface SaveMessage {
    type: 'save';
}

export interface SaveImageMessage {
    type: 'saveImage';
    messageId: string;
    fileName: string;
    fileData: string; // base64 encoded
}

export interface UpdateOrConfigMessage {
    // Messages sent FROM extension TO webview, leaving here for completeness or future use if needed, but primarily we are defining From Webview types.
    type: 'update' | 'configUpdate';
    content?: string;
    config?: unknown;
}

export type WebviewMessage =
    | UpdateRangeMessage
    | BatchUpdateMessage
    | UndoMessage
    | RedoMessage
    | CreateSpreadsheetMessage
    | SaveMessage
    | SaveImageMessage;
