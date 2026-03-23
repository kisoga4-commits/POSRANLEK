const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const si = require('systeminformation');

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

const getPrimaryHddSerial = async () => {
  const disks = await si.diskLayout();
  const primary = disks.find((disk) => disk?.serialNum && String(disk.serialNum).trim());
  return (primary?.serialNum || '').trim();
};

ipcMain.handle('get-machine-id', async () => {
  try {
    const serial = await getPrimaryHddSerial();
    if (serial) {
      return `HDD-${serial.toUpperCase()}`;
    }
  } catch (error) {
    console.error('Failed to get HDD serial:', error);
  }
  return '';
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
