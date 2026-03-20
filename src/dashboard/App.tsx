import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface LogEntry {
  _id: string;
  from: string;
  body: string;
  reply: string;
  model: string;
  ts: string;
  accountId: string;
}

interface WhatsAppAccount {
  sessionId: string;
  phoneNumber?: string;
  status: string;
}

interface BotStatus {
  bot: string;
  model: string;
  availableModels: string[];
  provider: 'ollama' | 'openai';
}

type View = 'chats' | 'settings';

const STATUS_COLOR: Record<string, string> = {
  ready: '#22c55e',
  qr: '#f59e0b',
  starting: '#94a3b8',
  disconnected: '#ef4444',
};

export default function App() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<BotStatus>({ 
    bot: 'disconnected', model: '—', availableModels: [], provider: 'ollama' 
  });
  const [view, setView] = useState<View>('chats');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [editingPrompt, setEditingPrompt] = useState<{ id: string; prompt: string; context: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sock = io(API);
    socketRef.current = sock;
    
    sock.on('new_message', (entry: LogEntry) => {
      if (entry.accountId === selectedAccountId) {
        setMessages((prev) => [...prev, entry]);
        setContacts((prev) => Array.from(new Set([entry.from, ...prev])));
      }
    });

    sock.on('account_status', ({ sessionId, status, qr }: { sessionId: string; status: string; qr?: string }) => {
      setAccounts(prev => prev.map(a => a.sessionId === sessionId ? { ...a, status } : a));
    });

    sock.on('model_changed', ({ model }: { model: string }) => setStatus((prev) => ({ ...prev, model })));
    sock.on('provider_changed', ({ provider }: { provider: 'ollama' | 'openai' }) => {
      setStatus((prev) => ({ ...prev, provider }));
      fetchStatus();
    });

    return () => { sock.disconnect(); };
  }, [selectedAccountId]);

  const fetchAccounts = async () => {
    const res = await fetch(`${API}/api/accounts`);
    const data = await res.json();
    setAccounts(data);
    if (data.length > 0 && !selectedAccountId) setSelectedAccountId(data[0].sessionId);
  };

  const fetchStatus = () => {
    if (!selectedAccountId) return;
    fetch(`${API}/api/status?accountId=${selectedAccountId}`).then(r => r.json()).then(s => setStatus(s)).catch(() => {});
    fetch(`${API}/api/contacts?accountId=${selectedAccountId}`).then(r => r.json()).then(c => {
      setContacts(c);
      if (c.length > 0 && !selectedContact) setSelectedContact(c[0]);
    }).catch(() => {});
    fetch(`${API}/api/messages?accountId=${selectedAccountId}`).then(r => r.json()).then(m => setMessages(m)).catch(() => {});
  };

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { fetchStatus(); }, [selectedAccountId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, selectedContact]);

  const switchModel = async (model: string) => {
    setSwitching(true);
    await fetch(`${API}/api/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
    setSwitching(false);
  };

  const switchProvider = async (provider: 'ollama' | 'openai') => {
    setSwitching(true);
    await fetch(`${API}/api/provider`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) });
    setSwitching(false);
  };

  const saveConfig = async () => {
    if (!apiKey) return;
    await fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
    alert('API Key Saved');
  };

  const openPromptEditor = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/contact-prompt/${id}?accountId=${selectedAccountId}`);
      const data = await res.json();
      setEditingPrompt({ id, prompt: data.prompt || '', context: data.context || '' });
    } catch (err) {
      setEditingPrompt({ id, prompt: '', context: '' });
    }
  };

  const saveContactPrompt = async () => {
    if (!editingPrompt || !selectedAccountId) return;
    await fetch(`${API}/api/contact-prompt`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        accountId: selectedAccountId,
        id: editingPrompt.id, 
        prompt: editingPrompt.prompt, 
        context: editingPrompt.context 
      }) 
    });
    setEditingPrompt(null);
    alert('Custom behavior saved!');
  };

  const fmt = (ts: string | number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── Sub-component: App Sidebar ──────────────────────────────────────────
  const AppSidebar = () => (
    <div style={{ width: 84, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 32 }}>
      {/* Brand */}
      <div style={{ width: 44, height: 44, background: '#38bdf8', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>AI</div>
      
      {/* Account Switcher */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {accounts.map(acc => (
          <button
            key={acc.sessionId}
            onClick={() => setSelectedAccountId(acc.sessionId)}
            style={{
              width: 52, height: 52, borderRadius: 16, background: selectedAccountId === acc.sessionId ? '#1e293b' : 'transparent',
              border: selectedAccountId === acc.sessionId ? '2px solid #38bdf8' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'all 0.2s'
            }}
            title={acc.sessionId}
          >
            <div style={{ fontSize: 20 }}>🤖</div>
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: STATUS_COLOR[acc.status] || '#94a3b8', border: '2px solid #0f172a' }} />
          </button>
        ))}
        {/*
        <button style={{ width: 52, height: 52, borderRadius: 16, border: '2px dashed #334155', background: 'transparent', color: '#334155', fontSize: 24, cursor: 'pointer', transition: 'all 0.2s' }}>+</button>
        */}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button 
          onClick={() => setView('chats')}
          style={{ width: 52, height: 52, borderRadius: 16, border: 'none', background: view === 'chats' ? '#1e293b' : 'transparent', color: view === 'chats' ? '#38bdf8' : '#64748b', cursor: 'pointer', fontSize: 24 }}
          title="Chats"
        >💬</button>
        <button 
          onClick={() => setView('settings')}
          style={{ width: 52, height: 52, borderRadius: 16, border: 'none', background: view === 'settings' ? '#1e293b' : 'transparent', color: view === 'settings' ? '#38bdf8' : '#64748b', cursor: 'pointer', fontSize: 24 }}
          title="Settings"
        >⚙️</button>
      </nav>
    </div>
  );

  const renderChatsView = () => (
    <div style={{ flex: 1, display: 'flex', background: '#020617', overflow: 'hidden' }}>
      <div style={{ width: 340, borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '32px 24px', borderBottom: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>Messages</h2>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Account: {selectedAccountId}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {contacts.map(c => {
            const lastMsg = messages.filter(m => m.from === c).slice(-1)[0];
            return (
              <button
                key={c}
                onClick={() => setSelectedContact(c)}
                style={{
                  width: '100%', padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center',
                  background: selectedContact === c ? '#1e293b' : 'transparent', border: 'none',
                  borderBottom: '1px solid #1e293b', cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: selectedContact === c ? '#f1f5f9' : '#94a3b8', fontSize: 15 }}>{c.split('@')[0]}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsg ? lastMsg.body : 'No history yet'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedContact ? (
          <>
            <header style={{ height: 80, borderBottom: '1px solid #1e293b', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
                <div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{selectedContact}</div>
                  <div style={{ fontSize: 11, color: '#22c55e' }}>{status.bot === 'ready' ? 'Online' : 'Initializing'}</div>
                </div>
              </div>
              <button onClick={() => openPromptEditor(selectedContact)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✨ Customize Behavior</button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '40px 60px', display: 'flex', flexDirection: 'column', gap: 28 }}>
              {messages.filter(m => m.from === selectedContact).map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ alignSelf: 'flex-start', maxWidth: '70%', background: '#1e293b', padding: '14px 20px', borderRadius: '4px 20px 20px 20px', color: '#e2e8f0', fontSize: 15, border: '1px solid #334155', lineHeight: 1.6 }}>{m.body}</div>
                  <div style={{ alignSelf: 'flex-end', maxWidth: '70%', background: '#0c4a6e', padding: '14px 20px', borderRadius: '20px 4px 20px 20px', color: '#bae6fd', fontSize: 15, border: '1px solid #075985', lineHeight: 1.6 }}>{m.reply}</div>
                  <div style={{ alignSelf: 'flex-end', fontSize: 10, color: '#475569', marginTop: -4, marginRight: 4 }}>{m.model} · {fmt(m.ts)}</div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, color: '#334155' }}>
            <div style={{ fontSize: 100 }}>📂</div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: '#94a3b8' }}>Select a conversation</h3>
          </div>
        )}
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div style={{ flex: 1, background: '#020617', padding: 60, overflowY: 'auto' }}>
      <div style={{ maxWidth: 800 }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, color: '#f1f5f9', marginBottom: 48 }}>Account Settings</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          <section>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 24 }}>AI Configuration</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {['ollama', 'openai'].map(p => (
                <button
                  key={p}
                  onClick={() => switchProvider(p as 'ollama' | 'openai')}
                  style={{
                    padding: 32, borderRadius: 24, background: status.provider === p ? 'linear-gradient(135deg, #1e293b, #0f172a)' : 'transparent',
                    border: status.provider === p ? '2px solid #38bdf8' : '1px solid #1e293b', cursor: 'pointer', textAlign: 'left'
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 16 }}>{p === 'ollama' ? '🏠' : '☁️'}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: status.provider === p ? '#f1f5f9' : '#64748b' }}>{p === 'ollama' ? 'Local Ollama' : 'Cloud OpenAI'}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 24 }}>System Status ({selectedAccountId})</h3>
            <div style={{ background: '#0f172a', borderRadius: 24, padding: 32, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Status</span>
                <span style={{ color: STATUS_COLOR[status.bot], fontWeight: 800 }}>{status.bot.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Active Model</span>
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{status.model}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#020617', color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
      <AppSidebar />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'chats' && renderChatsView()}
        {view === 'settings' && renderSettingsView()}
      </main>

      {editingPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', borderRadius: 32, padding: 48, width: '95%', maxWidth: 600, border: '1px solid #1e293b', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.8)' }}>
            <h3 style={{ fontSize: 28, fontWeight: 900, color: '#f1f5f9', marginBottom: 12 }}>Persona Studio</h3>
            <p style={{ fontSize: 15, color: '#64748b', marginBottom: 40 }}>Craft the perfect behavior for <span style={{ color: '#38bdf8' }}>{editingPrompt.id}</span>.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: 12, display: 'block' }}>User Profile / Context</label>
                <input value={editingPrompt.context} onChange={e => setEditingPrompt({ ...editingPrompt, context: e.target.value })} placeholder="e.g. John, CEO of Acme Inc." style={{ width: '100%', background: '#020617', border: '1px solid #1e293b', borderRadius: 14, padding: 18, color: 'white' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: 12, display: 'block' }}>Behavioral Instructions</label>
                <textarea value={editingPrompt.prompt} onChange={e => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })} placeholder="How should the AI behave?" style={{ width: '100%', height: 160, background: '#020617', border: '1px solid #1e293b', borderRadius: 20, padding: 24, color: 'white', resize: 'none' }} />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', marginTop: 48 }}>
              <button onClick={() => setEditingPrompt(null)} style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Discard</button>
              <button onClick={saveContactPrompt} style={{ background: '#38bdf8', border: 'none', borderRadius: 16, color: '#0f172a', fontWeight: 900, padding: '16px 40px', cursor: 'pointer' }}>Apply Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
