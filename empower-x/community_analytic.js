import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "community_analysis.json");

/* =========================
   STATISTICS UTILS
   ========================= */

const getPercentileValue = (sortedValues, p) => {
    if (sortedValues.length === 0) return 0;
    const pos = (sortedValues.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedValues[base + 1] !== undefined) {
        return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
    }
    return sortedValues[base];
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
    KWH_IN: 6,
    KWH_OUT: 7
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
            if (!cupsMap[cupsId]) cupsMap[cupsId] = { id: cupsId, energy_hourly: [] };
            
            cupsMap[cupsId].energy_hourly.push({
                info_dt: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN]),
                kwh_out: parseNum(cols[COL_IDX.KWH_OUT])
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

const analyzeCommunities = (data) => {
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

        const cupsData = (comm.cups || []).map(cup => {
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            const totalIn = energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            const totalOut = energyArray.reduce((sum, h) => {
                const val = h.kwhOut || h.kwh_out || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            return {
                id: cup.id,
                total_kwh_in: totalIn,
                total_kwh_out: totalOut
            };
        });
        // ... rest of loop ...

        if (cupsData.length === 0) return;

        const totalCommIn = cupsData.reduce((sum, c) => sum + c.total_kwh_in, 0);
        const totalCommOut = cupsData.reduce((sum, c) => sum + c.total_kwh_out, 0);
        
        const sortedByIn = [...cupsData].sort((a, b) => a.total_kwh_in - b.total_kwh_in);
        const sortedByOut = [...cupsData].sort((a, b) => a.total_kwh_out - b.total_kwh_out);

        const p05In = getPercentileValue(sortedByIn.map(c => c.total_kwh_in), 0.05);
        const p95In = getPercentileValue(sortedByIn.map(c => c.total_kwh_in), 0.95);

        results.push({
            community_id: comm.id,
            community_name: comm.name,
            metrics: {
                total_cups: cupsData.length,
                avg_consumption_per_cup: Number((totalCommIn / cupsData.length).toFixed(4)),
                avg_surplus_per_cup: Number((totalCommOut / cupsData.length).toFixed(4)),
                total_community_consumption: Number(totalCommIn.toFixed(4)),
                total_community_surplus: Number(totalCommOut.toFixed(4))
            },
            highlights: {
                max_consumer: {
                    cups_id: sortedByIn[sortedByIn.length - 1].id,
                    value: Number(sortedByIn[sortedByIn.length - 1].total_kwh_in.toFixed(4))
                },
                max_surplus: {
                    cups_id: sortedByOut[sortedByOut.length - 1].id,
                    value: Number(sortedByOut[sortedByOut.length - 1].total_kwh_out.toFixed(4))
                }
            },
            outliers: {
                bottom_5_percent_consumers: cupsData.filter(c => c.total_kwh_in <= p05In).map(c => ({
                    cups_id: c.id,
                    value: Number(c.total_kwh_in.toFixed(4))
                })),
                top_5_percent_consumers: cupsData.filter(c => c.total_kwh_in >= p95In).map(c => ({
                    cups_id: c.id,
                    value: Number(c.total_kwh_in.toFixed(4))
                }))
            }
        });
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

    let allCommunityResults = [];

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeCommunities(data);
            allCommunityResults = allCommunityResults.concat(analysis);
        } catch (err) {
            console.error(`  -> Failed to process ${file}: ${err.message}`);
        }
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allCommunityResults, null, 2));
    console.log(`\n✅ Community analysis written to ${OUTPUT_FILE}`);
    console.log(`   Processed ${allCommunityResults.length} communities in total.`);

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
