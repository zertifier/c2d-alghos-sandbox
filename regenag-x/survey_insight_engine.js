// https://raw.githubusercontent.com/zertifier/c2d-alghos-sandbox/refs/heads/main/regenag-x/survey_insight_engine.js?token=GHSAT0AAAAAAC45ITPUAK6HKJACOYMGBYNU2KBNQEQ
import fs from "fs";
import path from "path";
//made for CSIC-IATA by Ilya Rodikov


// --- POD CONFIGURATION ---

const inputDir = "/data/inputs";
const outputDir = "/data/outputs";
const outputFile = path.join(outputDir, "result.txt");

// --- ALGORITHM LOGIC ---

/**
 * Main Analysis Function for Tech4RegenAg
 * Processes the raw survey data and returns a formatted text report.
 */
function analyzeSurveyData(dataset) {
    // 1. Validation: Ensure dataset is an array
    if (!Array.isArray(dataset)) {
        return "ERROR: Invalid Input Format. Expected a JSON Array of survey responses.";
    }

    // 2. Helpers
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const calculateCorrelation = (x, y) => {
        const n = x.length;
        if (n === 0) return 0;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + (xi * y[i]), 0);
        const sumX2 = x.reduce((sum, xi) => sum + (xi * xi), 0);
        const sumY2 = y.reduce((sum, yi) => sum + (yi * yi), 0);
        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
        return (denominator === 0) ? 0 : numerator / denominator;
    };

    // 3. Mappings (Key detection)
    const mappings = {
        nlp_words: ['Palabra1', 'Palabra2', 'Palabra3', 'Palabra4'],
        concern: ["Uso de pesticidas", "daño ambiental", "desperdiciados", "Uso excesivo", "envases", "Emisión de carbono"],
        habits: ["Actitud_Reducir", "ompro_productos_de_proximidad", "mi_propia_bolsa", "reciclables_o_biodegradables", "productos_orgánicos"],
        messages: "Q3_",
        blockchain_interest: ["Q2_1", "Q2_2", "Q2_3", "Q2_4", "Q2_5", "Q2_6", "Q2_7", "Q2_8", "Q2_9"],
        skepticism_fad: "Q5_2",
        skepticism_cost: "Q5_9"
    };

    // 4. Aggregation Containers
    let stats = {
        sampleSize: dataset.length,
        wordCounts: {},
        scores: { concern: [], habits: [], blockchain_demand: [] },
        messageRatings: {},
        skeptics: { fad: 0, expensive: 0 }
    };

    // 5. Processing Loop
    dataset.forEach(row => {
        const keys = Object.keys(row);

        // A. NLP (Word Cloud)
        mappings.nlp_words.forEach(field => {
            if (row[field] && typeof row[field] === 'string') {
                let word = row[field].trim().toLowerCase();
                if (word.length > 2) stats.wordCounts[word] = (stats.wordCounts[word] || 0) + 1;
            }
        });

        // B. "Say-Do" Analysis
        let userConcern = avg(keys.filter(k => mappings.concern.some(sub => k.includes(sub))).map(k => row[k]));
        let userHabit = avg(keys.filter(k => mappings.habits.some(sub => k.includes(sub))).map(k => row[k]));

        // Normalize (Concern is 1-5, Habits is 1-7)
        stats.scores.concern.push((userConcern / 5) * 100);
        stats.scores.habits.push((userHabit / 7) * 100);

        // C. Messages
        keys.filter(k => k.startsWith(mappings.messages)).forEach(k => {
            if (!stats.messageRatings[k]) stats.messageRatings[k] = [];
            stats.messageRatings[k].push(row[k]);
        });

        // D. Blockchain
        let bcInterest = keys.filter(k => mappings.blockchain_interest.some(sub => k.includes(sub))).map(k => row[k]);
        stats.scores.blockchain_demand.push(avg(bcInterest));

        // E. Skepticism
        let fadKey = keys.find(k => k.includes(mappings.skepticism_fad));
        let costKey = keys.find(k => k.includes(mappings.skepticism_cost));
        if (row[fadKey] > 5) stats.skeptics.fad++;
        if (row[costKey] > 5) stats.skeptics.expensive++;
    });

    // 6. Calculations for Report
    const topWords = Object.entries(stats.wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const r_value = calculateCorrelation(stats.scores.concern, stats.scores.habits);

    // Message Ranking
    let messageAnalysis = Object.entries(stats.messageRatings).map(([key, ratings]) => {
        let cleanName = key.replace(/Q3_\d+__Importancia_mensajes_video_/, "").substring(0, 45) + "...";
        return { msg: cleanName, score: avg(ratings) };
    }).sort((a, b) => b.score - a.score);

    const today = new Date().toISOString().split('T')[0];

    // 7. Generate Text Report
    return `
=== TECH4REGENAG ANALYSIS REPORT ===
Date: ${today} | Samples: ${stats.sampleSize}

[1] TOP MENTAL ASSOCIATIONS
${topWords.map((w, i) => `   ${i+1}. ${w[0]} (${w[1]})`).join('\n')}

[2] BEHAVIORAL CORRELATION (Say vs Do)
   Concern Index: ${avg(stats.scores.concern).toFixed(1)}/100
   Habit Index:   ${avg(stats.scores.habits).toFixed(1)}/100
   Correlation (r): ${r_value.toFixed(3)} 
   (>0.5 indicates strong alignment)

[3] MESSAGE EFFECTIVENESS
   Winner: "${messageAnalysis[0] ? messageAnalysis[0].msg : 'N/A'}"
   Score: ${messageAnalysis[0] ? messageAnalysis[0].score.toFixed(2) : 0}/5.0

[4] SKEPTICISM & BLOCKCHAIN
   Perceived as Fad: ${((stats.skeptics.fad / stats.sampleSize) * 100).toFixed(1)}%
   Perceived as Expensive: ${((stats.skeptics.expensive / stats.sampleSize) * 100).toFixed(1)}%
   Blockchain Data Demand: ${avg(stats.scores.blockchain_demand).toFixed(2)}/5.0
------------------------------------------------
`;
}

// --- EXECUTION BLOCK ---

try {
    // 1. Check Input Directory
    if (!fs.existsSync(inputDir)) {
        console.log(`❌ Directory ${inputDir} doesn't exist.`);
        process.exit(1);
    }

    console.log(`📂 Checking directory: ${inputDir}`);
    const files = fs.readdirSync(inputDir);
    console.log(`📄 Found files: ${files.length}`);

    if (files.length === 0) {
        console.log("⚠️ Directory is empty");
    } else {
        // Clear previous output file if exists
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }
    }

    // 2. Process Each File
    files.forEach((file, index) => {
        console.log(`\n🔍 Processing file ${index + 1}: ${file}`);
        const filePath = path.join(inputDir, file);

        try {
            const content = fs.readFileSync(filePath, "utf8");

            // Parse JSON
            let jsonObjectParsed;
            try {
                jsonObjectParsed = JSON.parse(content);
            } catch (e) {
                console.log(`❌ Error parsing JSON in ${file}: ${e.message}`);
                return;
            }

            // Run Analysis
            console.log("   Running C2D Algorithm...");
            const resultReport = analyzeSurveyData(jsonObjectParsed);

            // Append result to output file
            fs.appendFileSync(outputFile, resultReport);
            console.log("   ✅ Data appended to result.txt");

        } catch (fileErr) {
            console.log(`   ❌ Error processing file ${file}:`, fileErr.message);
        }
    });

    console.log("\n✅ Global Analysis complete. Results saved to:", outputFile);

} catch (err) {
    console.log("❌ Fatal Error:", err.message);
}
