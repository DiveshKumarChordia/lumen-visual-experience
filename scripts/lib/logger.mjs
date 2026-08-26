const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

let stepNo = 0;

export const log = {
  step(title) {
    stepNo += 1;
    console.log(`\n${C.bold}${C.blue}[${stepNo}] ${title}${C.reset}`);
  },
  ok(msg) { console.log(`  ${C.green}+${C.reset} ${msg}`); },
  /** Already-existed / no-op — the marker that makes reruns readable. */
  skip(msg) { console.log(`  ${C.dim}=${C.reset} ${C.dim}${msg}${C.reset}`); },
  warn(msg) { console.log(`  ${C.yellow}!${C.reset} ${msg}`); },
  err(msg) { console.log(`  ${C.red}x${C.reset} ${msg}`); },
  info(msg) { console.log(`  ${C.dim}${msg}${C.reset}`); },
  value(k, v) { console.log(`  ${C.dim}${k}:${C.reset} ${C.cyan}${v}${C.reset}`); },
  banner(msg) { console.log(`\n${C.bold}${msg}${C.reset}`); },
};
