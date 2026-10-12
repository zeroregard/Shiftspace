import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { loaderMarkup, SIDEBAR_LOADER_SIZE } from '@shiftspace/renderer';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  mode: 'full' | 'sidebar' = 'full'
): string {
  const nonce = crypto.randomBytes(16).toString('hex');

  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.iife.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.css')
  );
  const themeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'vscode-theme.css')
  );
  const codiconsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'codicons', 'codicon.css')
  );

  // The sidebar paints its loader straight from the HTML so it shows the
  // moment the view opens, instead of after the whole JS bundle has loaded.
  // React replaces it on mount with an identical loader until data arrives.
  const bootContent =
    mode === 'sidebar'
      ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${loaderMarkup(SIDEBAR_LOADER_SIZE)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>Shiftspace</title>
  <link href="${cssUri}" rel="stylesheet">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${codiconsUri}" rel="stylesheet">
</head>
<body>
  <div id="root" data-mode="${mode}">${bootContent}</div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
