import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "anomalies_analysis.json");

/* =========================
   CORE LOGIC & UTILS
   ========================= */

const COL_IDX = {
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6,
    KWH_OUT: 7,
    PRODUCTION: 14
};

const parseNum = (val) => {
    if (!val || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Simple percentile calculation
const getPercentile = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if ((sorted[base + 1] !== undefined)) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
};

const getMean = (values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

const getStdDev = (values, mean) => {
    if (values.length < 2) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
};

/* =========================
   DATA PROCESSING
   ========================= */

const processFile = (filePath) => {
    console.log(`Processing file: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
    
    const data = [];
    for (const line of lines) {
        const cols = line.split(",");
        if (cols.length < 1) continue;

        // Derived Value: Net Consumption = In - Out
        const kwhIn = parseNum(cols[COL_IDX.KWH_IN]);
        const kwhOut = parseNum(cols[COL_IDX.KWH_OUT]);
        const prod = parseNum(cols[COL_IDX.PRODUCTION]);
        
        data.push({
            id: cols[0], // Record ID
            cups_id: cols[COL_IDX.CUPS_ID],
            date: cols[COL_IDX.INFO_DT],
            kwh_in: kwhIn,
            kwh_out: kwhOut,
            production: prod,
            net_usage: kwhIn - kwhOut
        });
    }
    return data;
};

const detectAnomalies = (records) => {
    if (records.length === 0) throw new Error("No records found to analyze.");

    // Extract series for statistical analysis
    const kwhInValues = records.map(r => r.kwh_in);
    const netUsageValues = records.map(r => r.net_usage);

    // 1. Distribution Analysis
    const meanIn = getMean(kwhInValues);
    const stdIn = getStdDev(kwhInValues, meanIn);
    
    const p01 = getPercentile(kwhInValues, 0.01);
    const p05 = getPercentile(kwhInValues, 0.05);
    const p95 = getPercentile(kwhInValues, 0.95);
    const p99 = getPercentile(kwhInValues, 0.99);

    console.log(`Stats (kWh In): Mean=${meanIn.toFixed(4)}, StdDev=${stdIn.toFixed(4)}`);
    console.log(`Percentiles: 1%=${p01}, 99%=${p99}`);

    // 2. Identification of Anomalies
    
    // Spikes: > Mean + 3*StdDev
    const spikeThreshold = meanIn + (3 * stdIn);
    const spikes = records.filter(r => r.kwh_in > spikeThreshold);

    // Zero Activity (Dead Sensors?) - e.g. imported and exported is 0
    const inactiveRecords = records.filter(r => r.kwh_in === 0 && r.kwh_out === 0 && r.production === 0);

    // Negative Net Usage (Exporting more than Importing - valid but interesting)
    const netExporters = records.filter(r => r.net_usage < 0);

    // Top 1% Consumers
    const top1PercentConsumers = records.filter(r => r.kwh_in >= p99);

    return {
        statistics: {
            kwh_in: {
                mean: meanIn,
                std_dev: stdIn,
                percentiles: { p01, p05, p95, p99 }
            }
        },
        anomalies: {
            spikes: {
                threshold: spikeThreshold,
                count: spikes.length,
                sample_ids: spikes.slice(0, 5).map(r => r.id)
            },
            inactivity: {
                count: inactiveRecords.length,
                percentage: (inactiveRecords.length / records.length * 100).toFixed(2) + "%"
            },
            high_consumption: {
                threshold_p99: p99,
                count: top1PercentConsumers.length
            },
            net_export_events: {
                count: netExporters.length
            }
        }
    };
};

/* =========================
   MAIN EXECUTION
   ========================= */

try {
    if (!fs.existsSync(INPUT_DIR)) {
        throw new Error(`Input directory ${INPUT_DIR} not found`);
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith(".csv") || f.endsWith(".txt") || f.indexOf(".") === -1);
    
    console.log(`Found ${files.length} files in input directory.`);

    let allRecords = [];

    files.forEach(file => {
        try {
            const records = processFile(path.join(INPUT_DIR, file));
            allRecords = allRecords.concat(records);
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
        }
    });

    console.log(`Total records loaded: ${allRecords.length}. Finding anomalies...`);

    const result = detectAnomalies(allRecords);

    if (result && result.anomalies) {
        console.log("Anomaly Detection Summary:");
        console.log(`  Spikes Detected: ${result.anomalies.spikes.count}`);
        console.log(`  Inactive Intervals: ${result.anomalies.inactivity.count}`);
        console.log(`  High Consumers (Top 1%): ${result.anomalies.high_consumption.count}`);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result || {}, null, 2));
    console.log(`\n✅ Anomalies analysis written to ${OUTPUT_FILE}`);

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
