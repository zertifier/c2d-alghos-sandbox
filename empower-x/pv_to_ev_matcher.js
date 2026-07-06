const fs = require('fs');
const path = require('path');

const inputDir = "/data/inputs";
const outputDir = "/data/outputs";
const outputFile = path.join(outputDir, "solar-vs-chargers.json");

console.log("=== SCANNING INPUT DIRECTORY ===");

if (!fs.existsSync(inputDir)) {
    throw new Error("Input directory not found: " + inputDir);
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const files = fs.readdirSync(inputDir);
console.log("Files found:", files);

let somData = [];
let etecnicData = [];
let solarData = [];

for (const file of files) {
    // Пропускаем только сервисный файл
    if (file === "algoCustomData.json") continue;

    const fullPath = path.join(inputDir, file);
    
    // Пытаемся прочитать файл, даже если у него нет расширения .json
    let content;
    try {
        content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
        console.log(`Skipping file (not valid JSON): ${file}`);
        continue;
    }

    // Логика распределения по именам твоих файлов:
    if (file.includes('cars')) {
        somData = somData.concat(content);
    } else if (file.includes('chargers')) {
        etecnicData = etecnicData.concat(content);
    } else if (file.includes('surplus') || file.includes('solar')) {
        solarData = solarData.concat(content);
    }
}

const processReport = (som, etecnic, solar) => {
    const balanceMap = {};

    const processConsumption = (data) => {
        if (!Array.isArray(data)) return;
        data.forEach(item => {
            const dt = item.datetime;
            if (!balanceMap[dt]) {
                balanceMap[dt] = {
                    datetime: dt,
                    totalNetworkConsumptionKwh: 0,
                    solarProductionKwh: 0,
                    chargers: []
                };
            }
            if (item.chargers) {
                item.chargers.forEach(ch => {
                    balanceMap[dt].totalNetworkConsumptionKwh += Number(ch.consumptionKWh || 0);
                    balanceMap[dt].chargers.push(ch);
                });
            }
        });
    };

    processConsumption(som);
    processConsumption(etecnic);

    solar.forEach(s => {
        const dt = s.datetime;
        if (!balanceMap[dt]) {
            balanceMap[dt] = { datetime: dt, totalNetworkConsumptionKwh: 0, solarProductionKwh: 0, chargers: [] };
        }
        balanceMap[dt].solarProductionKwh = s.productionKwh || 0;
    });

    return Object.values(balanceMap).map(hour => {
        const consumption = hour.totalNetworkConsumptionKwh;
        const production = hour.solarProductionKwh;
        const usedSolar = Math.min(consumption, production);
        
        return {
            datetime: hour.datetime,
            summary: {
                totalConsumption: Number(consumption.toFixed(2)),
                totalSolarProduction: Number(production.toFixed(2)),
                usedSolarKwh: Number(usedSolar.toFixed(2)),
                gridConsumptionKwh: Number(Math.max(0, consumption - production).toFixed(2)),
                solarPercentage: consumption > 0 ? Math.round((usedSolar / consumption) * 100) : 0
            },
            chargers: hour.chargers
        };
    }).sort((a, b) => a.datetime.localeCompare(b.datetime));
};

const finalResult = processReport(somData, etecnicData, solarData);

fs.writeFileSync(outputFile, JSON.stringify(finalResult, null, 2));
console.log(`=== DONE ===\nProcessed ${finalResult.length} hours. Results: ${outputFile}`);
