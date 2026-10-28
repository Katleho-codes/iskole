'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Search, Send, ShieldOff, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getJson, postJson, mutateJson, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type User = { id: string; name: string; email: string };

type Conversation = {
  id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserEmail?: string;
  lastMessage?: { id?: string; body: string; createdAt: string } | null;
  updatedAt?: string;
};

type Message = { id: string; body: string; senderId: string; createdAt: string };

type ConversationsResponse = { conversations: Conversation[] };
type MessagesResponse = { messages: Message[] };
type SearchResponse = { users: User[] };
type BlocksResponse = { blocks: Array<{ id: string; blockedId: string; blockedName: string }> };

const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 15000;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function conversationName(conversation: Conversation) {
  return conversation.otherUserName || conversation.otherUserEmail || 'Conversation';
}

export default function MessagesPage() {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'done'>('idle');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockBusy, setBlockBusy] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedConv?.id ?? null;
  }, [selectedConv]);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    try {
      const data = await getJson<ConversationsResponse>('/api/conversations');
      setConversations(data.conversations ?? []);
      return data.conversations ?? [];
    } catch (e) {
      setError(errorMessage(e));
      return [];
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await getJson<MessagesResponse>(`/api/conversations/${conversationId}/messages`);
      // Ignore a slow response for a conversation the learner already left.
      if (selectedIdRef.current === conversationId) {
        setMessages(data.messages ?? []);
      }
    } catch (e) {
      if (selectedIdRef.current === conversationId) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadConversations();
    })();
  }, [loadConversations]);

  const loadBlocks = useCallback(async () => {
    try {
      const data = await getJson<BlocksResponse>('/api/blocks');
      setBlockedIds((data.blocks ?? []).map((block) => block.blockedId));
    } catch {
      // A block list failure must not stop the thread from rendering.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadBlocks();
    })();
  }, [loadBlocks]);

  // Poll the open thread while the tab is visible so a reply lands without a refresh.
  useEffect(() => {
    if (!selectedConv) return;
    const conversationId = selectedConv.id;
    const tick = () => {
      if (document.visibilityState === 'visible') void loadMessages(conversationId);
    };
    tick();
    const interval = setInterval(tick, THREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedConv, loadMessages]);

  // Refresh the list on a slower cadence for new conversations and last-message previews.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void loadConversations();
    };
    const interval = setInterval(tick, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, selectedConv]);

  async function searchUsers() {
    const email = searchEmail.trim();
    if (!email) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    setSearchState('searching');
    setError(null);
    try {
      const data = await getJson<SearchResponse>(`/api/users/search?email=${encodeURIComponent(email)}`);
      setSearchResults(data.users ?? []);
      setSearchState('done');
    } catch (e) {
      setError(errorMessage(e));
      setSearchState('idle');
    }
  }

  function selectConversation(conversation: Conversation) {
    setError(null);
    setSelectedConv(conversation);
    setMessages([]);
    void loadMessages(conversation.id);
  }

  async function startConversation(user: User) {
    setStartingUserId(user.id);
    setError(null);
    try {
      const data = await postJson<{ conversation: { id: string } }>('/api/conversations', {
        recipientId: user.id,
      });

      setSearchResults([]);
      setSearchEmail('');
      setSearchState('idle');

      const list = await loadConversations();
      const known = list.find((c) => c.id === data.conversation.id);
      selectConversation(
        known ?? {
          id: data.conversation.id,
          otherUserId: user.id,
          otherUserName: user.name,
          otherUserEmail: user.email,
          lastMessage: null,
        },
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStartingUserId(null);
    }
  }

  async function sendMessage() {
    const body = newMessage.trim();
    if (!selectedConv || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      await postJson<{ message: Message }>(`/api/conversations/${selectedConv.id}/messages`, { body });
      setNewMessage('');
      await Promise.all([loadMessages(selectedConv.id), loadConversations()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function toggleBlock() {
    if (!selectedConv || blockBusy) return;
    const otherId = selectedConv.otherUserId;
    const isBlocked = blockedIds.includes(otherId);
    if (!isBlocked && !confirm(`Block ${conversationName(selectedConv)}? They will not be able to message you.`)) {
      return;
    }
    setBlockBusy(true);
    setError(null);
    try {
      if (isBlocked) {
        await mutateJson(`/api/blocks/${otherId}`, 'DELETE');
        setBlockedIds((ids) => ids.filter((id) => id !== otherId));
      } else {
        await postJson('/api/blocks', { userId: otherId });
        setBlockedIds((ids) => [...ids, otherId]);
      }
      await loadMessages(selectedConv.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBlockBusy(false);
    }
  }

  const visibleMessages = useMemo(() => messages, [messages]);
  const selectedIsBlocked = selectedConv
    ? blockedIds.includes(selectedConv.otherUserId)
    : false;
  const conversationTitle = selectedConv
    ? conversationName(selectedConv)
    : 'Select a conversation';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Search for someone by email, start a conversation, and keep it going."
      />

      {error ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-[10px] border border-danger/25 bg-danger-soft/50 px-4 py-3 text-sm text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-md px-1 text-xs font-semibold uppercase tracking-wide hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>New conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Search by email</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchUsers();
                    }
                  }}
                  placeholder="user@example.com"
                />
                <Button onClick={() => void searchUsers()} disabled={searchState === 'searching'}>
                  {searchState === 'searching' ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">Search</span>
                </Button>
              </div>
            </div>

            {searchState === 'done' && searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">No one matched that email.</p>
            ) : null}

            {searchResults.length > 0 ? (
              <ul className="space-y-2">
                {searchResults.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void startConversation(user)}
                      disabled={startingUserId !== null}
                    >
                      {startingUserId === user.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Start
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Conversations</p>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No conversations yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {conversations.map((conversation) => {
                    const active = selectedConv?.id === conversation.id;
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => selectConversation(conversation)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'w-full rounded-lg border p-2.5 text-left transition-colors',
                            active
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {conversation.otherUserName || conversation.otherUserEmail || 'Conversation'}
                            </span>
                            {conversation.updatedAt ? (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {formatTime(conversation.updatedAt)}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {conversation.lastMessage?.body ?? 'No messages yet'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{conversationTitle}</CardTitle>
              {selectedConv ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleBlock()}
                  disabled={blockBusy}
                >
                  {blockBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : selectedIsBlocked ? (
                    <ShieldCheck className="size-4" aria-hidden="true" />
                  ) : (
                    <ShieldOff className="size-4" aria-hidden="true" />
                  )}
                  {selectedIsBlocked ? 'Unblock' : 'Block'}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedConv ? (
              <>
                {selectedIsBlocked ? (
                  <p
                    role="status"
                    className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                  >
                    You blocked {conversationName(selectedConv)}. Unblock to send or receive messages.
                  </p>
                ) : null}
                <div
                  ref={threadRef}
                  className="h-[420px] space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3"
                  aria-live="polite"
                >
                  {visibleMessages.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                      No messages yet. Say hello.
                    </p>
                  ) : (
                    visibleMessages.map((message) => {
                      const mine = message.senderId !== selectedConv.otherUserId;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            'max-w-[75%] rounded-lg px-3 py-2',
                            mine
                              ? 'ml-auto bg-primary text-primary-foreground'
                              : 'bg-card text-card-foreground border border-border',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                          <p
                            className={cn(
                              'mt-1 text-[10px]',
                              mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                          >
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedIsBlocked ? 'Unblock to send a message' : 'Type a message...'}
                    maxLength={2000}
                    disabled={selectedIsBlocked}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={sending || selectedIsBlocked || !newMessage.trim()}
                  >
                    {sending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Send
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <MessageCircle className="size-8" aria-hidden="true" />
                <p>Select a conversation or start a new one.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
