const vscode = require('vscode');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const URL = 'http://127.0.0.1:8765';
let serverProcess;
let output;

function serverIsReady() {
  return new Promise(resolve => {
    const request = http.get(`${URL}/api/graph`, { timeout: 800 }, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function findProjectRoot() {
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const candidate = path.join(folder.uri.fsPath, 'app.py');
    if (fs.existsSync(candidate)) return folder.uri.fsPath;
  }
  return undefined;
}

async function waitUntilReady(attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    if (await serverIsReady()) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function openPaperWeave() {
  const root = findProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('请先在 VS Code 中打开“论文工具”文件夹。');
    return;
  }

  if (!(await serverIsReady())) {
    output.show(true);
    output.appendLine('正在启动 PaperWeave…');
    serverProcess = spawn('python', ['app.py', '--no-browser'], {
      cwd: root,
      windowsHide: true,
      env: process.env
    });
    serverProcess.stdout.on('data', data => output.append(data.toString()));
    serverProcess.stderr.on('data', data => output.append(data.toString()));
    serverProcess.on('error', error => {
      output.appendLine(`启动失败：${error.message}`);
      vscode.window.showErrorMessage('PaperWeave 启动失败，请查看“PaperWeave”输出。');
    });
    if (!(await waitUntilReady())) {
      vscode.window.showErrorMessage('PaperWeave 没有成功启动，请查看“PaperWeave”输出。');
      return;
    }
  }

  await vscode.commands.executeCommand('simpleBrowser.show', URL);
}

function activate(context) {
  output = vscode.window.createOutputChannel('PaperWeave');
  const command = vscode.commands.registerCommand('paperweave.open', openPaperWeave);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = '$(book) PaperWeave';
  status.tooltip = '在 VS Code 中打开 PaperWeave';
  status.command = 'paperweave.open';
  status.show();
  context.subscriptions.push(output, command, status);
}

function deactivate() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
}

module.exports = { activate, deactivate };
