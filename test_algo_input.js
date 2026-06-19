import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "output.json");

const ALGO_CUSTOM_DATA = "algoCustomData.json";
const MAX_INLINE_BYTES = 5 * 1024 * 1024; // 5 MB

function readContent(fullPath, size) {
    if (size > MAX_INLINE_BYTES) {
        return { encoding: "skipped", note: `file larger than ${MAX_INLINE_BYTES} bytes` };
    }
    const raw = fs.readFileSync(fullPath, "utf8");
    try {
        return { encoding: "json", content: JSON.parse(raw) };
    } catch {
        return { encoding: "text", content: raw };
    }
}

try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const names = fs.readdirSync(INPUT_DIR);
    const datasets = [];
    let algoCustomData = null;

    for (const name of names) {
        const fullPath = path.join(INPUT_DIR, name);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) continue;

        if (name === ALGO_CUSTOM_DATA) {
            const raw = fs.readFileSync(fullPath, "utf8");
            try { algoCustomData = JSON.parse(raw); } catch { algoCustomData = raw; }
            continue;
        }

        const { encoding, content, note } = readContent(fullPath, stat.size);
        datasets.push({ name, size: stat.size, encoding, content, note });
        fs.copyFileSync(fullPath, path.join(OUTPUT_DIR, name)); // echo verbatim
    }

    const result = { directory: INPUT_DIR, datasetCount: datasets.length, algoCustomData, datasets };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log("✅ Done —", datasets.length, "dataset file(s) echoed to", OUTPUT_DIR);
} catch (e) {
    console.log("❌ Error:", e.message);
}
