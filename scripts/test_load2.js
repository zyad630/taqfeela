const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('../electron/db');

// Register ipc handlers as in electron/main.js
require('../electron/main'); // wait, electron/main.js has app.whenReady too
