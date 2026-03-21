import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';

// ✅ Task 4.1 — Properly typed via src/vite-env.d.ts (no more 'as any' hack)
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface LogEntry {
  _id: string; from: string; body: string; reply: string; model: string; ts: string; accountId: string;
  needsApproval?: boolean; isApproved?: boolean; draftReply?: string;
}

interface Contact {
  contactId: string;
  name?: string;
  pushname?: string;
  prompt?: string;
  context?: string;
  unreadCount?: number;
  isAiEnabled?: boolean;
  chatStyle?: string;
}

interface WhatsAppAccount {
  sessionId: string;
  phoneNumber?: string;
  status: string;
  provider: string;
  model: string;
  apiKey?: string;
  qrCode?: string | null;
  lastActive?: string | null;
}

interface BotStatus {
  sessionId?: string | null;
  bot: string;
  model: string;
  availableModels: string[];
  provider: 'ollama' | 'openai';
  phoneNumber?: string;
  qr?: string | null;
  bio?: string;
  lastActive?: string | null;
}

interface Analytics {
  totalMessages: number;
  modelStats: { _id: string; count: number }[];
  dailyStats: { _id: string; count: number }[];
}

type View = 'chats' | 'settings' | 'analytics' | 'database';

const STATUS_COLOR: Record<string, string> = {
  ready: '#22c55e', qr: '#f59e0b', starting: '#94a3b8', disconnected: '#ef4444',
};

