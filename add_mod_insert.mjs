import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/web/src/components/app-shell.tsx';
let c = readFileSync(p, 'utf8');
if (c.includes('/moderation')) { console.log('exists'); process.exit(0); }
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('/privacy') && lines[i + 1] && lines[i + 1].includes('],')) {
    lines.splice(i + 1, 0, "      { href: '/moderation', label: 'Moderation', icon: ShieldCheck },");
    break;
  }
}
writeFileSync(p, lines.join('\n'));
console.log('done');
