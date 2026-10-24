const fs = require('fs');
const path = 'prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');
const old = '  messages      Message[]\r\nmodel CommunityMute';
const neu = "  messages      Message[]\r\n  reports       Report[]\r\n  savedFunding  SavedFunding[]\r\n  notifications Notification[]\r\n  moneyPlan     MoneyPlan?\r\n  consents      Consent[]\r\n  blocksBlocked UserBlock[] @relation(\"UserBlockedBy\")\r\n  blocksBlocking UserBlock[] @relation(\"UserBlocks\")\r\n  conversationsInitiated Conversation[] @relation(\"ConversationInitiator\")\r\n  conversationsReceived  Conversation[] @relation(\"ConversationRecipient\")\r\n  directMessages         DirectMessage[]\r\n  mutedCommunities       CommunityMute[]\r\n\r\n  @@unique([email])\r\n  @@map(\"user\")\r\n}\r\n\r\nmodel CommunityMute";
if (!content.includes(old)) { console.log('not found'); process.exit(1); }
content = content.split(old).join(neu);
fs.writeFileSync(path, content);
console.log('done');