export default function App() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<BotStatus>({
    sessionId: null,
    bot: 'disconnected',
    model: '—',
    availableModels: [],
    provider: 'ollama',
    phoneNumber: 'Not Linked',
    qr: null,
    lastActive: null
  });
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>('chats');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [summary, setSummary] = useState<string>('Click "Refresh" to generate summary...');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [schema, setSchema] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Local state for editing contact context
  const [editPrompt, setEditPrompt] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editName, setEditName] = useState('');
  const [editAiEnabled, setEditAiEnabled] = useState(true);
  const [editChatStyle, setEditChatStyle] = useState('friendly');
  const [editBio, setEditBio] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchAccounts = async () => {
    const res = await fetch(`${API}/api/accounts`);
    const data: WhatsAppAccount[] = await res.json();
    setAccounts(data);
    setSelectedAccountId((prev) => {
      if (data.length === 0) return prev;
      if (prev && data.some((account) => account.sessionId === prev)) return prev;
      return data[0].sessionId;
    });
  };

  const fetchStatus = async (accountId = selectedAccountId) => {
    if (!accountId) return;

    const [statusRes, contactsRes, messagesRes] = await Promise.all([
      fetch(`${API}/api/status?accountId=${accountId}`),
      fetch(`${API}/api/contacts?accountId=${accountId}`),
      fetch(`${API}/api/messages?accountId=${accountId}`)
    ]);

    const nextStatus: BotStatus = await statusRes.json();
    const nextContacts: Contact[] = await contactsRes.json();
    const nextMessages: LogEntry[] = await messagesRes.json();

    setStatus(nextStatus);
    setContacts(nextContacts);
    setMessages(nextMessages);
    setEditBio(nextStatus.bio || '');
    setQrCodes((prev) => {
      const next = { ...prev };
      if (nextStatus.qr) next[accountId] = nextStatus.qr;
      else delete next[accountId];
      return next;
    });
  };

  useEffect(() => {
    const sock = io(API);
    socketRef.current = sock;

    sock.on('connect', () => console.log('[Socket] Connected to backend'));

    return () => {
      sock.disconnect();
    };
  }, []);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    const handleNewMessage = (payload: any) => {
      const entry: LogEntry = payload.accountId ? payload : payload;
      const contact: Contact | undefined = payload.contact;

      if (entry.accountId === selectedAccountId) {
        setMessages((prev) => [...prev, entry]);

        setContacts((prev) => {
          const exists = prev.find(c => c.contactId === entry.from);
          if (exists) {
            const isSelected = selectedContact?.contactId === entry.from;
            return prev.map(c => c.contactId === entry.from ? {
              ...c,
              ...contact,
              unreadCount: isSelected ? 0 : (c.unreadCount || 0) + 1
            } : c);
          }
          return [{ ...(contact || { contactId: entry.from }), unreadCount: 1 }, ...prev];
        });

        if (selectedContact && entry.from === selectedContact.contactId) {
          fetchSummary(entry.from);
        }
      }
    };

    const handleAccountStatus = ({ sessionId, status, qr }: { sessionId: string; status: string; qr?: string | null }) => {
      setAccounts((prev) => {
        const existingIndex = prev.findIndex((account) => account.sessionId === sessionId);
        const nextAccount: WhatsAppAccount = existingIndex >= 0
          ? {
            ...prev[existingIndex],
            status,
            qrCode: qr ?? null,
            lastActive: new Date().toISOString()
          }
          : {
            sessionId,
            status,
            provider: 'ollama',
            model: '',
            phoneNumber: 'Not Linked',
            qrCode: qr ?? null,
            lastActive: new Date().toISOString()
          };

        if (existingIndex === -1) return [nextAccount, ...prev];
        return prev.map((account, index) => index === existingIndex ? nextAccount : account);
      });

      setQrCodes((prev) => {
        const next = { ...prev };
        if (qr) next[sessionId] = qr;
        else delete next[sessionId];
        return next;
      });

      if (!selectedAccountId || sessionId === selectedAccountId) {
        fetchStatus(sessionId);
      }
    };

    sock.on('new_message', handleNewMessage);
    sock.on('account_status', handleAccountStatus);

    sock.on('send_whatsapp_reply', ({ accountId, to, body, chatId }: any) => {
      // Local optimistic update for approval
      if (accountId === selectedAccountId) {
        setMessages(prev => prev.map(m => m._id === chatId ? { ...m, reply: body, needsApproval: false, isApproved: true } : m));
      }
    });

    return () => {
      sock.off('new_message', handleNewMessage);
      sock.off('account_status', handleAccountStatus);
      sock.off('send_whatsapp_reply');
    };
  }, [selectedAccountId, selectedContact]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSummary = async (id: string) => {
    if (!selectedAccountId) return;
    const res = await fetch(`${API}/api/summarize/${id}?accountId=${selectedAccountId}`);
    const data = await res.json();
    setSummary(data.summary || 'Summary unavailable.');
  };

  const fetchAnalytics = async () => {
    const res = await fetch(`${API}/api/analytics${selectedAccountId ? `?accountId=${selectedAccountId}` : ''}`);
    const data = await res.json();
    setAnalytics(data);
  };

  const fetchSchemaAndSystem = async () => {
    const sRes = await fetch(`${API}/api/schema`);
    const sysRes = await fetch(`${API}/api/system-status`);
    setSchema(await sRes.json());
    setSystemStatus(await sysRes.json());
  };

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { fetchStatus(); }, [selectedAccountId]);
  useEffect(() => { if (view === 'analytics') fetchAnalytics(); }, [view, selectedAccountId]);
  useEffect(() => { if (view === 'database') fetchSchemaAndSystem(); }, [view, selectedAccountId]);

  const saveContactDetails = async () => {
    if (!selectedContact || !selectedAccountId) return;
    await fetch(`${API}/api/contact-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedContact.contactId,
        accountId: selectedAccountId,
        prompt: editPrompt,
        context: editContext,
        name: editName,
        isAiEnabled: editAiEnabled,
        chatStyle: editChatStyle
      })
    });

    // Save bio at account level only if it changed
    const currentBio = status.bio || '';
    console.log('[Dashboard] Saving... editBio:', editBio, 'currentBio:', currentBio);
    
    if (selectedAccountId && editBio !== currentBio) {
      try {
        console.log('[Dashboard] Bio changed, calling /api/config...');
        const res = await fetch(`${API}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: selectedAccountId, bio: editBio })
        });
        if (!res.ok) {
          const errData = await res.json();
          console.error('[Dashboard] /api/config failed:', errData);
        } else {
          // Update local status bio to prevent repeated calls
          setStatus(prev => ({ ...prev, bio: editBio }));
        }
      } catch (err) {
        console.error('Failed to update bio:', err);
      }
    }

    // Refresh contact in list
    setContacts(prev => prev.map(c => c.contactId === selectedContact.contactId ? { 
      ...c, name: editName, prompt: editPrompt, context: editContext, isAiEnabled: editAiEnabled, chatStyle: editChatStyle 
    } : c));
    alert('Details saved!');
  };

  const handleApprove = async (chatId: string, text: string) => {
    await fetch(`${API}/api/chat/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text })
    });
  };

  useEffect(() => {
    if (selectedContact) {
      setEditPrompt(selectedContact.prompt || '');
      setEditContext(selectedContact.context || '');
      setEditName(selectedContact.name || '');
      setEditAiEnabled(selectedContact.isAiEnabled ?? true);
      setEditChatStyle(selectedContact.chatStyle || 'friendly');

      // Clear unread count locally
      setContacts(prev => prev.map(c => c.contactId === selectedContact.contactId ? { ...c, unreadCount: 0 } : c));
    }
  }, [selectedContact]);

  const connectWhatsApp = async () => {
    if (!selectedAccountId) return;
    setIsRefreshing(true);
    try {
      await fetch(`${API}/api/refresh-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccountId })
      });
      alert('QR refresh request sent successfully. A fresh QR code will appear below once the bot restarts (usually takes 5-10 seconds).');
    } catch (err) {
      alert('Failed to send QR refresh request. Please check if the bot server is running.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddAccount = async () => {
    const sessionId = prompt('Enter a unique name for this WhatsApp session (e.g., "work", "personal"):');
    if (!sessionId) return;
    
    try {
      const res = await fetch(`${API}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to add account: ${err.error}`);
        return;
      }
      
      await fetchAccounts();
      setSelectedAccountId(sessionId);
      alert(`Account "${sessionId}" added! You can now link it in Settings.`);
    } catch (err) {
      alert('Failed to connect to server.');
    }
  };

  // New: Sync messages manually
  const syncMessages = async () => {
    if (!selectedAccountId) return;
    await fetch(`${API}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: selectedAccountId }) });
    // After syncing, re-fetch messages and contacts
    fetchStatus(selectedAccountId);
    alert('Sync completed. Messages refreshed.');
  };

  const formatStatusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const formatLastActive = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Waiting for activity';
  const selectedAccount = accounts.find((account) => account.sessionId === selectedAccountId) || null;
  const currentQrCode = selectedAccountId
    ? qrCodes[selectedAccountId] || (status.sessionId === selectedAccountId ? status.qr || null : null) || selectedAccount?.qrCode || null
    : null;
  const isConnected = status.bot === 'ready' && Boolean(status.phoneNumber && status.phoneNumber !== 'Not Linked');
  const connectButtonLabel = isConnected ? 'Reconnect / New QR' : 'Connect WhatsApp';
  const connectionSummary = isConnected
    ? 'This account is linked and ready to send replies.'
    : currentQrCode
      ? 'Scan the QR code below from WhatsApp on your phone to finish linking this account.'
      : 'Generate a QR code to connect this WhatsApp account from the settings page.';
  const getContactDisplay = (c: Contact) => c.name || c.pushname || c.contactId.split('@')[0];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Side Rail */}
      <nav className="side-rail">
        <div className="logo">AI</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {accounts.map(acc => (
            <button
              key={acc.sessionId}
              onClick={() => setSelectedAccountId(acc.sessionId)}
              style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 16, border: selectedAccountId === acc.sessionId ? '2px solid #38bdf8' : 'none',
                background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
              }}>🤖</div>
              <div style={{
                position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%',
                background: STATUS_COLOR[acc.status] || '#94a3b8', border: '2px solid #0f172a'
              }} />
            </button>
          ))}
          <button
            onClick={handleAddAccount}
            style={{ 
              width: 52, height: 52, borderRadius: 16, background: 'transparent', 
              border: '2px dashed var(--border)', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: 24, color: 'var(--text-muted)' 
            }}
            title="Add Another WhatsApp Account"
          >+</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button className={`nav-item ${view === 'chats' ? 'active' : ''}`} onClick={() => setView('chats')}>💬</button>
          <button className={`nav-item ${view === 'analytics' ? 'active' : ''}`} onClick={() => setView('analytics')}>📊</button>
          <button className={`nav-item ${view === 'database' ? 'active' : ''}`} onClick={() => setView('database')}>🗄️</button>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>⚙️</button>
        </div>
      </nav>

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'chats' && (
          <>
            {/* Column 1: Contacts */}
            <div className="contact-list">
              <div className="list-header">
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>Messages</h2>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {contacts.map(c => (
                  <button
                    key={c.contactId}
                    className={`contact-item ${selectedContact?.contactId === c.contactId ? 'active' : ''}`}
                    onClick={() => setSelectedContact(c)}
                  >
                    <div className="avatar">👤</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {getContactDisplay(c)}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {messages.some(m => m.from === c.contactId && m.needsApproval) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />}
                          {c.unreadCount ? <span className="unread-badge">{c.unreadCount}</span> : null}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.contactId.split('@')[0]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Column 2: Chat */}
            <div className="chat-container">
              <header className="chat-header">
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>{selectedContact ? getContactDisplay(selectedContact) : 'Select a conversation'}</h3>
                  {selectedContact && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedContact.contactId}</div>}
                </div>
              </header>
              <div className="message-area">
                {messages.filter(m => m.from === selectedContact?.contactId).map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="message-bubble message-user">{m.body}</div>
                    {m.needsApproval ? (
                      <div className="approval-banner">
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>🚨</span> NEEDS APPROVAL
                        </div>
                        <div className="draft-box">
                          <textarea 
                            defaultValue={m.draftReply} 
                            id={`draft-${m._id}`}
                            rows={2}
                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 13, resize: 'none', padding: 0 }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button 
                            className="btn-primary" 
                            style={{ flex: 1, padding: '6px', fontSize: 12, background: '#22c55e' }}
                            onClick={() => {
                              const el = document.getElementById(`draft-${m._id}`) as HTMLTextAreaElement;
                              handleApprove(m._id, el.value);
                            }}
                          >✅ Approve</button>
                          <button 
                            className="btn-primary btn-outline" 
                            style={{ flex: 1, padding: '6px', fontSize: 12 }}
                            onClick={() => {
                              // Logic to reject or ignore could go here
                              setMessages(prev => prev.map(msg => msg._id === m._id ? { ...msg, needsApproval: false } : msg));
                            }}
                          >🗑️ Dismiss</button>
                        </div>
                      </div>
                    ) : (
                      <div className="message-bubble message-ai">{m.reply || (m.isApproved ? 'Sent' : '...')}</div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Column 3: Context Panel */}
            <aside className="right-panel">
              {selectedContact ? (
                <>
                  <section>
                    <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      Conversation Summary
                      <button
                        onClick={() => fetchSummary(selectedContact.contactId)}
                        className="btn-primary"
                        style={{ padding: '4px 8px', fontSize: 10, borderRadius: 6, margin: 0 }}
                      >
                        🔄 Refresh
                      </button>
                    </div>
                    <div className="card" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                      {summary}
                    </div>
                  </section>

                  <section>
                    <div className="panel-title">Contact Details</div>
                    <div className="card">
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>NAME (OPTIONAL)</label>
                        <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Friendly name..." />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>USER CONTEXT</label>
                        <textarea
                          rows={3} value={editContext} onChange={e => setEditContext(e.target.value)}
                          placeholder="e.g. This is the CEO of Acme Inc..."
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CUSTOM AI INSTRUCTIONS</label>
                        <textarea
                          rows={4} value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                          placeholder="e.g. Always be very formal with this person..."
                        />
                      </div>
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>AI Control</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Auto-reply to this chat</div>
                        </div>
                        <div 
                          className={`toggle ${editAiEnabled ? 'active' : ''}`} 
                          onClick={() => setEditAiEnabled(!editAiEnabled)}
                        />
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CHAT STYLE</label>
                        <select 
                          value={editChatStyle} 
                          onChange={e => setEditChatStyle(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: 10, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-main)' }}
                        >
                          <option value="friendly">Friendly & Casual</option>
                          <option value="formal">Professional & Formal</option>
                          <option value="witty">Witty & Humorous</option>
                          <option value="supportive">Supportive & Caring</option>
                        </select>
                      </div>
                      <button className="btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={saveContactDetails}>Save Changes</button>
                    </div>
                  </section>

                  <section>
                    <div className="panel-title">Personal Persona (Global)</div>
                    <div className="card">
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>YOUR BIO / PERSONALITY RULES</label>
                      <textarea
                        rows={4} value={editBio} onChange={e => setEditBio(e.target.value)}
                        placeholder="e.g. My name is Harsh, I'm a developer. I'm usually free after 6 PM..."
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                        This info helps the AI represent you accurately in all chats.
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Select a contact to view and edit details
                </div>
              )}
            </aside>
          </>
        )}

        {view === 'analytics' && (
          <div style={{ padding: 60, overflowY: 'auto', width: '100%' }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 40 }}>Data Analysis</h2>
            {analytics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
                <div className="card">
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>TOTAL MESSAGES</div>
                  <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--primary)' }}>{analytics.totalMessages}</div>
                </div>
                <div className="card">
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>MODEL DISTRIBUTION</div>
                  {analytics.modelStats.map(s => (
                    <div key={s._id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{s._id || 'Unknown'}</span>
                      <span style={{ fontWeight: 800 }}>{s.count}</span>
                    </div>
                  ))}
                </div>
                <div className="card" style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>DAILY ACTIVITY (LAST 7 DAYS)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
                    {analytics.dailyStats.map(d => (
                      <div key={d._id} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ background: 'var(--primary)', height: `${(d.count / (Math.max(...analytics.dailyStats.map(x => x.count)) || 1)) * 100}%`, borderRadius: '4px 4px 0 0' }} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>{d._id.slice(-5)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'database' && (
          <div style={{ padding: 60, overflowY: 'auto', width: '100%' }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 40 }}>System & Data Model</h2>
            {systemStatus && (
              <div className="card" style={{ marginBottom: 40, display: 'flex', gap: 60 }}>
                <div><label style={{ fontSize: 12, color: 'var(--text-muted)' }}>MONGODB</label><div style={{ color: systemStatus.mongodb === 'connected' ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{systemStatus.mongodb.toUpperCase()}</div></div>
                <div><label style={{ fontSize: 12, color: 'var(--text-muted)' }}>SERVER</label><div style={{ color: 'var(--green)', fontWeight: 800 }}>ONLINE</div></div>
                <button onClick={() => fetchSchemaAndSystem()} className="btn-primary" style={{ padding: '8px 16px' }}>🔄 Force Sync</button>
              </div>
            )}
            {schema && Object.entries(schema).map(([name, fields]: [string, any]) => (
              <div key={name} className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 18, color: 'var(--primary)', marginBottom: 16 }}>Collection: {name}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  {Object.entries(fields).map(([f, d]: [string, any]) => (
                    <div key={f} style={{ padding: 12, background: 'var(--bg-dark)', borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div style={{ padding: 60, overflowY: 'auto', width: '100%' }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 40 }}>Settings</h2>

            {!selectedAccountId ? (
              <div className="card" style={{ maxWidth: 560 }}>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>Waiting for WhatsApp session</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
                  The dashboard has not received an account yet. As soon as the bot reports its first connection state, this page will show the full WhatsApp connect flow and QR code details.
                </p>
                <button onClick={fetchAccounts} className="btn-primary">🔄 Retry Loading Connection</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 32 }}>
                {/* AI Service Configuration */}
                <div className="card">
                  <h3 style={{ fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>🧠</span> AI Service Provider
                  </h3>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>ACTIVE PROVIDER</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {['ollama', 'openai'].map(p => (
                        <button
                          key={p}
                          className={`btn-primary ${status.provider === p ? '' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '12px', background: status.provider === p ? 'var(--primary)' : 'transparent' }}
                          onClick={() => fetch(`${API}/api/provider`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accountId: selectedAccountId, provider: p })
                          }).then(() => fetchStatus(selectedAccountId))}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>MODEL SELECTION</label>
                    <select
                      value={status.model}
                      style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-main)' }}
                      onChange={(e) => fetch(`${API}/api/model`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accountId: selectedAccountId, model: e.target.value })
                      }).then(() => fetchStatus(selectedAccountId))}
                    >
                      {status.availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {status.provider === 'openai' && (
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>OPENAI API KEY</label>
                      <input
                        type="password"
                        placeholder="sk-..."
                        style={{ width: '100%' }}
                        onBlur={(e) => fetch(`${API}/api/config`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ accountId: selectedAccountId, apiKey: e.target.value })
                        })}
                      />
                    </div>
                  )}
                </div>

                {/* WhatsApp Account Management */}
                <div className="card">
                  <h3 style={{ fontSize: 18, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>📱</span> WhatsApp Connection
                  </h3>
                  <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    {connectionSummary}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-dark)', borderRadius: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Status</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[status.bot] || '#94a3b8' }}>{formatStatusLabel(status.bot)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-dark)', borderRadius: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Phone</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{status.phoneNumber || 'Not Linked'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-dark)', borderRadius: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Session ID</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{selectedAccountId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-dark)', borderRadius: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last Activity</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{formatLastActive(status.lastActive || selectedAccount?.lastActive)}</span>
                    </div>
                  </div>

                  {currentQrCode ? (
                    <div style={{ textAlign: 'center', background: 'var(--bg-dark)', padding: 24, borderRadius: 20, marginTop: 20 }}>
                      <QRCodeCanvas value={currentQrCode} size={180} />
                      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>Open WhatsApp → Linked Devices → Link a Device → Scan QR</p>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', background: 'var(--bg-dark)', padding: 24, borderRadius: 20, marginTop: 20, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
                      No active QR code yet. Click <strong>{connectButtonLabel}</strong> to generate one and pair this account.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button
                      onClick={connectWhatsApp}
                      className={`btn-primary ${isRefreshing ? 'loading' : ''}`}
                      style={{ flex: 1, opacity: isRefreshing ? 0.7 : 1, cursor: isRefreshing ? 'not-allowed' : 'pointer' }}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? '⌛ Sending Request...' : (isConnected ? '🔄 Reconnect / New QR' : '🔗 Connect WhatsApp')}
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, background: '#ef4444' }}
                      onClick={async () => {
                        if (!confirm('Logout and unlink this WhatsApp account?')) return;
                        await fetch(`${API}/api/logout`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ accountId: selectedAccountId })
                        });
                        fetchStatus(selectedAccountId);
                      }}
                    >🚪 Logout</button>
                  </div>
                </div>

                {/* Platform Appearance */}
                <div className="card">
                  <h3 style={{ fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>🎨</span> Appearance
                  </h3>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Theme Mode</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Switch between light and dark interface</div>
                    </div>
                    <div style={{ display: 'flex', background: 'var(--bg-dark)', padding: 4, borderRadius: 12 }}>
                      <button
                        onClick={() => setTheme('dark')}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: theme === 'dark' ? 'var(--bg-card)' : 'transparent', color: theme === 'dark' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                      >🌙 Dark</button>
                      <button
                        onClick={() => setTheme('light')}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: theme === 'light' ? 'var(--bg-card)' : 'transparent', color: theme === 'light' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                      >☀️ Light</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
