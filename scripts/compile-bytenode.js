const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const distElectronDir = path.join(__dirname, '../dist-electron');

const filesToCompile = ['main.js', 'preload.js'];
const otherFiles = ['ipcHandlers.js', 'LLMHelper.js', 'ProcessingHelper.js', 'ScreenshotHelper.js', 'WindowHelper.js', 'shortcuts.js'];


[...filesToCompile, ...otherFiles].forEach(file => {
  const filePath = path.join(distElectronDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  
  try {
    bytenode.compileFile(filePath, `${filePath}c`);
    console.log(`Compiled: ${file} -> ${file}.jsc`);
  } catch (error) {
    console.error(`Error compiling ${file}:`, error.message);
  }
});


const mainPath = path.join(distElectronDir, 'main.js');
const preloadPath = path.join(distElectronDir, 'preload.js');
const mainBackupPath = path.join(distElectronDir, 'main-backup.js');
const preloadBackupPath = path.join(distElectronDir, 'preload-backup.js');


if (fs.existsSync(mainPath) && !fs.existsSync(mainBackupPath)) {
  fs.copyFileSync(mainPath, mainBackupPath);
}


const mainLoader = `try {
  require('bytenode');
  module.exports = require('./main.jsc');
} catch (e) {
  // Fallback for dev or if bytenode fails
  delete require.cache[require.resolve('./main-backup.js')];
  module.exports = require('./main-backup.js');
}`;
fs.writeFileSync(mainPath, mainLoader);


if (fs.existsSync(preloadPath) && !fs.existsSync(preloadBackupPath)) {
  fs.copyFileSync(preloadPath, preloadBackupPath);
}


const preloadLoader = `try {
  require('bytenode');
  module.exports = require('./preload.jsc');
} catch (e) {
  delete require.cache[require.resolve('./preload-backup.js')];
  module.exports = require('./preload-backup.js');
}`;
fs.writeFileSync(preloadPath, preloadLoader);

console.log('Bytenode compilation complete - loaders installed');
