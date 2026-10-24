import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/web/src/components/app-shell.tsx';
let c = readFileSync(p, 'utf8');
if (c.includes('/moderation')) {
  console.log('exists');
  process.exit(0);
}
const needle = "      { href: '/privacy', label: 'Privacy', icon: ShieldCheck },\n    ],\n  },\n];";
if (c.indexOf(needle) === -1) {
  console.log('notfound');
  process.exit(0);
}
const replacement = "      { href: '/privacy', label: 'Privacy', icon: ShieldCheck },\n      { href: '/moderation', label: 'Moderation', icon: ShieldCheck },\n    ],\n  },\n];";
c = c.split(needle).join(replacement);
writeFileSync(p, c);
console.log('done');
