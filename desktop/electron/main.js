// desktop/electron/main.js
"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

let mainWindow = null;
let pythonProcess = null;
const SERVER_PORT = 8000;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Path to the PyInstaller binary directory (inside the packaged .app). */
function getServerBinaryPath() {
  if (app.isPackaged) {
    // electron-builder extraResources puts the COLLECT output here:
    //   MyApp.app/Contents/Resources/api-server/story-analytics-api/story-analytics-api
    return path.join(
      process.resourcesPath,
      "api-server",
      "story-analytics-api",
      "story-analytics-api"
    );
  }
  // Dev mode: no binary — assumes Python server is running separately.
  return null;
}

/** User data directory: ~/Library/Application Support/StoryAnalytics/data */
function getUserDataDir() {
  return path.join(app.getPath("userData"), "data");
}

// ---------------------------------------------------------------------------
// Python server lifecycle
// ---------------------------------------------------------------------------

function startPythonServer() {
  const binaryPath = getServerBinaryPath();
  if (!binaryPath) {
    console.log("[electron] Dev mode — Python server not managed by Electron");
    return;
  }
  if (!fs.existsSync(binaryPath)) {
    console.error(`[electron] Binary not found: ${binaryPath}`);
    return;
  }

  const dataDir = getUserDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const env = Object.assign({}, process.env, {
    // Point storage and SQLite at the user's writable data directory.
    // These env vars are already supported by the app — no code changes needed.
    STORAGE_LOCAL_DIR: dataDir,
    DATABASE_URL: `sqlite:///${path.join(dataDir, "metadata.db")}`,
    PORT: String(SERVER_PORT),
  });

  console.log(`[electron] Spawning Python server: ${binaryPath}`);
  pythonProcess = spawn(binaryPath, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (d) =>
    process.stdout.write(`[api] ${d}`)
  );
  pythonProcess.stderr.on("data", (d) =>
    process.stderr.write(`[api] ${d}`)
  );
  pythonProcess.on("exit", (code) =>
    console.log(`[electron] Python server exited (code ${code})`)
  );
}

// ---------------------------------------------------------------------------
// Health polling
// ---------------------------------------------------------------------------

function pollForServer(onReady, attempts = 0, maxAttempts = 120) {
  if (attempts >= maxAttempts) {
    console.error("[electron] Server did not start in time — quitting");
    app.quit();
    return;
  }

  const req = http.get(
    `http://localhost:${SERVER_PORT}/health`,
    { timeout: 1000 },
    (res) => {
      if (res.statusCode === 200) {
        console.log("[electron] Server ready");
        onReady();
      } else {
        setTimeout(() => pollForServer(onReady, attempts + 1, maxAttempts), 500);
      }
    }
  );

  req.on("error", () =>
    setTimeout(() => pollForServer(onReady, attempts + 1, maxAttempts), 500)
  );
  req.on("timeout", () => {
    req.destroy();
    setTimeout(() => pollForServer(onReady, attempts + 1, maxAttempts), 500);
  });
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Story Analytics",
    show: false, // avoid blank flash — show after first paint
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}/dashboards`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in the default browser, not inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${SERVER_PORT}`)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ---------------------------------------------------------------------------
// Loading splash (shown while Python starts)
// ---------------------------------------------------------------------------

function createSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    resizable: false,
    center: true,
    backgroundColor: "#0f172a",
  });

  splash.loadURL(
    "data:text/html," +
      encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <body style="
      background:#0f172a;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      height:100vh;
      margin:0;
      font-family:-apple-system,system-ui;
      color:white;
      -webkit-app-region:drag;
    ">
      <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin-bottom:10px;">
        Story Analytics
      </div>
      <div style="font-size:13px;color:#64748b;">Starting up...</div>
    </body>
    </html>
  `)
  );

  return splash;
}

// ---------------------------------------------------------------------------
// App menu (native macOS menu bar)
// ---------------------------------------------------------------------------

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  buildMenu();
  startPythonServer();

  const splash = createSplash();

  pollForServer(() => {
    createWindow();
    // Close splash after main window is ready to show
    mainWindow.once("ready-to-show", () => splash.close());
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep the app running even when all windows are closed (standard behavior).
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // Re-open the window when the dock icon is clicked (macOS convention).
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill("SIGTERM");
  }
});
