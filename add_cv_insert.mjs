import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/web/src/components/app-shell.tsx';
let c = readFileSync(p, 'utf8');
if (c.includes('/cv')) { console.log('exists'); process.exit(0); }
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('/messages')) {
    // look ahead for group end
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      if (lines[j].includes('},') && j > i) {
        lines.splice(j + 1, 0, "  {", "    label: 'Tools',", "    items: [", "      { href: '/cv', label: 'CV', icon: FileText },", "    ],", "  },");
        break;
      }
    }
    break;
  }
}
writeFileSync(p, lines.join('\n'));
console.log(c.includes('/cv') || readFileSync(p, 'utf8').includes('/cv') ? 'ok' : 'no');
