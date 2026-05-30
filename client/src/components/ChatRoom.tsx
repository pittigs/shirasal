import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';


interface ChatMessage {
  id: string;
  username: string;
  role: string;
  text: string;
  timestamp: string;
}

interface ChatRoomProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUser: string;
  title?: string;
  placeholder?: string;
}

const getRoleBadgeColor = (role: string) => {
  switch (role) {
    case 'admin': return '#ef4444'; // Rot
    case 'member': return '#8b5cf6'; // Violett
    default: return '#94a3b8'; // Grau
  }
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'admin': return '👑';
    case 'member': return '🛡️';
    default: return '👤';
  }
};

export const ChatRoom: React.FC<ChatRoomProps> = ({ messages, onSendMessage, currentUser, title, placeholder }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Komprimieren zu JPEG mit Qualität 0.6 für minimalen Speicher
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file);
      onSendMessage(compressedDataUrl);
    } catch (err) {
      console.error(t('chat.image_compression_error'), err);
      alert(t('chat.image_send_error'));
    }


    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Automatischer Scroll nach unten bei neuen Nachrichten
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.04)',
        overflow: 'hidden'
      }}
    >
      {/* Kopfzeile */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>💬</span>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{title || t('chat.default_title')}</h3>
      </div>


      {/* Nachrichtenverlauf */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {messages.map((msg, index) => {
          const isMe = msg.username === currentUser;
          const isSystem = msg.username === 'System';

          if (isSystem) {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'center',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '90%',
                  textAlign: 'center'
                }}
              >
                📢 {msg.text}
              </div>
            );
          }

          // Prüfen, ob wir diese Nachricht mit der vorherigen gruppieren können
          const prevMsg = index > 0 ? messages[index - 1] : null;
          let shouldGroup = false;

          if (prevMsg && prevMsg.username !== 'System' && prevMsg.username === msg.username) {
            const [h1, m1] = prevMsg.timestamp.split(':').map(Number);
            const [h2, m2] = msg.timestamp.split(':').map(Number);
            if (!isNaN(h1) && !isNaN(m1) && !isNaN(h2) && !isNaN(m2)) {
              const diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
              if (diffMinutes >= 0 && diffMinutes <= 5) {
                shouldGroup = true;
              }
            }
          }

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                gap: '2px',
                marginTop: shouldGroup ? '-4px' : '8px'
              }}
            >
              {/* Absender-Infos */}
              {!shouldGroup && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: '2px'
                  }}
                >
                  <span
                    style={{
                      color: getRoleBadgeColor(msg.role),
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    {getRoleIcon(msg.role)} {msg.username}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{msg.timestamp}</span>
                </div>
              )}

              {/* Nachrichtentext */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  borderTopRightRadius: isMe ? (shouldGroup ? '12px' : '0px') : '12px',
                  borderTopLeftRadius: isMe ? '12px' : (shouldGroup ? '12px' : '0px'),
                  background: isMe ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
                  border: isMe ? 'none' : 'var(--glass-border)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  wordBreak: 'break-word',
                  boxShadow: isMe ? '0 2px 10px rgba(var(--accent-rgb), 0.25)' : 'none'
                }}
                title={shouldGroup ? `Gesendet um ${msg.timestamp}` : undefined}
              >
                {msg.text.startsWith('data:image/') ? (
                  <img
                    src={msg.text}
                    alt="Shared asset"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '260px',
                      borderRadius: '8px',
                      marginTop: '2px',
                      display: 'block',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      // Einfacher Klick öffnet das Bild in einem neuen Tab
                      const w = window.open();
                      w?.document.write(`<img src="${msg.text}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                    }}
                  />
                ) : (
                  msg.text
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Eingabebereich */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px',
          background: 'rgba(0, 0, 0, 0.15)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          gap: '8px'
        }}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary"
          style={{
            padding: '10px 14px',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          title={t('chat.shared_asset_title')}
        >
          📎
        </button>
        <input
          type="text"
          placeholder={placeholder || t('chat.input_placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input-field"
          style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }}
        />
        <button
          type="submit"
          className="btn-primary"
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {t('chat.send')}
        </button>
      </form>
    </div>
  );

};
