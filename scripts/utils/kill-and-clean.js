import { execSync } from 'child_process';
import { rmSync } from 'fs';

// 关闭进程
try { execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' }); } catch(e) {}
try { execSync('taskkill /F /IM "LUO Music.exe"', { stdio: 'ignore' }); } catch(e) {}

// 等待一下
await new Promise(r => setTimeout(r, 1000));

// 删除目录
try {
  rmSync('release_v3', { recursive: true, force: true });
  console.log('✅ 清理完成');
} catch(e) {
  console.log('✅ 清理完成（目录可能不存在）');
}
