import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

const HOST = process.env.LOCAL_LAUNCHER_HOST || "127.0.0.1";
const PORT = Number(process.env.LOCAL_LAUNCHER_PORT || 5051);
const LOG_DIR = process.env.LOCAL_LAUNCHER_LOG_DIR || "/tmp/hmi-local-launcher";

const APP_MAP = {
    rviz: {
        command: "rviz",
        args: [],
    },
};

const processes = new Map();
const lastExitByApp = new Map();

mkdirSync(LOG_DIR, { recursive: true });

const writeJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(payload));
};

const getLogPath = (appName) => join(LOG_DIR, `${appName}.log`);

const cleanupExitedProcess = (appName) => {
    const entry = processes.get(appName);
    if (!entry) return;

    const returnCode = entry.child.exitCode;
    if (returnCode !== null) {
        processes.delete(appName);
        lastExitByApp.set(appName, {
            returnCode,
            exitedAt: new Date().toISOString(),
        });
    }
};

const getAppStatus = (appName) => {
    cleanupExitedProcess(appName);

    const entry = processes.get(appName);
    if (!entry) {
        return {
            running: false,
            logPath: getLogPath(appName),
            lastExit: lastExitByApp.get(appName) || null,
        };
    }

    return {
        running: true,
        pid: entry.child.pid,
        startedAt: entry.startedAt,
        logPath: entry.logPath,
        lastExit: lastExitByApp.get(appName) || null,
    };
};

const startApp = async (appName) => {
    cleanupExitedProcess(appName);

    const appConfig = APP_MAP[appName];
    if (!appConfig) {
        return {
            statusCode: 404,
            payload: {
                ok: false,
                event: "rejected",
                reason: "app_not_whitelisted",
                app: appName,
            },
        };
    }

    const current = processes.get(appName);
    if (current) {
        return {
            statusCode: 200,
            payload: {
                ok: true,
                event: "already_running",
                app: appName,
                status: getAppStatus(appName),
            },
        };
    }

    const logPath = getLogPath(appName);
    const outputFd = openSync(logPath, "a");

    return new Promise((resolve) => {
        const child = spawn(appConfig.command, appConfig.args || [], {
            detached: true,
            stdio: ["ignore", outputFd, outputFd],
            env: { ...process.env, ...(appConfig.env || {}) },
        });

        let settled = false;

        child.once("error", (error) => {
            if (settled) return;
            settled = true;

            resolve({
                statusCode: 500,
                payload: {
                    ok: false,
                    event: "spawn_error",
                    app: appName,
                    message: error.message,
                    logPath,
                },
            });
        });

        child.once("spawn", () => {
            if (settled) return;
            settled = true;

            child.unref();
            const startedAt = new Date().toISOString();

            processes.set(appName, {
                child,
                logPath,
                startedAt,
            });

            child.once("exit", (returnCode) => {
                processes.delete(appName);
                lastExitByApp.set(appName, {
                    returnCode,
                    exitedAt: new Date().toISOString(),
                });
            });

            resolve({
                statusCode: 200,
                payload: {
                    ok: true,
                    event: "started",
                    app: appName,
                    status: getAppStatus(appName),
                },
            });
        });
    });
};

const stopApp = (appName) => {
    cleanupExitedProcess(appName);

    const entry = processes.get(appName);
    if (!entry) {
        return {
            statusCode: 200,
            payload: {
                ok: true,
                event: "not_running",
                app: appName,
                status: getAppStatus(appName),
            },
        };
    }

    try {
        process.kill(-entry.child.pid, "SIGINT");
    } catch {
        process.kill(entry.child.pid, "SIGINT");
    }

    processes.delete(appName);
    lastExitByApp.set(appName, {
        returnCode: null,
        exitedAt: new Date().toISOString(),
    });

    return {
        statusCode: 200,
        payload: {
            ok: true,
            event: "stopped",
            app: appName,
            status: getAppStatus(appName),
        },
    };
};

const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
        writeJson(res, 400, { ok: false, message: "Invalid request" });
        return;
    }

    if (req.method === "OPTIONS") {
        writeJson(res, 204, {});
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "GET" && pathname === "/health") {
        writeJson(res, 200, {
            ok: true,
            host: HOST,
            port: PORT,
            apps: Object.keys(APP_MAP),
        });
        return;
    }

    if (req.method === "GET" && pathname === "/api/apps/status") {
        const apps = Object.fromEntries(Object.keys(APP_MAP).map((appName) => [appName, getAppStatus(appName)]));
        writeJson(res, 200, { ok: true, apps });
        return;
    }

    const match = pathname.match(/^\/api\/apps\/([^/]+)\/(start|stop)$/);
    if (req.method === "POST" && match) {
        const [, appName, action] = match;
        const result = action === "start" ? await startApp(appName) : stopApp(appName);
        writeJson(res, result.statusCode, result.payload);
        return;
    }

    writeJson(res, 404, { ok: false, message: "Not found" });
});

server.listen(PORT, HOST, () => {
    console.log(`Local launcher listening on http://${HOST}:${PORT}`);
    console.log(`Whitelisted apps: ${Object.keys(APP_MAP).join(", ")}`);
});

const shutdown = () => {
    for (const [appName] of processes) {
        stopApp(appName);
    }

    server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
