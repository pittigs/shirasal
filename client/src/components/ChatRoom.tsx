import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface ChatMessage {
  id: string;
  username: string;
  role: string;
  text: string;
  timestamp: string;
  reactions?: { [emoji: string]: string[] };
}

interface RoleInfo {
  name: string;
  color: string;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canManageUsers: boolean;
}

interface ChatRoomProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUser: string;
  title?: string;
  placeholder?: string;
  allUsers?: Array<{ username: string; role: string; online: boolean; socketId: string | null; avatar?: string | null }>;
  roles: RoleInfo[];
  activeChannelId?: string;
  activePrivatePartner?: string;
  toggleReaction?: (channelId: string, messageId: string, emoji: string) => void;
  togglePrivateReaction?: (messageId: string, emoji: string, partnerUsername: string) => void;
  searchPrivateMessages?: (partnerUsername: string, query: string) => void;
  searchResults?: ChatMessage[];
  clearSearchResults?: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'];

export const ChatRoom: React.FC<ChatRoomProps> = ({
  messages,
  onSendMessage,
  currentUser,
  title,
  placeholder,
  allUsers = [],
  roles = [],
  activeChannelId = 'general',
  activePrivatePartner,
  toggleReaction,
  togglePrivateReaction,
  searchPrivateMessages,
  searchResults = [],
  clearSearchResults
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  
  // Search States
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Hover Message State for Reactions Menu
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

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

  // Debounced search for DMs (database search)
  useEffect(() => {
    if (activePrivatePartner && showSearch && searchQuery.trim()) {
      const delayDebounce = setTimeout(() => {
        searchPrivateMessages?.(activePrivatePartner, searchQuery);
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      clearSearchResults?.();
    }
  }, [searchQuery, activePrivatePartner, showSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  const getUsernameColor = (msgUsername: string, msgRole: string) => {
    if (msgUsername === 'System') return '#94a3b8';
    const userObj = allUsers.find(u => u.username === msgUsername);
    const actualRole = userObj ? userObj.role : msgRole;
    const roleObj = roles.find(r => r.name === actualRole);
    return roleObj ? roleObj.color : '#ffffff';
  };

  const getRoleLabel = (msgUsername: string, msgRole: string) => {
    const userObj = allUsers.find(u => u.username === msgUsername);
    const actualRole = userObj ? userObj.role : msgRole;
    return actualRole.toUpperCase();
  };

  // Filter messages for group channels, or show searchResults for DM search
  const displayedMessages = activePrivatePartner && searchQuery.trim() && showSearch
    ? searchResults
    : (searchQuery.trim() && !activePrivatePartner && showSearch
        ? messages.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
        : messages);

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
          justifyContent: 'space-between',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.1rem' }}>💬</span>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{title || t('chat.default_title')}</h3>
        </div>

        {/* Search Icon & Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showSearch && (
            <input
              type="text"
              placeholder={activePrivatePartner ? "DM durchsuchen..." : "Kanal filtern..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{
                padding: '4px 8px',
                fontSize: '0.8rem',
                width: '150px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
              autoFocus
            />
          )}
          <button
            onClick={() => {
              if (showSearch) {
                setSearchQuery('');
                clearSearchResults?.();
              }
              setShowSearch(!showSearch);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: showSearch ? 'var(--accent-color)' : '#fff',
              fontSize: '1rem',
              padding: '4px'
            }}
            title="Chat durchsuchen"
          >
            🔍
          </button>
        </div>
      </div>

      {/* Suchergebnisse Hinweis */}
      {showSearch && searchQuery.trim() && (
        <div
          style={{
            padding: '8px 16px',
            background: 'rgba(var(--accent-rgb), 0.1)',
            borderBottom: '1px solid rgba(var(--accent-rgb), 0.2)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>
            {activePrivatePartner 
              ? `DM-Suchergebnisse für "${searchQuery}" (${displayedMessages.length} Treffer)`
              : `Kanal gefiltert nach "${searchQuery}" (${displayedMessages.length} Treffer)`}
          </span>
          <button
            onClick={() => {
              setSearchQuery('');
              clearSearchResults?.();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            Filter zurücksetzen
          </button>
        </div>
      )}

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
        {displayedMessages.map((msg, index) => {
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
          const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
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
              onMouseEnter={() => setHoveredMessageId(msg.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
              style={{
                display: 'flex',
                gap: '8px',
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                marginTop: shouldGroup ? '-4px' : '8px',
                flexDirection: isMe ? 'row-reverse' : 'row',
                position: 'relative' // needed for hovered quick reaction panel position absolute
              }}
            >
              {/* Quick Reactions hover bar */}
              {hoveredMessageId === msg.id && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-20px',
                    [isMe ? 'left' : 'right']: '10px',
                    background: '#181824',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '20px',
                    padding: '2px 8px',
                    display: 'flex',
                    gap: '8px',
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  {QUICK_EMOJIS.map((emoji) => (
                    <span
                      key={emoji}
                      onClick={() => {
                        if (activePrivatePartner) {
                          togglePrivateReaction?.(msg.id, emoji, activePrivatePartner);
                        } else {
                          toggleReaction?.(activeChannelId, msg.id, emoji);
                        }
                      }}
                      style={{
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: '2px',
                        transition: 'transform 0.1s',
                        display: 'inline-block'
                      }}
                      className="hover-scale"
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              )}

              {/* Avatar Spalte */}
              {!shouldGroup ? (
                (() => {
                  const senderAvatar = allUsers.find(u => u.username === msg.username)?.avatar;
                  return senderAvatar ? (
                    <img 
                      src={senderAvatar} 
                      alt={msg.username} 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '50%', 
                        objectFit: 'cover', 
                        border: '1.5px solid var(--accent-color)',
                        flexShrink: 0
                      }} 
                    />
                  ) : (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1.5px solid rgba(255, 255, 255, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: 'var(--accent-color)',
                        flexShrink: 0
                      }}
                    >
                      {msg.username.charAt(0).toUpperCase()}
                    </div>
                  );
                })()
              ) : (
                <div style={{ width: '32px', height: '32px', flexShrink: 0 }} />
              )}

              {/* Nachrichten-Bubble Spalte */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
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
                      marginBottom: '2px',
                      flexDirection: isMe ? 'row-reverse' : 'row'
                    }}
                  >
                    <span
                      style={{
                        color: getUsernameColor(msg.username, msg.role),
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px', opacity: 0.8, color: '#fff' }}>
                        {getRoleLabel(msg.username, msg.role)}
                      </span>
                      {msg.username}
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
                        const w = window.open();
                        w?.document.write(`<img src="${msg.text}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                      }}
                    />
                  ) : (
                    msg.text
                  )}
                </div>

                {/* EMOJI REACTION BADGES */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => {
                      const reactedByMe = users.includes(currentUser);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            if (activePrivatePartner) {
                              togglePrivateReaction?.(msg.id, emoji, activePrivatePartner);
                            } else {
                              toggleReaction?.(activeChannelId, msg.id, emoji);
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: reactedByMe ? 'rgba(var(--accent-rgb), 0.18)' : 'rgba(255, 255, 255, 0.05)',
                            border: reactedByMe ? '1px solid var(--accent-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.15s'
                          }}
                          title={users.join(', ')}
                        >
                          <span>{emoji}</span>
                          <span>{users.length}</span>
                        </button>
                      );
                    })}
                  </div>
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

export default ChatRoom;
