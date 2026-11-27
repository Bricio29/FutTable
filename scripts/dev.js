import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' }),
];
let closing = false;
function close(code) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('exit', (code) => close(code ?? 1));
  child.on('error', (error) => {
    console.error(error.message);
    close(1);
  });
}
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
