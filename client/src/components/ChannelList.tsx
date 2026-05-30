import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface Channel {
  id: string;
  name: string;
  minRole: string;
}

interface Participant {
  socketId: string;
  username: string;
  role: string;
  isSpeaking?: boolean;
}

interface ChannelListProps {
  channels: Channel[]; // Sprachkanäle
  textChannels: Channel[]; // Textkanäle (Neu!)
  joinedRoomId: string | null; // Aktiver Sprachkanal
  currentTextRoomId: string; // Aktiver Textkanal (Neu!)
  userRole: string;
  localUsername: string;
  localSpeaking: boolean;
  isMuted: boolean;
  remoteParticipants: Participant[];
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
  onJoinTextRoom: (roomId: string) => void; // (Neu!)
  onCreateChannel: (name: string, minRole: string) => void;
  onCreateTextChannel: (name: string, minRole: string) => void; // (Neu!)
  allUsers: Array<{ username: string; role: string; online: boolean; socketId: string | null }>; // Neu!
  activePrivatePartner: string | null; // Neu!
  unreadDMs: { [username: string]: boolean }; // Neu!
  onSelectPrivatePartner: (partner: string | null) => void; // Neu!
}

const ROLE_PRIORITY: { [key: string]: number } = {
  guest: 1,
  member: 2,
  admin: 3
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'admin': return '👑';
    case 'member': return '🛡️';
    default: return '👤';
  }
};


