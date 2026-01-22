import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "profile_analysis.json");

/* =========================
   STATISTICS UTILS
   ========================= */

const getStats = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const avg = sum / values.length;
    
    const getP = (p) => {
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
    };

    return {
        sum: Number(sum.toFixed(4)),
        avg: Number(avg.toFixed(4)),
        min: Number(sorted[0].toFixed(4)),
        max: Number(sorted[sorted.length - 1].toFixed(4)),
        median: Number(getP(0.5).toFixed(4)),
        p05: Number(getP(0.05).toFixed(4)),
        p95: Number(getP(0.95).toFixed(4))
    };
};

const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Schema mapping based on provided table structure:
const COL_IDX = {
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6
};

function loadData(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    try {
        return JSON.parse(content);
    } catch (e) {
        // Fallback to CSV parsing
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
        const cupsMap = {};
        for (const line of lines) {
            const cols = line.split(",");
            if (cols.length < 7) continue;
            if (cols[COL_IDX.CUPS_ID] === "cups_id" || cols[COL_IDX.CUPS_ID] === "cupsId") continue;

            const cupsId = cols[COL_IDX.CUPS_ID];
            if (!cupsMap[cupsId]) cupsMap[cupsId] = { id: cupsId, energy_hourly: [], placeType: "Unspecified" };
            
            cupsMap[cupsId].energy_hourly.push({
                info_dt: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN])
            });
        }
        
        const cupsArray = Object.values(cupsMap);
        if (cupsArray.length === 0) throw new Error("No valid data found in CSV/TXT");

        console.log(`  -> Successfully parsed as CSV (${cupsArray.length} CUPS found).`);
        return {
            id: path.basename(filePath),
            name: path.basename(filePath, path.extname(filePath)),
            cups: cupsArray
        };
    }
}

/* =========================
   CORE LOGIC
   ========================= */

const analyzeProfiles = (data) => {
    let communities = [];
    if (data && data.data && Array.isArray(data.data)) {
        communities = data.data;
    } else if (Array.isArray(data)) {
        communities = data;
    } else if (data && data.communities && Array.isArray(data.communities)) {
        communities = data.communities;
    } else if (data && (data.id || data.name)) {
        communities = [data];
    }
    
    const results = [];

    communities.forEach(comm => {
        if (!comm || (!comm.id && !comm.name)) return;

        // Calculate total stats for the community based on sum of each CUPS
        const cupsTotals = (comm.cups || []).map(cup => {
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            return energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
        });
        // ... rest of loop ...

        const commResult = {
            community_id: comm.id,
            community_name: comm.name,
            community_stats: getStats(cupsTotals),
            place_type_analysis: []
        };

        const byType = {};

        (comm.cups || []).forEach(cup => {
            const type = cup.placeType || cup.place_type || "Unspecified";
            if (!byType[type]) byType[type] = [];
            
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            const totalConsumption = energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            
            byType[type].push({
                id: cup.id,
                consumption: totalConsumption
            });
        });

        for (const [type, cups] of Object.entries(byType)) {
            const consumptions = cups.map(c => c.consumption);
            const stats = getStats(consumptions);
            
            if (!stats) continue;

            const analyzedCups = cups.map(c => {
                const deviation = stats.avg !== 0 ? ((c.consumption - stats.avg) / stats.avg) * 100 : 0;
                return {
                    cups_id: c.id,
                    consumption: Number(c.consumption.toFixed(4)),
                    deviation_pct: Number(deviation.toFixed(2)),
                    is_outlier: c.consumption <= stats.p05 || c.consumption >= stats.p95
                };
            });

            commResult.place_type_analysis.push({
                place_type: type,
                group_stats: stats,
                outliers: analyzedCups.filter(c => c.is_outlier).map(c => ({
                    cups_id: c.cups_id,
                    consumption: c.consumption,
                    deviation_pct: c.deviation_pct
                })),
                all_cups_deviations: analyzedCups.map(c => ({
                    cups_id: c.cups_id,
                    deviation_pct: c.deviation_pct
                }))
            });
        }

        results.push(commResult);
    });

    return results;
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

    let combinedResults = [];

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeProfiles(data);
            combinedResults = combinedResults.concat(analysis);
        } catch (err) {
            console.error(`  -> Failed to process ${file}: ${err.message}`);
        }
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combinedResults, null, 2));
    console.log(`\n✅ Profile analysis written to ${OUTPUT_FILE}`);
    console.log(`   Processed ${combinedResults.length} communities.`);

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
