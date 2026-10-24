const fs = require('fs');
const path = 'prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');
const idx = content.indexOf('  messages      Message[]');
if (idx === -1) { console.log('x'); process.exit(1); }
const idx2 = content.indexOf('model CommunityMute', idx);
if (idx2 === -1) { console.log('y'); process.exit(1); }
// find start of line
let lineStart = content.lastIndexOf('\n', idx) + 1;
// replace from lineStart up to before model CommunityMute
content = content.slice(0, lineStart) + `  messages      Message[]
  reports       Report[]
  savedFunding  SavedFunding[]
  notifications Notification[]
  moneyPlan     MoneyPlan?
  consents      Consent[]
  blocksBlocked UserBlock[] @relation("UserBlockedBy")
  blocksBlocking UserBlock[] @relation("UserBlocks")
  conversationsInitiated Conversation[] @relation("ConversationInitiator")
  conversationsReceived  Conversation[] @relation("ConversationRecipient")
  directMessages         DirectMessage[]
  mutedCommunities       CommunityMute[]

  @@unique([email])
  @@map("user")
}

` + content.slice(idx2);
fs.writeFileSync(path, content);
console.log('done');
