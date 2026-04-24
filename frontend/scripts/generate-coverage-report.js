const fs = require('fs');
const path = require('path');

const coverageDir = path.join(process.cwd(), 'coverage');
const coverageFile = path.join(coverageDir, 'v8-coverage.json');

if (!fs.existsSync(coverageFile)) {
  console.log('No coverage file found');
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf-8'));

console.log('\n========================================');
console.log('       V8 CODE COVERAGE REPORT');
console.log('========================================\n');

function calculateFunctionCoverage(functions) {
  let totalRanges = 0;
  let coveredRanges = 0;
  
  for (const func of functions || []) {
    const ranges = func.ranges || [];
    totalRanges += ranges.length;
    for (const range of ranges) {
      if (range.count > 0) {
        coveredRanges++;
      }
    }
  }
  
  return { covered: coveredRanges, total: totalRanges };
}

const fileStats = [];

for (const entry of coverage) {
  const url = entry.url || 'unknown';
  const filename = url.includes('/') ? url.split('/').pop().split('?')[0] : url;
  
  const funcCoverage = calculateFunctionCoverage(entry.functions);
  const percent = funcCoverage.total ? Math.round((funcCoverage.covered / funcCoverage.total) * 100) : 0;
  
  const isAppCode = !url.includes('node_modules') && (url.includes('localhost') || url.includes('/_next/'));
  
  fileStats.push({
    filename,
    url,
    functions: funcCoverage,
    percent,
    isAppCode
  });
}

fileStats.sort((a, b) => b.percent - a.percent);

console.log('📁 All Scripts Coverage (Top 25):\n');
for (const file of fileStats.slice(0, 25)) {
  const bar = '█'.repeat(Math.floor(file.percent / 5)) + '░'.repeat(20 - Math.floor(file.percent / 5));
  console.log(`  ${file.filename.substring(0, 45).padEnd(45)} [${bar}] ${file.percent}%`);
}

const appFiles = fileStats.filter(f => f.isAppCode);
const totalFunctions = appFiles.reduce((acc, f) => acc + f.functions.total, 0);
const coveredFunctions = appFiles.reduce((acc, f) => acc + f.functions.covered, 0);
const appPercent = totalFunctions ? Math.round((coveredFunctions / totalFunctions) * 100) : 0;

console.log('\n----------------------------------------');
console.log('📊 App Code Coverage (Functions):');
console.log(`  Covered: ${coveredFunctions}/${totalFunctions} (${appPercent}%)`);
console.log(`  Total App Scripts: ${appFiles.length}`);
console.log('----------------------------------------\n');

const relevantFiles = appFiles.filter(f => {
  const name = f.filename.toLowerCase();
  return name.includes('page') || name.includes('chatinput') || name.includes('chatwindow') || 
         name.includes('sidebar') || name.includes('usechat') || name.includes('usevoice') ||
         name.includes('auth') || name.includes('layout');
});

console.log('🎯 Relevant App Components (Functions):\n');
for (const file of relevantFiles.slice(0, 15)) {
  console.log(`  ${file.filename}: ${file.functions.covered}/${file.functions.total} (${file.percent}%)`);
}

console.log('\n========================================\n');
console.log(`📄 Total Scripts Tracked: ${coverage.length}`);
console.log(`   App Scripts: ${appFiles.length}`);
console.log(`   App Function Coverage: ${appPercent}%`);
console.log('========================================\n');