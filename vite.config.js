import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const usePolling =
    process.env.VITE_USE_POLLING === "true" ||
    process.env.CHOKIDAR_USEPOLLING === "true";

const pollInterval = Number(
    process.env.VITE_POLL_INTERVAL ||
    process.env.CHOKIDAR_INTERVAL ||
    300,
);

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: usePolling
        ? {
            watch: {
                usePolling: true,
                interval: pollInterval,
            },
        }
        : undefined,
});
