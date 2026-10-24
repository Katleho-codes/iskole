import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/web/src/components/app-shell.tsx';
let c = readFileSync(p, 'utf8');
if (c.includes('/moderation')) { console.log('exists'); process.exit(0); }
const from = "{ href: '/privacy', label: 'Privacy', icon: ShieldCheck },\n    ],\n  },\n];";
const to = "{ href: '/privacy', label: 'Privacy', icon: ShieldCheck },\n      { href: '/moderation', label: 'Moderation', icon: ShieldCheck },\n    ],\n  },\n];";
if (!c.includes(from)) { console.log('nf'); process.exit(0); }
c = c.replace(from, to);
writeFileSync(p, c);
console.log('done');
