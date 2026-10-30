const { app, BrowserWindow, Menu, net, protocol, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('重返木卫三');
let window;

async function openGame() {
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('game', async request => {
    const url = new URL(request.url);
    if (url.host !== 'local') return new Response('Not found', { status: 404 });
    let relative;
    try { relative = decodeURIComponent(url.pathname); } catch { return new Response('Bad path', { status: 400 }); }
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const result = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(result.headers);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'");
      return new Response(result.body, { status: result.status, headers });
    } catch { return new Response('Resource not found', { status: 404 }); }
  });
  const permitted = (contents, permission) => permission === 'pointerLock' && contents?.getURL().startsWith('game://local/');
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(permitted(contents, permission)));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => permitted(contents, permission));
  window = new BrowserWindow({
    width: 1366, height: 768, minWidth: 960, minHeight: 640, useContentSize: true,
    title: '重返木卫三 · 开发候选', backgroundColor: '#17232e',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('game://local/')) event.preventDefault(); });
  window.webContents.on('console-message', event => {
    if (event.level === 'error') console.error('[renderer]', event.message);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '重返木卫三', submenu: [{ role: 'quit', label: '退出游戏' }] },
    { label: '窗口', submenu: [{ role: 'togglefullscreen', label: '切换全屏' }, { role: 'minimize', label: '最小化' }] },
  ]));
  await window.loadURL('game://local/index.html');
  window.on('closed', () => { window = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(openGame).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
