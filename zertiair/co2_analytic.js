// https://raw.githubusercontent.com/zertifier/c2d-alghos-sandbox/refs/heads/main/zertiair/co2_analytic.js?token=GHSAT0AAAAAAC45ITPVCL6HYZD2DTI5CHBK2KBOBSA
import fs from "fs";
import path from "path";

const inputDir = "/data/inputs";
const outputDir = "/data/outputs";
const outputFile = path.join(outputDir, "co2_analytics_result.json");

// ---------- helpers ----------
function parseDate(str) {
    // supports "YYYY-MM-DD HH:mm:ss"
    return new Date(str.replace(" ", "T") + "Z");
}

function avg(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(a, b) {
    return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

// ---------- analytics ----------
function analyzeCO2Dataset(records) {
    console.log(`📊 Records received: ${records.length}`);

    const sensors = {};
    const regions = {};
    const timestamps = [];

    for (const r of records) {
        const ts = parseDate(r.createdAt);
        timestamps.push(ts);

        // ---- per sensor ----
        if (!sensors[r.sensorId]) {
            sensors[r.sensorId] = {
                co2: [],
                batteries: [],
                timestamps: [],
                region: r.region
            };
        }

        sensors[r.sensorId].co2.push(r.co2ppm);
        sensors[r.sensorId].batteries.push(r.sensorBatteryPercentage);
        sensors[r.sensorId].timestamps.push(ts);

        // ---- per region ----
        if (!regions[r.region]) {
            regions[r.region] = {
                co2: new Set(),
                values: []
            };
        }
        regions[r.region].co2.add(r.sensorId);
        regions[r.region].values.push(r.co2ppm);
    }

    // ---- dataset window ----
    const minTime = new Date(Math.min(...timestamps));
    const maxTime = new Date(Math.max(...timestamps));
    const datasetDays = daysBetween(minTime, maxTime);

    console.log(`🕒 Dataset window: ${minTime.toISOString()} → ${maxTime.toISOString()}`);
    console.log(`📆 Duration: ${datasetDays.toFixed(2)} days`);

    // ---------- per sensor analytics ----------
    const sensorAnalytics = {};

    for (const [sensorId, s] of Object.entries(sensors)) {
        const times = s.timestamps.sort((a, b) => a - b);
        const intervals = [];

        for (let i = 1; i < times.length; i++) {
            intervals.push((times[i] - times[i - 1]) / 1000);
        }

        const batteryDrop =
            s.batteries[0] - s.batteries[s.batteries.length - 1];

        const sensorDays = daysBetween(times[0], times[times.length - 1]);
        const dischargePerDay =
            sensorDays > 0 ? batteryDrop / sensorDays : 0;

        const estimatedBatteryLife =
            dischargePerDay > 0 ? 100 / dischargePerDay : null;

        sensorAnalytics[sensorId] = {
            measurements: s.co2.length,
            co2: {
                min: Math.min(...s.co2),
                max: Math.max(...s.co2),
                avg: avg(s.co2),
                median: median(s.co2)
            },
            measurementWindow: {
                from: times[0].toISOString(),
                to: times[times.length - 1].toISOString(),
                days: sensorDays.toFixed(2)
            },
            avgMeasurementIntervalSeconds: avg(intervals).toFixed(2),
            battery: {
                start: s.batteries[0],
                end: s.batteries[s.batteries.length - 1],
                dischargePerDay: dischargePerDay.toFixed(2),
                estimatedLifeDays: estimatedBatteryLife
                    ? estimatedBatteryLife.toFixed(1)
                    : null
            }
        };

        console.log(`🔧 Sensor ${sensorId}`);
        console.log(
            `   CO₂ avg: ${sensorAnalytics[sensorId].co2.avg.toFixed(1)} ppm`
        );
        console.log(
            `   Battery est. life: ${
                sensorAnalytics[sensorId].battery.estimatedLifeDays ?? "N/A"
            } days`
        );
    }

    // ---------- per region analytics ----------
    const regionAnalytics = {};

    for (const [region, r] of Object.entries(regions)) {
        regionAnalytics[region] = {
            sensorsCount: r.co2.size,
            co2: {
                min: Math.min(...r.values),
                max: Math.max(...r.values),
                avg: avg(r.values),
                median: median(r.values)
            }
        };

        console.log(`🌍 Region ${region}`);
        console.log(
            `   Sensors: ${r.co2.size}, Avg CO₂: ${regionAnalytics[region].co2.avg.toFixed(
                1
            )} ppm`
        );
    }

    return {
        datasetSummary: {
            totalMeasurements: records.length,
            sensorsCount: Object.keys(sensors).length,
            regionsCount: Object.keys(regions).length,
            measurementWindow: {
                from: minTime.toISOString(),
                to: maxTime.toISOString(),
                days: datasetDays.toFixed(2)
            },
            avgMeasurementsPerDay:
                datasetDays > 0
                    ? (records.length / datasetDays).toFixed(2)
                    : null
        },
        sensors: sensorAnalytics,
        regions: regionAnalytics
    };
}

// ---------- main ----------
try {
    console.log(`📂 Reading input directory: ${inputDir}`);
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith(".json"));

    if (!files.length) {
        console.log("⚠️ No input files found.");
        process.exit(0);
    }

    let allRecords = [];

    for (const file of files) {
        const filePath = path.join(inputDir, file);
        console.log(`📄 Processing ${file}`);
        const content = JSON.parse(fs.readFileSync(filePath, "utf8"));

        if (Array.isArray(content)) {
            allRecords.push(...content);
        } else {
            console.log(`⚠️ Skipping ${file}: not an array`);
        }
    }

    const result = analyzeCO2Dataset(allRecords);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    console.log(`✅ Analytics written to ${outputFile}`);
} catch (err) {
    console.log("❌ Error during C2D execution:", err.message);
}