export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  textChannels,
  joinedRoomId,
  currentTextRoomId,
  userRole,
  localUsername,
  localSpeaking,
  isMuted,
  remoteParticipants,
  onJoinRoom,
  onLeaveRoom,
  onJoinTextRoom,
  onCreateChannel,
  onCreateTextChannel,
  allUsers,
  activePrivatePartner,
  unreadDMs,
  onSelectPrivatePartner
}) => {
  const { t } = useTranslation();
  // States für Sprachkanal-Erstellung
  const [showVoiceForm, setShowVoiceForm] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [voiceMinRole, setVoiceMinRole] = useState('guest');

  // States für Textkanal-Erstellung
  const [showTextForm, setShowTextForm] = useState(false);
  const [textName, setTextName] = useState('');
  const [textMinRole, setTextMinRole] = useState('guest');


  const userPriority = ROLE_PRIORITY[userRole] || 1;

  // Filter sichtbar ab Rolle
  const visibleVoiceChannels = channels.filter(
    (c) => userPriority >= (ROLE_PRIORITY[c.minRole] || 1)
  );

  const visibleTextChannels = textChannels.filter(
    (c) => userPriority >= (ROLE_PRIORITY[c.minRole] || 1)
  );

  const handleVoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceName.trim()) return;
    onCreateChannel(voiceName.trim(), voiceMinRole);
    setVoiceName('');
    setShowVoiceForm(false);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textName.trim()) return;
    onCreateTextChannel(textName.trim(), textMinRole);
    setTextName('');
    setShowTextForm(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '24px' }}>
      
      {/* 1. TEXTKANÄLE SEKTION */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('channels.text_channels')}
          {userRole === 'admin' && (
            <button
              onClick={() => setShowTextForm(!showTextForm)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'var(--glass-border)',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                transition: 'all 0.2s'
              }}
              title={t('channels.create_text_channel')}
            >
              +
            </button>
          )}
        </h2>

        {/* Textkanal Formular */}
        {showTextForm && userRole === 'admin' && (
          <form
            onSubmit={handleTextSubmit}
            className="fade-in"
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '10px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <input
              type="text"
              placeholder={t('channels.placeholder_text_channel')}
              value={textName}
              onChange={(e) => setTextName(e.target.value)}
              className="input-field"
              style={{ padding: '6px', fontSize: '0.8rem' }}
              required
            />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('channels.role_required')}</span>
              <select
                value={textMinRole}
                onChange={(e) => setTextMinRole(e.target.value)}
                className="input-field"
                style={{ padding: '2px 4px', fontSize: '0.75rem', width: 'auto', flex: 1 }}
              >
                <option value="guest">{t('channels.role_guest_option')}</option>
                <option value="member">{t('channels.role_member_option')}</option>
                <option value="admin">{t('channels.role_admin_option')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
              <button type="submit" className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }}>
                {t('common.confirm')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowTextForm(false)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}


        {/* Textkanal Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {visibleTextChannels.map((tc) => {
            const isActive = currentTextRoomId === tc.id && !activePrivatePartner;
            return (
              <div
                key={tc.id}
                onClick={() => {
                  onJoinTextRoom(tc.id);
                  onSelectPrivatePartner(null);
                }}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-color)' : '3px solid transparent',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.9rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <span># {tc.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {t('channels.role_required_label')} {t('roles.' + tc.minRole)}
                </span>

              </div>
            );
          })}
        </div>
      </div>

      {/* 2. SPRACHKANÄLE SEKTION */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t('channels.voice_channels')}
          {userRole === 'admin' && (
            <button
              onClick={() => setShowVoiceForm(!showVoiceForm)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'var(--glass-border)',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                transition: 'all 0.2s'
              }}
              title={t('channels.create_voice_channel')}
            >
              +
            </button>
          )}
        </h2>
        
        {/* Sprachkanal Formular */}
        {showVoiceForm && userRole === 'admin' && (
          <form
            onSubmit={handleVoiceSubmit}
            className="fade-in"
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '10px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <input
              type="text"
              placeholder={t('channels.placeholder_voice_channel')}
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="input-field"
              style={{ padding: '6px', fontSize: '0.8rem' }}
              required
            />
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('channels.role_required')}</span>
              <select
                value={voiceMinRole}
                onChange={(e) => setVoiceMinRole(e.target.value)}
                className="input-field"
                style={{ padding: '2px 4px', fontSize: '0.75rem', width: 'auto', flex: 1 }}
              >
                <option value="guest">{t('channels.role_guest_option')}</option>
                <option value="member">{t('channels.role_member_option')}</option>
                <option value="admin">{t('channels.role_admin_option')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
              <button type="submit" className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }}>
                {t('common.confirm')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowVoiceForm(false)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}


        {/* Sprachkanal Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibleVoiceChannels.map((c) => {
            const isJoined = joinedRoomId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  background: isJoined ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: isJoined ? '1px solid var(--accent-color)' : '1px solid transparent',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => !isJoined && onJoinRoom(c.id)}
              >
                {/* Kopfzeile */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isJoined ? '#fff' : 'var(--text-primary)' }}>
                    🔊 {c.name}
                  </span>
                  {isJoined ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLeaveRoom();
                      }}
                      style={{
                        background: '#ef4444',
                        border: 'none',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {t('channels.hangup')}
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {t('channels.role_required_label')} {t('roles.' + c.minRole)}
                    </span>
                  )}

                </div>

                {/* Teilnehmerliste im Sprachkanal */}
                {isJoined && (
                  <div
                    style={{
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      paddingLeft: '10px',
                      borderLeft: '2px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    {/* Lokaler User */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          border: localSpeaking ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.2)',
                          boxShadow: localSpeaking ? '0 0 8px #22c55e' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {getRoleIcon(userRole)}
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        {localUsername} ({t('channels.you')})
                      </span>
                      {isMuted && <span style={{ fontSize: '0.75rem' }}>🔇</span>}
                    </div>

                    {/* Remote Users */}
                    {remoteParticipants.map((p) => (
                      <div
                        key={p.socketId}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPrivatePartner(p.username);
                        }}
                        title={t('channels.dm_title', { name: p.username })}
                      >

                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            border: p.isSpeaking ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.2)',
                            boxShadow: p.isSpeaking ? '0 0 8px #22c55e' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {getRoleIcon(p.role)}
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {p.username} 💬
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. DIREKTNACHRICHTEN SEKTION */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          {t('channels.direct_messages')}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {allUsers.filter(u => u.username !== localUsername).length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '10px' }}>
              {t('channels.no_other_users')}
            </span>
          ) : (

            [...allUsers.filter(u => u.username !== localUsername)]
              .sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                return a.username.localeCompare(b.username);
              })
              .map((u) => {
                const isActive = activePrivatePartner === u.username;
                const hasUnread = unreadDMs[u.username];
                return (
                  <div
                    key={u.username}
                    onClick={() => {
                      onSelectPrivatePartner(u.username);
                    }}
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--accent-color)' : '3px solid transparent',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      color: isActive 
                        ? '#fff' 
                        : (hasUnread 
                            ? 'var(--accent-color)' 
                            : (u.online ? 'var(--text-secondary)' : 'var(--text-muted)')),
                      fontWeight: (isActive || hasUnread) ? 700 : 500,
                      fontSize: '0.9rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      opacity: u.online ? 1 : 0.6,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: u.online ? '#22c55e' : '#64748b', fontSize: '0.75rem' }}>
                        {u.online ? '🟢' : '⚪'}
                      </span>
                      <span>{u.username}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {hasUnread && (
                        <span
                          style={{
                            background: 'var(--accent-color)',
                            color: '#fff',
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontWeight: 'bold'
                          }}
                        >
                          {t('channels.dm_new')}
                        </span>

                      )}
                      <span style={{ fontSize: '0.75rem' }}>
                        {getRoleIcon(u.role)}
                      </span>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

    </div>
  );
};
