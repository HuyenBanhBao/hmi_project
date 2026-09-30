import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const launcherScript = resolve(rootDir, "tools", "local_launcher_server.mjs");
const offlineDetailScript = resolve(rootDir, "tools", "offline_detail_server.mjs");
const defaultOfflineBuildingsPath = process.env.OFFLINE_BUILDINGS_GPKG || "/home/tung/osm_python/hanoi_buildings.gpkg";
const defaultOfflinePoisPath = process.env.OFFLINE_POIS_GPKG || "/home/tung/osm_python/hanoi_pois.gpkg";

const children = new Map();
let shuttingDown = false;
let shutdownSignal = "SIGTERM";

const removeChild = (name) => {
    children.delete(name);

    if (shuttingDown && children.size === 0) {
        process.exit(process.exitCode ?? 0);
    }
};

const stopChildren = (signal = "SIGTERM") => {
    shutdownSignal = signal;

    for (const child of children.values()) {
        if (!child.killed) {
            child.kill(signal);
        }
    }
};

const handleChildExit = (name, code, signal, required) => {
    removeChild(name);

    if (shuttingDown || !required) {
        return;
    }

    shuttingDown = true;
    process.exitCode = code ?? (signal ? 1 : 0);
    stopChildren(shutdownSignal);
};

const startProcess = (name, command, args, { required = true } = {}) => {
    const child = spawn(command, args, {
        cwd: rootDir,
        env: {
            ...process.env,
            ...(name === "vite"
                ? {
                    CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING || "true",
                    CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL || "300",
                }
                : {}),
        },
        stdio: "inherit",
    });

    children.set(name, child);

    child.on("error", (error) => {
        console.error(`[${name}] failed to start: ${error.message}`);

        if (!required || shuttingDown) {
            return;
        }

        if (!shuttingDown) {
            shuttingDown = true;
            process.exitCode = 1;
            stopChildren("SIGTERM");
        }
    });

    child.on("exit", (code, signal) => {
        handleChildExit(name, code, signal, required);
    });
};

const handleShutdownSignal = (signal) => {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    process.exitCode = 0;
    stopChildren(signal);
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

startProcess("launcher:local", process.execPath, [launcherScript]);
if (existsSync(defaultOfflineBuildingsPath) && existsSync(defaultOfflinePoisPath)) {
    startProcess("offline:details", process.execPath, [offlineDetailScript], { required: false });
} else {
    console.warn("[offline:details] skipped because GeoPackage files are not available");
}
console.log(
    `[vite] file watching via polling (${process.env.CHOKIDAR_INTERVAL || 300}ms) to avoid ENOSPC watcher limit`,
);
startProcess("vite", process.execPath, [viteBin]);
