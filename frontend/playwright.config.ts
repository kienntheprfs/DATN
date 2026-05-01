import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Tạo tên thư mục dựa trên ngày giờ hiện tại: YYYY-MM-DD_HH-mm-ss
const date = new Date();
const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}-${String(date.getSeconds()).padStart(2, "0")}`;

const coverageDir = path.join(process.cwd(), "coverage");

// Check if coverage directory exists, create if not
if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
}

export default defineConfig({
    testDir: "./tests",
    testMatch: ["**/*.spec.ts"],
    timeout: 60000,
    expect: {
        timeout: 10000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        [
            "html",
            {
                outputFolder: `playwright-reports/run-${timestamp}`,
                open: "never",
            },
        ],
        ["list"],
        [
            "monocart-reporter",
            {
                name: "Báo cáo Độ bao phủ (Coverage) - DATN Chatbot",
                outputFile: "./coverage/index.html",
                coverage: {
                    lcov: true,
                    html: true,
                    textSummary: true,
                    sourceFilter: (sourcePath: string) => {
                        // Lọc bỏ node_modules và các file không liên quan
                        if (sourcePath.includes("node_modules") || sourcePath.includes(".next/")) {
                            return false;
                        }
                        
                        // Chấp nhận mọi file trong thư mục frontend/ ngoại trừ tests
                        const normalizedPath = sourcePath.replace(/\\/g, '/');
                        
                        // Chấp nhận các file từ app, components, hooks, lib, services, stores
                        // Bỏ tiền tố /frontend/ để khớp cả đường dẫn URL và file local
                        return (
                            normalizedPath.includes('app/') ||
                            normalizedPath.includes('components/') ||
                            normalizedPath.includes('hooks/') ||
                            normalizedPath.includes('lib/') ||
                            normalizedPath.includes('services/') ||
                            normalizedPath.includes('stores/') ||
                            normalizedPath.includes('localhost:3000') // Chấp nhận cả URL từ dev server
                        );
                    },
                },
            },
        ],
    ],
    use: {
        trace: "on",
        baseURL: "http://localhost:3000",
        extraHTTPHeaders: {
            Accept: "application/json",
        },
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                launchOptions: {
                    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
                },
            },
        },
    ],
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
