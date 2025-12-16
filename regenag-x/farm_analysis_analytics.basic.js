// https://raw.githubusercontent.com/zertifier/c2d-alghos-sandbox/refs/heads/main/regenag-x/farm_analysis_analytics.basic.js?token=GHSAT0AAAAAAC45ITPV3GYOCHRQGAR6REOS2KBNOUA
import fs from "fs";
import path from "path";

const inputDir = "/data/inputs";
const outputDir = "/data/outputs";
const outputFile = path.join(outputDir, "result.txt");

function analyzeFarmsData(data) {
    if(!data.farms)
        return {}
    const farmsCount = data.farms.length;
    let fieldsCount = 0;
    let analysesCount = 0;
    let totalMeasurements = 0;
    const analysisDates = new Set();

    for (const farm of data.farms) {
        for (const field of farm.fields) {
            fieldsCount++;
            for (const analysis of field.analysis) {
                analysesCount++;
                analysisDates.add(analysis.date);
                totalMeasurements += analysis.measurements.length;
            }
        }
    }

    const avgMeasurements =
        analysesCount > 0 ? totalMeasurements / analysesCount : 0;

    console.log("📊 Farms Data Analysis Report");
    console.log("---------------------------------");
    console.log(`🌾 Number of farms: ${farmsCount}`);
    console.log(`🌱 Number of fields: ${fieldsCount}`);
    console.log(`📅 Unique analysis dates: ${analysisDates.size}`);
    console.log(`🧪 Total analyses: ${analysesCount}`);
    console.log(
        `⚗️ Average number of measurements per analysis: ${avgMeasurements.toFixed(
            2
        )}`
    );
    return {
        farmsCount,
        fieldsCount,
        uniqueAnalysisDates: analysisDates.size,
        analysesCount,
        avgMeasurements: avgMeasurements.toFixed(2),
    };
}

try {
    if (!fs.existsSync(inputDir)) {
        console.log(`❌ Directory ${inputDir} doesn't exist.`);
    }

    console.log(`📂 Checking directory: ${inputDir}`);
    const files = fs.readdirSync(inputDir);
    console.log(`📄 Found files: ${files.length}`);

    if (files.length === 0) {
        console.log("⚠️ Directory is empty");
    }

    console.log("📋 List of files:");
    files.forEach((file, index) => {
        const filePath = path.join(inputDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${index + 1}. ${file} (${stats.size} bytes)`);
        console.log('File content', file);
    });

    files.forEach(file => {
        console.log(`\n🔍 Processing file: ${file}`);
        const filePath = path.join(inputDir, file);
        console.log('filepath', filePath)
        const content = fs.readFileSync(filePath, "utf8");
        console.log('content', content)
        const jsonObjectParsed = JSON.parse(content);
        console.log('jsonObjectParsed', jsonObjectParsed)
        const result = analyzeFarmsData(jsonObjectParsed);
        console.log('result', result)
        if(!result) return;
        fs.appendFileSync(outputFile, JSON.stringify(result, null, 2));
    });

    if (!Array.isArray(data.farms)) {
        console.log(
            "⚠️ File structure is invalid. Expected 'farms' to be an array. Found:",
            Object.keys(data)
        );
    } else {
        const result = analyzeFarmsData(data);
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log("✅ Analysis complete. Results saved to result.txt");
    }
} catch (err) {
    console.log("❌ Error:", err.message);
}
