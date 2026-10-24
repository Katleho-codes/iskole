import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/api/prisma/schema.prisma';
let c = readFileSync(p, 'utf8');
if (c.includes('companyConnections')) { console.log('exists'); process.exit(0); }
c = c.replace("  notifications             Notification[]\n", "  notifications             Notification[]\n  companyConnections        ConnectionRequest[] @relation(\"CompanyConnection\")\n  learnerConnections        ConnectionRequest[] @relation(\"LearnerConnection\")\n");
writeFileSync(p, c);
console.log('done');
