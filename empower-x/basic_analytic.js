import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "basic_analysis.json");

/* =========================
   CORE LOGIC
   ========================= */

const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Schema mapping based on provided table structure:
// 0: id, 1: created_dt, 2: updated_dt, 3: cups_id, 4: origin, 5: info_dt, 
// 6: kwh_in, 7: kwh_out, 8: kwh_in_virtual, 9: kwh_out_virtual, 
// 10: kwh_in_price, 11: kwh_out_price, 12: kwh_in_price_community, 
// 13: kwh_out_price_community, 14: production, 15: battery, 16: shares, 17: hour_type_range
const COL_IDX = {
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6,
    KWH_OUT: 7,
    PRODUCTION: 14,
    BATTERY: 15
};

const processFile = (filePath) => {
    console.log(`Processing file: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf8");
    
    try {
        const rawData = JSON.parse(content);
        let communities = [];
        if (rawData && rawData.data && Array.isArray(rawData.data)) {
            communities = rawData.data;
        } else if (Array.isArray(rawData)) {
            communities = rawData;
        } else if (rawData && rawData.communities && Array.isArray(rawData.communities)) {
            communities = rawData.communities;
        } else if (rawData && (rawData.id || rawData.name)) {
            communities = [rawData];
        }

        const records = [];
        communities.forEach(comm => {
            if (!comm || !comm.cups) return;
            comm.cups.forEach(cup => {
                const energyArray = cup.energy_hourly || cup.energyHourly || [];
                energyArray.forEach(h => {
                    records.push({
                        cups_id: h.cupsId || h.cups_id || cup.id,
                        date: h.infoDt || h.info_dt,
                        kwh_in: parseNum(h.kwhIn || h.kwh_in),
                        kwh_out: parseNum(h.kwhOut || h.kwh_out),
                        production: parseNum(h.production),
                        battery: parseNum(h.battery)
                    });
                });
            });
        });
        return records;
    } catch (e) {
        // Fallback to CSV parsing
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
        const records = [];
        for (const line of lines) {
            const cols = line.split(",");
            if (cols.length < 7) continue; 

            // Skip header if present
            if (cols[COL_IDX.CUPS_ID] === "cups_id" || cols[COL_IDX.CUPS_ID] === "cupsId") continue;

            records.push({
                cups_id: cols[COL_IDX.CUPS_ID],
                date: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN]),
                kwh_out: parseNum(cols[COL_IDX.KWH_OUT]),
                production: parseNum(cols[COL_IDX.PRODUCTION]),
                battery: parseNum(cols[COL_IDX.BATTERY])
            });
        }
        if (records.length > 0) {
            console.log(`  -> Successfully parsed as CSV (${records.length} records).`);
        }
        return records;
    }
};

const calculateStats = (records) => {
    if (records.length === 0) throw new Error("No records found to analyze.");

    let minKwhIn = Infinity;
    let maxKwhIn = -Infinity;
    let sumKwhIn = 0;
    let minProd = Infinity;
    let maxProd = -Infinity;
    let sumProd = 0;

    const cupsIds = new Set();
    const dates = new Set();

    records.forEach(r => {
        cupsIds.add(r.cups_id);
        dates.add(r.date);

        // Kwh In
        if (r.kwh_in < minKwhIn) minKwhIn = r.kwh_in;
        if (r.kwh_in > maxKwhIn) maxKwhIn = r.kwh_in;
        sumKwhIn += r.kwh_in;

        // Production
        if (r.production < minProd) minProd = r.production;
        if (r.production > maxProd) maxProd = r.production;
        sumProd += r.production;
    });

    return {
        totalRecords: records.length,
        uniqueSensors: cupsIds.size,
        uniqueTimestamps: dates.size,
        energy: {
            imported: {
                total: sumKwhIn,
                avg: sumKwhIn / records.length,
                min: minKwhIn,
                max: maxKwhIn
            },
            production: {
                total: sumProd,
                avg: sumProd / records.length,
                min: minProd,
                max: maxProd
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

    const files = fs.readdirSync(INPUT_DIR).filter(f => !f.startsWith(".") && (f.endsWith(".json") || f.endsWith(".csv") || f.endsWith(".txt") || !f.includes(".")));

    console.log(`Found ${files.length} files in input directory.`);

    let allRecords = [];

    files.forEach(file => {
        const p = path.join(INPUT_DIR, file);
        try {
            const records = processFile(p);
            allRecords = allRecords.concat(records);
            console.log(`  -> Loaded ${records.length} records from ${file}`);
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
        }
    });

    console.log(`Total records loaded: ${allRecords.length}`);
    console.log("Running statistical analysis...");

    const stats = calculateStats(allRecords);

    if (stats) {
        console.log("Analysis Result Summary:");
        console.log(`  Sensors: ${stats.uniqueSensors}`);
        console.log(`  Total Energy In: ${stats.energy.imported.total.toFixed(2)} kWh`);
        console.log(`  Avg Energy In: ${stats.energy.imported.avg.toFixed(4)} kWh`);
    } else {
        console.log("No valid data found to analyze.");
    }

    // Write ONLY the result object to output file (no debug logs)
    if (!fs.existsSync(OUTPUT_DIR)) {
        // Create it if it doesn't exist? usually VM provides it. 
        // We'll try to create it just in case, or fail if permissions deny.
        try {
            fs.mkdirSync(OUTPUT_DIR, {recursive: true});
        } catch (e) {
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats || {}, null, 2));
    console.log(`\n✅ Result successfully written to ${OUTPUT_FILE}`);

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
