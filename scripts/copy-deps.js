const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取生产依赖列表
function getProductionDeps() {
  const result = execSync('npm ls --prod --parseable --silent', { 
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..')
  });
  return result.trim().split('\n').filter(Boolean);
}

// 复制目录
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 主函数
function main() {
  const appDir = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app');
  const nodeModulesDir = path.join(appDir, 'node_modules');
  
  console.log('Copying production dependencies...');
  
  try {
    const deps = getProductionDeps();
    
    for (const depPath of deps) {
      const depName = path.basename(depPath);
      const targetPath = path.join(nodeModulesDir, depName);
      
      if (!fs.existsSync(targetPath)) {
        console.log(`Copying: ${depName}`);
        copyDir(depPath, targetPath);
      }
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
