// ══════════════════════════════════════════════════════════════════
// tests/run.js — Test Runner
// Jalankan: node tests/run.js
// ══════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'tests/indicators.test.js',
  'tests/scoring.test.js',
  'tests/bandar.test.js',
  'tests/volume.test.js',
  'tests/structure.test.js',
  'tests/context.test.js',
  'tests/scanner.test.js',
  'tests/analyze.integration.test.js',
  'tests/scanner.integration.test.js'
];

let totalPassed = 0, totalFailed = 0;

tests.forEach(file => {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('🧪 ' + file);
  console.log('══════════════════════════════════════════════════════');
  try {
    const output = execSync('node ' + file, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    console.log(output);
    const match = output.match(/Hasil: (\d+) passed, (\d+) failed/);
    if (match) { totalPassed += parseInt(match[1]); totalFailed += parseInt(match[2]); }
  } catch (e) {
    console.log(e.stdout || e.message);
    const match = (e.stdout || '').match(/Hasil: (\d+) passed, (\d+) failed/);
    if (match) { totalPassed += parseInt(match[1]); totalFailed += parseInt(match[2]); }
    else totalFailed++;
  }
});

console.log('\n══════════════════════════════════════════════════════');
console.log(`📋 TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
console.log('══════════════════════════════════════════════════════\n');
if (totalFailed > 0) process.exit(1);
