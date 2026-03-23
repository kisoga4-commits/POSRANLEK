const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  win.loadFile(path.join(__dirname, 'www', 'index.html'));
};

const getMachineFingerprint = () => {
  const network = os.networkInterfaces();
  const macs = Object.values(network)
    .flat()
    .filter((iface) => iface && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00')
    .map((iface) => iface.mac)
    .sort()
    .join('|');

  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    macs || 'NO_MAC'
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
};

ipcMain.handle('get-machine-id', async () => {
  const fingerprint = getMachineFingerprint();
  return fingerprint ? `PC-${fingerprint}` : '';
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
