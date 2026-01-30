import fs from "fs";
import path from "path";

const INPUT_DIR = "/data/inputs";
const OUTPUT_DIR = "/data/outputs";
const PARAMS_FILE = path.join(INPUT_DIR, "algoCustomParameters.json");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "word_occurrences.json");

/* =========================
   PARAMETER HANDLING
   ========================= */

const loadParameters = () => {
    try {
        if (fs.existsSync(PARAMS_FILE)) {
            const data = fs.readFileSync(PARAMS_FILE, "utf8");
            const params = JSON.parse(data);
            console.log("📋 Parameters loaded from Ocean Protocol:");
            console.log(JSON.stringify(params, null, 2));
            return params;
        } else {
            console.log("⚠️  No parameters file found. Using default behavior (count all words).");
            return {};
        }
    } catch (err) {
        console.error(`❌ Error reading parameters: ${err.message}`);
        return {};
    }
};

/* =========================
   WORD COUNTING LOGIC
   ========================= */

const processTextFile = (filePath, targetWords = null) => {
    console.log(`📄 Processing file: ${filePath}`);
    
    try {
        const content = fs.readFileSync(filePath, "utf8");
        
        // Normalize text: convert to lowercase and split into words
        // Remove punctuation and special characters
        const words = content
            .toLowerCase()
            .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
            .split(/\s+/)
            .filter(word => word.length > 0);
        
        const wordCounts = {};
        
        if (targetWords && Array.isArray(targetWords) && targetWords.length > 0) {
            // Count only specified words
            const targetSet = new Set(targetWords.map(w => w.toLowerCase()));
            
            words.forEach(word => {
                if (targetSet.has(word)) {
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                }
            });
            
            // Ensure all target words are in the result (even with 0 count)
            targetWords.forEach(word => {
                const normalized = word.toLowerCase();
                if (!wordCounts[normalized]) {
                    wordCounts[normalized] = 0;
                }
            });
        } else {
            // Count all words
            words.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        }
        
        return {
            fileName: path.basename(filePath),
            totalWords: words.length,
            uniqueWords: Object.keys(wordCounts).length,
            wordCounts: wordCounts
        };
    } catch (err) {
        console.error(`❌ Error processing file ${filePath}: ${err.message}`);
        return null;
    }
};

const formatResults = (results, topN = null) => {
    const formatted = {
        summary: {
            totalFilesProcessed: results.length,
            totalWordsAcrossAllFiles: results.reduce((sum, r) => sum + r.totalWords, 0),
            totalUniqueWordsAcrossAllFiles: 0
        },
        fileResults: results,
        aggregatedWordCounts: {}
    };
    
    // Aggregate word counts across all files
    results.forEach(result => {
        Object.entries(result.wordCounts).forEach(([word, count]) => {
            formatted.aggregatedWordCounts[word] = (formatted.aggregatedWordCounts[word] || 0) + count;
        });
    });
    
    formatted.summary.totalUniqueWordsAcrossAllFiles = Object.keys(formatted.aggregatedWordCounts).length;
    
    // Sort by frequency (descending)
    const sortedWords = Object.entries(formatted.aggregatedWordCounts)
        .sort((a, b) => b[1] - a[1]);
    
    // Convert back to object (maintaining order in modern JS)
    formatted.aggregatedWordCounts = Object.fromEntries(sortedWords);
    
    // If topN is specified, limit the results
    if (topN && topN > 0) {
        formatted.topWords = Object.fromEntries(sortedWords.slice(0, topN));
    }
    
    return formatted;
};

const printFormattedResults = (results) => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 WORD OCCURRENCE ANALYSIS RESULTS");
    console.log("=".repeat(60));
    
    console.log(`\n📈 Summary:`);
    console.log(`   Files Processed: ${results.summary.totalFilesProcessed}`);
    console.log(`   Total Words: ${results.summary.totalWordsAcrossAllFiles}`);
    console.log(`   Unique Words: ${results.summary.totalUniqueWordsAcrossAllFiles}`);
    
    console.log(`\n📁 Per-File Results:`);
    results.fileResults.forEach((file, idx) => {
        console.log(`   ${idx + 1}. ${file.fileName}`);
        console.log(`      Total Words: ${file.totalWords}`);
        console.log(`      Unique Words: ${file.uniqueWords}`);
    });
    
    console.log(`\n🔤 Top 20 Most Frequent Words (Aggregated):`);
    const topWords = Object.entries(results.aggregatedWordCounts).slice(0, 20);
    topWords.forEach(([word, count], idx) => {
        console.log(`   ${String(idx + 1).padStart(2)}. "${word}": ${count} occurrences`);
    });
    
    if (results.topWords) {
        console.log(`\n⭐ Top ${Object.keys(results.topWords).length} Words (as requested):`);
        Object.entries(results.topWords).forEach(([word, count], idx) => {
            console.log(`   ${String(idx + 1).padStart(2)}. "${word}": ${count} occurrences`);
        });
    }
    
    console.log("\n" + "=".repeat(60));
};

/* =========================
   MAIN EXECUTION
   ========================= */

try {
    console.log("🚀 Starting Word Counter Algorithm (Ocean Protocol C2D)");
    console.log("=".repeat(60));
    
    // Load parameters from Ocean Protocol
    const params = loadParameters();
    
    // Extract parameters
    const targetWords = params.targetWords || params.target_words || params.words || null;
    const topN = params.topN || params.top_n || params.limit || null;
    const filePattern = params.filePattern || params.file_pattern || "*.txt";
    
    console.log(`\n🎯 Configuration:`);
    console.log(`   Target Words: ${targetWords ? JSON.stringify(targetWords) : "All words (default)"}`);
    console.log(`   Top N Limit: ${topN || "None"}`);
    console.log(`   File Pattern: ${filePattern}`);
    
    // Check input directory
    if (!fs.existsSync(INPUT_DIR)) {
        throw new Error(`Input directory ${INPUT_DIR} not found`);
    }
    
    // Find all .txt files in input directory
    const allFiles = fs.readdirSync(INPUT_DIR);
    const txtFiles = allFiles.filter(f => 
        !f.startsWith(".") && 
        (f.endsWith(".txt") || f.endsWith(".text"))
    );
    
    console.log(`\n📂 Found ${txtFiles.length} text file(s) in input directory.`);
    
    if (txtFiles.length === 0) {
        throw new Error("No .txt files found in input directory");
    }
    
    // Process all files
    const results = [];
    txtFiles.forEach(file => {
        const filePath = path.join(INPUT_DIR, file);
        const result = processTextFile(filePath, targetWords);
        if (result) {
            results.push(result);
            console.log(`   ✅ Processed: ${file} (${result.totalWords} words, ${result.uniqueWords} unique)`);
        }
    });
    
    if (results.length === 0) {
        throw new Error("No files were successfully processed");
    }
    
    // Format and aggregate results
    const finalResults = formatResults(results, topN);
    
    // Print formatted results to console
    printFormattedResults(finalResults);
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        try {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        } catch (e) {
            console.error(`⚠️  Could not create output directory: ${e.message}`);
        }
    }
    
    // Write results to output file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalResults, null, 2));
    console.log(`\n✅ Results successfully written to ${OUTPUT_FILE}`);
    
    console.log("\n🎉 Word Counter Algorithm completed successfully!");
    
} catch (error) {
    console.error("\n❌ Fatal Error:", error.message);
    console.error(error.stack);
    process.exit(1);
}
