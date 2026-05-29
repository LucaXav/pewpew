#!/usr/bin/env node
// CLI launcher: `vibeshift` starts the overlay (detached, no console window).
// Made available by `npm link` or `npm install -g .` (adds a `vibeshift` command).
const { spawn } = require("child_process");
const path = require("path");

// When required outside an Electron runtime, `electron` resolves to the path
// of the bundled Electron executable.
let electron;
try {
  electron = require("electron");
} catch (e) {
  console.error("Electron is not installed. Run `npm install` in the vibeshift folder first.");
  process.exit(1);
}

const appDir = path.join(__dirname, "..");
const child = spawn(electron, [appDir], {
  detached: true,
  stdio: "ignore",
});
child.unref();
console.log("Vibe Shift launched.");
