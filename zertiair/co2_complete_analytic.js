// https://raw.githubusercontent.com/zertifier/c2d-alghos-sandbox/refs/heads/main/zertiair/co2_analytic.js?token=GHSAT0AAAAAAC45ITPVCL6HYZD2DTI5CHBK2KBOBSA
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
   1) Sensor & Battery Analytics
========================= */

function sensorInventory(points) {
    const bySensor = {};
    points.forEach(p => {
        (bySensor[p.sensorId] ??= []).push(p);
    });

    const sensors = Object.entries(bySensor).map(([id, ps]) => {
        const batteries = ps.map(p => p.sensorBatteryPercentage);
        const dates = ps.map(p => p.ts).sort((a, b) => a - b);

        const days =
            (dates.at(-1) - dates[0]) / (1000 * 3600 * 24) || 1;

        return {
            sensorId: id,
            points: ps.length,
            avgBattery: avg(batteries),
            minBattery: Math.min(...batteries),
            maxBattery: Math.max(...batteries),
            dischargePerDay:
                (batteries[0] - batteries.at(-1)) / days,
            batteryP01: percentile(batteries, 0.01),
            batteryP99: percentile(batteries, 0.99)
        };
    });

    console.log("🔋 Sensor inventory computed:", sensors.length);
    return { sensorsCount: sensors.length, sensors };
}

/* =========================
   2) Regional CO₂ Analytics
========================= */

function regionalAnalytics(points) {
    const byRegion = {};
    points.forEach(p => {
        (byRegion[p.region] ??= []).push(p.co2ppm);
    });

    const regions = Object.entries(byRegion).map(([r, vals]) => ({
        region: r,
        count: vals.length,
        mean: avg(vals),
        median: percentile(vals, 0.5),
        p05: percentile(vals, 0.05),
        p95: percentile(vals, 0.95),
        min: Math.min(...vals),
        max: Math.max(...vals),
        std: std(vals)
    }));

    console.log("🌍 Regions analyzed:", regions.length);
    return regions;
}

/* =========================
   3) Sensor CO₂ Analytics
========================= */

function sensorCO2Analytics(points) {
    const bySensor = {};
    points.forEach(p => {
        (bySensor[p.sensorId] ??= []).push(p.co2ppm);
    });

    const globalMedian =
        percentile(points.map(p => p.co2ppm), 0.5);

    const sensors = Object.entries(bySensor).map(([id, vals]) => ({
        sensorId: id,
        mean: avg(vals),
        median: percentile(vals, 0.5),
        std: std(vals),
        volatility: std(vals) / (avg(vals) || 1),
        p01: percentile(vals, 0.01),
        p99: percentile(vals, 0.99),
        relativeToGlobal:
            avg(vals) - globalMedian
    }));

    console.log("📡 Sensor CO₂ analytics done");
    return sensors;
}

/* =========================
   4) Temporal (Day/Night)
========================= */

function temporalAnalytics(points) {
    const day = [], night = [];
    points.forEach(p => {
        const h = p.ts.getUTCHours();
        (h >= 6 && h < 18 ? day : night).push(p.co2ppm);
    });

    return {
        day: {
            mean: avg(day),
            median: percentile(day, 0.5)
        },
        night: {
            mean: avg(night),
            median: percentile(night, 0.5)
        },
        deltaDayNight:
            avg(day) - avg(night)
    };
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

    const result = {
        sensorInventory: sensorInventory(points),
        regionalAnalytics: regionalAnalytics(points),
        sensorAnalytics: sensorCO2Analytics(points),
        temporalAnalytics: temporalAnalytics(points),
        advancedAnomalies: advancedAnomalies(points)
    };

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(result, null, 2)
    );

    console.log("✅ Analytics complete");
} catch (e) {
    console.log("❌ Error:", e.message);
}
