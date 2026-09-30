import { useEffect, useState } from "react";
import * as ROSLIB from "roslib";

const DEFAULT_ROSBRIDGE_URLS = ["ws://192.168.1.116:9090", "ws://192.168.1.218:9090"];
// const DEFAULT_ROSBRIDGE_URLS = ["ws://192.168.166.207:9090", "ws://192.168.166.107:9090"];
const RECONNECT_DELAY_MS = 2000;
const ROS_DEVICE_CONFIGS = [
    {
        id: "robot",
        label: "ROBOT",
        hostSuffix: "207",
    },
    {
        id: "vali",
        label: "VALI",
        hostSuffix: "218",
    },
];

const getConfiguredRosbridgeUrls = () => {
    const rawUrls = [
        import.meta.env.VITE_ROSBRIDGE_URL,
        ...(import.meta.env.VITE_ROSBRIDGE_URLS || "").split(","),
    ];

    const normalizedUrls = rawUrls.map((url) => url?.trim()).filter(Boolean);
    const uniqueUrls = [...new Set(normalizedUrls)];

    return uniqueUrls.length ? uniqueUrls : DEFAULT_ROSBRIDGE_URLS;
};

const ROSBRIDGE_URLS = getConfiguredRosbridgeUrls();

const createInitialConnectionEntries = () =>
    ROSBRIDGE_URLS.map((url) => ({
        url,
        ros: null,
        isConnected: false,
        status: "Connecting",
        error: "",
    }));

const updateConnectionEntry = (entries, url, patch) =>
    entries.map((entry) => (entry.url === url ? { ...entry, ...patch } : entry));

const getHostFromUrl = (url) => {
    try {
        return new URL(url).hostname;
    } catch {
        return "";
    }
};

const getDeviceConfigFromUrl = (url) => {
    const host = getHostFromUrl(url);
    const hostSuffix = host.split(".").pop() || "";

    return ROS_DEVICE_CONFIGS.find((deviceConfig) => deviceConfig.hostSuffix === hostSuffix) || null;
};

