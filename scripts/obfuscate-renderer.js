const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.log('Assets directory not found, skipping obfuscation');
  process.exit(0);
}

const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(assetsDir, file);
  const code = fs.readFileSync(filePath, 'utf8');
  
  const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    shuffleStringArray: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.7,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
  });
  
  fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode());
  console.log(`Obfuscated: ${file}`);
});

console.log('Renderer obfuscation complete');

