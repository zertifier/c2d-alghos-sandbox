import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "analytics.json");

/* =========================
   Utils (cheap & reusable)
========================= */

const parseDate = d => new Date(d.replace(" ", "T") + "Z");

const percentile = (arr, p) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const i = (s.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const std = a => {
    if (a.length < 2) return 0;
    const m = avg(a);
    return Math.sqrt(avg(a.map(v => (v - m) ** 2)));
};

/* =========================
   Load & normalize data
========================= */

function loadAllPoints() {
    const points = [];
    fs.readdirSync(INPUT_DIR).forEach(f => {
        const data = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, f), "utf8"));
        if (Array.isArray(data)) points.push(...data);
    });
    return points.map(p => ({
        ...p,
        ts: parseDate(p.createdAt)
    }));
}

/* =========================
   5) Advanced Anomalies
========================= */

function advancedAnomalies(points) {
    const co2 = points.map(p => p.co2ppm);
    const p01 = percentile(co2, 0.01);
    const p99 = percentile(co2, 0.99);

    const spikes = points.filter(
        p => p.co2ppm <= p01 || p.co2ppm >= p99
    );

    return {
        co2P01: p01,
        co2P99: p99,
        spikeCount: spikes.length
    };
}


/* =========================
   MAIN
========================= */

try {
    const points = loadAllPoints();
    console.log("📥 Loaded points:", points.length);

    const result = advancedAnomalies(points);

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(result, null, 2)
    );

    console.log("✅ Analytics complete");
} catch (e) {
    console.log("❌ Error:", e.message);
}
