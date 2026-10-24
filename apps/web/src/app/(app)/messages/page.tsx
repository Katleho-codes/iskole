'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type User = { id: string; name: string; email: string };
type Conversation = {
  id: string;
  otherUserId?: string;
  otherUserName?: string;
  otherUser?: User;
  lastMessage?: { id?: string; body: string; createdAt: string } | null;
  updatedAt?: string;
};
type Message = { id: string; body: string; senderId: string; createdAt: string };

export default function MessagesPage() {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        const convs = (data.conversations || []).map((c: any) => ({
          ...c,
          otherUser: c.otherUser || { id: c.otherUserId, name: c.otherUserName, email: '' },
        }));
        setConversations(convs);
      }
    } catch (e) {
      // ignore
    }
  }

  async function searchUsers() {
    if (!searchEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/search?email=${encodeURIComponent(searchEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function startConversation(userId: string) {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults([]);
        setSearchEmail('');
        await loadConversations();
        const found = searchResults.find((u) => u.id === userId);
        const conv: Conversation = {
          id: data.conversation.id,
          otherUserId: userId,
          otherUser: found || { id: userId, name: '', email: '' },
        };
        setSelectedConv(conv);
        loadMessages(data.conversation.id);
      } else {
        // try to load conversations anyway
        await loadConversations();
      }
    } catch (e) {
      // ignore
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      // ignore
    }
  }

  async function sendMessage() {
    if (!selectedConv || !newMessage.trim()) return;
    try {
      const res = await fetch(`/api/conversations/${selectedConv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newMessage }),
      });
      if (res.ok) {
        setNewMessage('');
        loadMessages(selectedConv.id);
        loadConversations();
      }
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Search users by email and send messages." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>New Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Search by email</Label>
              <div className="flex gap-2">
                <Input id="email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)} placeholder="user@example.com" />
                <Button onClick={searchUsers} disabled={loading}>
                  Search
                </Button>
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg border p-2">
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Button size="sm" onClick={() => startConversation(u.id)}>
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 pt-4">
              <p className="text-sm font-medium">Conversations</p>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No conversations yet</p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedConv(c);
                      loadMessages(c.id);
                    }}
                    className={`w-full rounded-lg border p-2 text-left ${selectedConv?.id === c.id ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <p className="text-sm font-medium">{c.otherUser?.name || c.otherUserName || ''}</p>
                    <p className="text-xs text-muted-foreground">{c.otherUser?.email || ''}</p>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{selectedConv ? `Chat with ${selectedConv.otherUser?.name || selectedConv.otherUserName || ''}` : 'Select a conversation'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedConv ? (
              <>
                <div className="h-[400px] space-y-2 overflow-y-auto rounded-lg border p-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">No messages yet</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`max-w-[70%] rounded-lg p-2 ${m.senderId === (selectedConv.otherUser?.id || selectedConv.otherUserId) ? 'bg-muted' : 'ml-auto bg-primary text-primary-foreground'}`}>
                        <p className="text-sm">{m.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                  <Button onClick={sendMessage}>Send</Button>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Select a conversation or start a new one</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
