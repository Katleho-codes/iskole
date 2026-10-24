import { readFileSync, writeFileSync } from 'fs';
const p = 'C:/Users/user/OneDrive/Documents/github/iskole/apps/api/prisma/schema.prisma';
let c = readFileSync(p, 'utf8');
if (c.includes('ConnectionRequest')) { console.log('exists'); process.exit(0); }
const addition = "\nmodel ConnectionRequest {\n  id        String   @id @default(cuid())\n  companyId String\n  company   User     @relation(\"CompanyConnection\", fields: [companyId], references: [id], onDelete: Cascade)\n  learnerId String\n  learner   User     @relation(\"LearnerConnection\", fields: [learnerId], references: [id], onDelete: Cascade)\n  message   String?\n  status    String   @default(\"PENDING\")\n  createdAt DateTime @default(now())\n  respondedAt DateTime?\n\n  @@unique([companyId, learnerId])\n  @@index([learnerId])\n  @@index([companyId])\n  @@map(\"connectionRequest\")\n}\n";
c += addition;
writeFileSync(p, c);
console.log('added');
