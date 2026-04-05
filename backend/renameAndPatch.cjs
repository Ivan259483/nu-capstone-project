const fs = require('fs');
const path = require('path');

const backendDir = __dirname;
const directoriesToConvert = {
  'controllers': '.controller.js',
  'models': '.model.js',
  'routes': '.routes.js',
  'middleware': '.middleware.js',
  'utils': '.utils.js',
  'lib': '.lib.js'
};

const fileMap = {}; // mapping old filename without extension to new filename with extension

for (const [dir, suffix] of Object.entries(directoriesToConvert)) {
  const dirPath = path.join(backendDir, dir);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    if (file.endsWith(suffix)) continue;

    let baseName = file.replace('.js', '');
    
    baseName = baseName.replace(/Controller$/i, '');
    baseName = baseName.replace(/Model$/i, '');
    baseName = baseName.replace(/Routes?$/i, '');
    baseName = baseName.charAt(0).toLowerCase() + baseName.slice(1);
    
    // Prevent empty names if original was just 'Routes'
    if (!baseName) baseName = file.replace('.js', '').toLowerCase();
    
    const newName = `${baseName}${suffix}`;
    const oldPath = path.join(dirPath, file);
    const newPath = path.join(dirPath, newName);
    
    fileMap[oldPath] = newPath;
  }
}

function patchImports(content) {
  let patchedContent = content;
  
  // Regex to match imports: import ... from './path/to/File.js'
  // Also dynamic imports: import('./path/to/File.js')
  const importRegex = /(from\s+['"]|import\(['"])(.+?)(['"]\)?)/g;
  
  patchedContent = patchedContent.replace(importRegex, (match, prefix, reqPath, suffix) => {
    if (!reqPath.startsWith('.')) return match;
    
    const parts = reqPath.split('/');
    const filePart = parts.pop();
    const dirPart = parts.join('/');
    
    const rawName = filePart.replace('.js', '');
    
    for (const [oldPath, newPath] of Object.entries(fileMap)) {
      const oldFilenameRaw = path.basename(oldPath).replace('.js', '');
      
      if (rawName === oldFilenameRaw) {
        const newFilename = path.basename(newPath).replace('.js', '');
        return `${prefix}${dirPart ? dirPart + '/' : ''}${newFilename}.js${suffix}`;
      }
    }
    
    return match;
  });
  
  return patchedContent;
}

function walkAndPatch(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item.endsWith('.cjs')) continue; // Skip script itself
    
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      if (item === '.git') continue;
      walkAndPatch(itemPath);
    } else if (item.endsWith('.js')) {
      const content = fs.readFileSync(itemPath, 'utf8');
      const patchedContent = patchImports(content);
      
      if (content !== patchedContent) {
        fs.writeFileSync(itemPath, patchedContent, 'utf8');
        console.log(`Patched imports in: ${itemPath.replace(backendDir, '')}`);
      }
    }
  }
}

console.log('--- Starting Patching ---');
walkAndPatch(backendDir);

console.log('\n--- Starting Renaming ---');
for (const [oldPath, newPath] of Object.entries(fileMap)) {
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed: ${path.basename(oldPath)} -> ${path.basename(newPath)}`);
  }
}

console.log('Done!');
