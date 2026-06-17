import fs from "fs";
import path from "path";

const INPUT_DIR  = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "output.json");

try {
    const entries = fs.readdirSync(INPUT_DIR).map(name => {
        const full = path.join(INPUT_DIR, name);
        const stat = fs.statSync(full);
        return {
            name,
            size:        stat.size,
            type:        stat.isDirectory() ? "directory" : "file",
            permissions: "0" + (stat.mode & 0o777).toString(8),
            modified:    stat.mtime.toISOString(),
        };
    });

    const result = {
        directory: INPUT_DIR,
        count:     entries.length,
        entries,
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log("✅ Done —", entries.length, "entries written to", OUTPUT_FILE);
} catch (e) {
    console.log("❌ Error:", e.message);
}