const useRosConnection = () => {
    const [connectionEntries, setConnectionEntries] = useState(createInitialConnectionEntries);

    useEffect(() => {
        let isDisposed = false;
        const rosByUrl = new Map();
        const reconnectTimers = new Map();

        const clearReconnectTimer = (url) => {
            const timer = reconnectTimers.get(url);

            if (!timer) {
                return;
            }

            globalThis.clearTimeout(timer);
            reconnectTimers.delete(url);
        };

        const closeRos = (url) => {
            const ros = rosByUrl.get(url);
            rosByUrl.delete(url);

            if (!ros) {
                return;
            }

            try {
                ros.close();
            } catch (error) {
                console.error(`Lỗi đóng ROS connection [${url}]:`, error);
            }
        };

        const scheduleReconnect = (url) => {
            clearReconnectTimer(url);

            const timer = globalThis.setTimeout(() => {
                reconnectTimers.delete(url);
                connectToUrl(url);
            }, RECONNECT_DELAY_MS);

            reconnectTimers.set(url, timer);
        };

        const connectToUrl = (url) => {
            if (isDisposed) {
                return;
            }

            clearReconnectTimer(url);
            closeRos(url);

            setConnectionEntries((previousEntries) =>
                updateConnectionEntry(previousEntries, url, {
                    ros: null,
                    isConnected: false,
                    status: "Connecting",
                    error: "",
                }),
            );

            const ros = new ROSLIB.Ros({ url });
            let didConnect = false;

            rosByUrl.set(url, ros);
            setConnectionEntries((previousEntries) =>
                updateConnectionEntry(previousEntries, url, {
                    ros,
                }),
            );

            const markDisconnected = (message) => {
                if (isDisposed || rosByUrl.get(url) !== ros) {
                    return;
                }

                rosByUrl.delete(url);

                setConnectionEntries((previousEntries) =>
                    updateConnectionEntry(previousEntries, url, {
                        ros: null,
                        isConnected: false,
                        status: "Disconnected",
                        error: message,
                    }),
                );

                try {
                    ros.close();
                } catch {
                    // noop
                }

                scheduleReconnect(url);
            };

            ros.on("connection", () => {
                if (isDisposed || rosByUrl.get(url) !== ros) {
                    return;
                }

                didConnect = true;
                console.log(`✅ Connected to ROSBridge: ${url}`);

                setConnectionEntries((previousEntries) =>
                    updateConnectionEntry(previousEntries, url, {
                        ros,
                        isConnected: true,
                        status: "Connected",
                        error: "",
                    }),
                );
            });

            ros.on("error", (error) => {
                if (isDisposed || rosByUrl.get(url) !== ros) {
                    return;
                }

                console.error(`❌ ROSBridge error [${url}]:`, error);
                markDisconnected(`Không kết nối được ROSBridge: ${url}`);
            });

            ros.on("close", () => {
                if (isDisposed || rosByUrl.get(url) !== ros) {
                    return;
                }

                console.warn(`⚠️ ROSBridge connection closed [${url}]`);
                markDisconnected(
                    didConnect ? `Mất kết nối ROSBridge: ${url}` : `Không kết nối được ROSBridge: ${url}`,
                );
            });
        };

        ROSBRIDGE_URLS.forEach((url) => {
            connectToUrl(url);
        });

        return () => {
            isDisposed = true;

            reconnectTimers.forEach((timer) => {
                globalThis.clearTimeout(timer);
            });
            reconnectTimers.clear();

            rosByUrl.forEach((_, url) => {
                closeRos(url);
            });
        };
    }, []);

    const connectionEntriesWithMetadata = connectionEntries.map((entry) => {
        const host = getHostFromUrl(entry.url);
        const deviceConfig = getDeviceConfigFromUrl(entry.url);

        return {
            ...entry,
            host,
            deviceId: deviceConfig?.id || "",
            deviceLabel: deviceConfig?.label || host || entry.url,
            hostSuffix: deviceConfig?.hostSuffix || "",
        };
    });

    const rosConnections = connectionEntriesWithMetadata
        .filter((entry) => entry.isConnected && entry.ros)
        .map((entry) => ({
            url: entry.url,
            ros: entry.ros,
        }));

    const connectedCount = rosConnections.length;
    const totalConnections = connectionEntries.length;
    const isConnected = connectedCount > 0;
    const isFullyConnected = totalConnections > 0 && connectedCount === totalConnections;
    const isConnecting = connectionEntries.some((entry) => entry.status === "Connecting");
    const ros = rosConnections[0]?.ros ?? null;
    const activeUrl = rosConnections[0]?.url ?? "";
    const activeUrls = rosConnections.map((connection) => connection.url);

    let connectionStatus = "Disconnected";
    if (isFullyConnected) {
        connectionStatus = "Connected";
    } else if (isConnected) {
        connectionStatus = "Partially Connected";
    } else if (isConnecting) {
        connectionStatus = "Connecting";
    }

    const disconnectedUrls = connectionEntriesWithMetadata
        .filter((entry) => !entry.isConnected)
        .map((entry) => entry.url);
    const error =
        disconnectedUrls.length && !isFullyConnected
            ? `Chua ket noi: ${disconnectedUrls.join(", ")}`
            : "";

    const deviceConnections = ROS_DEVICE_CONFIGS.map((deviceConfig) => {
        const matchedConnection = connectionEntriesWithMetadata.find((entry) => entry.deviceId === deviceConfig.id);

        if (matchedConnection) {
            return {
                ...matchedConnection,
                ...deviceConfig,
            };
        }

        return {
            ...deviceConfig,
            url: "",
            host: "",
            ros: null,
            isConnected: false,
            status: "Unavailable",
            error: `Chua cau hinh ROSBridge cho ${deviceConfig.label}`,
        };
    });

    const robotConnection = deviceConnections.find((entry) => entry.id === "robot") || null;
    const valiConnection = deviceConnections.find((entry) => entry.id === "vali") || null;

    return {
        ros,
        rosConnections,
        isConnected,
        isFullyConnected,
        connectedCount,
        totalConnections,
        error,
        connectionStatus,
        activeUrl,
        activeUrls,
        availableUrls: ROSBRIDGE_URLS,
        connectionEntries: connectionEntriesWithMetadata,
        deviceConnections,
        robotConnection,
        valiConnection,
    };
};

export default useRosConnection;
