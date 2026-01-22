import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const INSPECT_DIR = path.join(OUTPUT_DIR, "inspected_files");
const REPORT_FILE = path.join(OUTPUT_DIR, "pod_inventory.json");

const report = {
    timestamp: new Date().toISOString(),
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    commands: {},
    fileSystem: {}
};

function tryExec(cmd) {
    try {
        return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim();
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

// 1. Gather installed packages/apps
console.log("Gathering system info...");
report.commands["npm_list"] = tryExec("npm list --depth=0");
report.commands["pip_list"] = tryExec("pip list");
report.commands["python_version"] = tryExec("python --version");
report.commands["ls_la_root"] = tryExec("ls -la /");
report.commands["ls_la_data"] = tryExec("ls -la /data");
report.commands["df_h"] = tryExec("df -h");

// 2. Traverse File System
function getPermissions(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const mode = stats.mode;
        return {
            read: !!(mode & fs.constants.R_OK),
            write: !!(mode & fs.constants.W_OK),
            execute: !!(mode & fs.constants.X_OK),
            mode: mode.toString(8)
        };
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

function crawl(dir, depth = 0) {
    if (depth > 5) return { error: "Max depth reached" };
    const result = {};
    try {
        const entries = fs.readdirSync(dir);
        entries.forEach(entry => {
            const fullPath = path.join(dir, entry);
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                result[entry] = {
                    type: "directory",
                    permissions: getPermissions(fullPath),
                    children: crawl(fullPath, depth + 1)
                };
            } else {
                result[entry] = {
                    type: "file",
                    size: stats.size,
                    permissions: getPermissions(fullPath)
                };

                // Copy small files from /data/inputs for inspection
                if (fullPath.startsWith(INPUT_DIR) && stats.size < 1024 * 1024) {
                    if (!fs.existsSync(INSPECT_DIR)) {
                        fs.mkdirSync(INSPECT_DIR, { recursive: true });
                    }
                    const dest = path.join(INSPECT_DIR, entry);
                    try {
                        fs.copyFileSync(fullPath, dest);
                        result[entry].copiedToOutput = true;
                    } catch (err) {
                        result[entry].copyError = err.message;
                    }
                }
            }
        });
    } catch (e) {
        return `Error: ${e.message}`;
    }
    return result;
}

console.log("Crawling /data...");
report.fileSystem["/data"] = crawl("/data");

// 3. Write report
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`Report written to ${REPORT_FILE}`);
