const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
process.chdir(root);
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Make It Home requires Node.js 22 or newer. https://nodejs.org/');
  process.exit(1);
}
let installed = true;
try { require('sharp'); require('tesseract.js'); } catch { installed = false; }
if (!installed) {
  console.log('First start: installing locked dependencies. Internet access is required.');
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'], {stdio: 'inherit', windowsHide: true})
    : spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error('Installation failed. Check your network, then run npm ci and retry.');
    process.exit(1);
  }
}
const child = spawn(process.execPath, ['server.cjs'], {
  cwd: root, env: process.env, stdio: ['inherit', 'inherit', 'inherit', 'ipc']
});
let opened = false;
child.on('message', message => {
  if (opened || message.type !== 'ready' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) return;
  opened = true;
  console.log('Open in your browser: ' + message.url);
  if (process.env.NO_OPEN === '1') return;
  const [command, args] = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'start "" ' + message.url]]
    : process.platform === 'darwin' ? ['open', [message.url]] : ['xdg-open', [message.url]];
  const browser = spawn(command, args, {stdio: 'ignore', windowsHide: true});
  browser.on('error', () => console.error('Please open this address manually: ' + message.url));
  browser.on('exit', code => { if (code) console.error('Please open this address manually: ' + message.url); });
  browser.unref();
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
