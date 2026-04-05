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

// Phase 1: Build the map of old vs new names
for (const [dir, suffix] of Object.entries(directoriesToConvert)) {
  const dirPath = path.join(backendDir, dir);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    if (file.endsWith(suffix)) continue; // already converted

    // Basic camelCase to lowercase with suffix.
    // e.g. authController.js -> auth.controller.js
    let baseName = file.replace('.js', '');
    
    // Remove "Controller", "Model", "Route", "Routes" if they exist at the end
    baseName = baseName.replace(/Controller$/i, '');
    baseName = baseName.replace(/Model$/i, '');
    baseName = baseName.replace(/Routes?$/i, '');
    
    // special cases for typical naming:
    // e.g. ActivityLog -> activityLog
    // Make sure first letter is lowercase
    baseName = baseName.charAt(0).toLowerCase() + baseName.slice(1);
    
    const newName = `${baseName}${suffix}`;
    
    const oldPath = path.join(dirPath, file);
    const newPath = path.join(dirPath, newName);
    
    fileMap[oldPath] = newPath;
  }
}

// Phase 2: Create a function to patch requires
function patchRequires(content) {
  let patchedContent = content;
  
  // Find all require statements
  const requireRegex = /(require\(['"])(.+?)(['"]\))/g;
  
  patchedContent = patchedContent.replace(requireRegex, (match, prefix, reqPath, suffix) => {
    // Determine the absolute path of the require based on the source file? We don't have source file context easily here for relative resolutions in simple regex.
    // Instead of resolving relative, let's just use a string replacement strategy based on the old base names.

    // If it's an external module, leave it
    if (!reqPath.startsWith('.')) return match;
    
    // Split the reqPath into dir and file
    const parts = reqPath.split('/');
    const filePart = parts.pop();
    const dirPart = parts.join('/');
    
    // Clean up file part (remove .js if present)
    const rawName = filePart.replace('.js', '');
    
    // Check if rawName maps to something we renamed
    for (const [oldPath, newPath] of Object.entries(fileMap)) {
      const oldFilenameRaw = path.basename(oldPath).replace('.js', ''); // e.g. 'authController' or 'User'
      
      if (rawName === oldFilenameRaw) {
        // e.g. newFilename = 'auth.controller'
        const newFilename = path.basename(newPath).replace('.js', '');
        return `${prefix}${dirPart}/${newFilename}${suffix}`;
      }
    }
    
    return match;
  });
  
  return patchedContent;
}

// Phase 3: Read all .js files, patch their requires, and save
function walkAndPatch(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === 'renameAndPatch.js') continue;
    
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      walkAndPatch(itemPath);
    } else if (item.endsWith('.js')) {
      const content = fs.readFileSync(itemPath, 'utf8');
      const patchedContent = patchRequires(content);
      
      if (content !== patchedContent) {
        fs.writeFileSync(itemPath, patchedContent, 'utf8');
        console.log(`Patched requires in: ${itemPath.replace(backendDir, '')}`);
      }
    }
  }
}

console.log('--- Starting Patching ---');
walkAndPatch(backendDir);

// Phase 4: Rename the physical files
console.log('\n--- Starting Renaming ---');
for (const [oldPath, newPath] of Object.entries(fileMap)) {
  fs.renameSync(oldPath, newPath);
  console.log(`Renamed: ${path.basename(oldPath)} -> ${path.basename(newPath)}`);
}

console.log('Done!');
