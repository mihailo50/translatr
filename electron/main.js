const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const isDev = process.env.NODE_ENV !== "production";

let mainWindow;
let nextServer = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app
  if (isDev) {
    // In development, load from Next.js dev server (HTTPS)
    mainWindow.loadURL("https://localhost:3000");
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
    // Ignore certificate errors in development (self-signed certs)
    mainWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
      callback(0); // Accept all certificates in dev
    });
  } else {
    // In production, start Next.js server and load from it
    const port = 3000;
    const nextPath = path.join(__dirname, "..");
    
    // Start Next.js production server
    nextServer = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", port.toString()], {
      cwd: nextPath,
      env: { ...process.env, PORT: port.toString() },
    });

    nextServer.stdout.on("data", (data) => {
      console.log(`Next.js: ${data}`);
    });

    nextServer.stderr.on("data", (data) => {
      console.error(`Next.js error: ${data}`);
    });

    // Wait for server to be ready, then load the app
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    }, 3000);
  }

  // Emitted when the window is closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Kill Next.js server if it's running
    if (nextServer) {
      nextServer.kill();
    }
    app.quit();
  }
});

// Cleanup on app quit
app.on("before-quit", () => {
  if (nextServer) {
    nextServer.kill();
  }
});
