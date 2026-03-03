// desktop/electron/main.js
"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

let mainWindow = null;
let pythonProcess = null;
const SERVER_PORT = 8765;

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
    `http://127.0.0.1:${SERVER_PORT}/health`,
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

function createWindow(splash) {
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
      // sandbox omitted: contextIsolation provides isolation without the
      // stricter Chromium sandbox that can silently block localhost rendering
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}/dashboards`);

  let shown = false;
  let fallbackTimer = null;

  // Reveal the main window and dismiss the splash.
  // Called either by ready-to-show or by the 8-second fallback.
  function revealWindow() {
    if (shown) return;
    shown = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus(); // bring window to front on macOS
    }
    if (splash && !splash.isDestroyed()) splash.close();
  }

  // Preferred path: page finished first paint
  mainWindow.once("ready-to-show", () => {
    console.log("[electron] ready-to-show fired");
    revealWindow();
  });

  // Fallback: show window after 8 s even if ready-to-show never fires
  // (can happen on some macOS configs with unsigned / first-run apps)
  fallbackTimer = setTimeout(() => {
    console.log("[electron] ready-to-show fallback — revealing window after 8s");
    revealWindow();
  }, 8000);

  // Log page load errors to aid debugging
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`[electron] Page failed to load: ${errorCode} ${errorDescription}`);
  });

  mainWindow.on("closed", () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    mainWindow = null;
  });

  // Open external links in the default browser, not inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${SERVER_PORT}`) || url.startsWith(`http://127.0.0.1:${SERVER_PORT}`)) {
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
    createWindow(splash);
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
