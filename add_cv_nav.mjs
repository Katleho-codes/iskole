import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/web/src/components/app-shell.tsx';
let c = readFileSync(p, 'utf8');
if (c.includes('/cv')) { console.log('exists'); process.exit(0); }
const from = "  {\n    label: 'Connect',\n    items: [\n      { href: '/communities', label: 'Communities', icon: Users },\n      { href: '/messages', label: 'Messages', icon: MessageCircle },\n    ],\n  },";
const to = "  {\n    label: 'Connect',\n    items: [\n      { href: '/communities', label: 'Communities', icon: Users },\n      { href: '/messages', label: 'Messages', icon: MessageCircle },\n    ],\n  },\n  {\n    label: 'Tools',\n    items: [\n      { href: '/cv', label: 'CV', icon: FileText },\n    ],\n  },";
if (c.indexOf(from) === -1) { console.log('nf'); process.exit(0); }
c = c.replace(from, to);
writeFileSync(p, c);
console.log('done');
