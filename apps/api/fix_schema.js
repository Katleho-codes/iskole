const fs = require('fs');
const path = 'prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');
const old = '  messages      Message[]\nmodel CommunityMute';
const neu = `  messages      Message[]
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

model CommunityMute`;
if (!content.includes(old)) { console.log('not found'); process.exit(1); }
content = content.split(old).join(neu);
fs.writeFileSync(path, content);
console.log('done');
