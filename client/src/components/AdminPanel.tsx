import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface User {
  socketId: string;
  username: string;
  role: string;
  currentRoom: string | null;
  currentTextRoom: string;
}

interface Channel {
  id: string;
  name: string;
  minRole: string;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  usersList: User[];
  channels: Channel[];
  textChannels: Channel[];
  onChangeUserRole: (socketId: string, role: string) => void;
  onChangeUserNickname: (socketId: string, nickname: string) => void; // Neu!
  onChangeChannelPermission: (type: 'voice' | 'text', id: string, minRole: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  usersList,
  channels,
  textChannels,
  onChangeUserRole,
  onChangeUserNickname,
  onChangeChannelPermission
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'channels'>('users');
  // Lokaler State für temporäre Namensedits der Benutzer
  const [editNicknames, setEditNicknames] = useState<{ [socketId: string]: string }>({});

  if (!isOpen) return null;

  const handleRenameClick = (socketId: string) => {
    const newName = editNicknames[socketId];
    if (newName && newName.trim()) {
      onChangeUserNickname(socketId, newName.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        className="glass-panel fade-in"
        style={{
          width: '100%',
          maxWidth: '700px',
          height: '80vh',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: 'var(--glass-border)',
          borderRadius: 'var(--border-radius)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>🛡️</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{t('admin_panel.title')}</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.15)',
            padding: '10px 20px',
            gap: '10px',
            borderBottom: '1px solid rgba(255,255,255,0.04)'
          }}
        >
          <button
            onClick={() => setActiveSubTab('users')}
            className={activeSubTab === 'users' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            {t('admin_panel.tab_users', { count: usersList.length })}
          </button>
          <button
            onClick={() => setActiveSubTab('channels')}
            className={activeSubTab === 'channels' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            {t('admin_panel.tab_channels')}
          </button>

        </div>

        {/* Content Area */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          
          {/* TAB 1: USER ROLES MANAGER */}
          {activeSubTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {t('admin_panel.desc_users')}
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {usersList.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('admin_panel.no_other_online')}</span>
                ) : (
                  usersList.map((u) => {
                    const currentEditName = editNicknames[u.socketId] ?? u.username;
                    return (
                      <div
                        key={u.socketId}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '10px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}
                      >
                        {/* Name & ID */}
                        <div style={{ minWidth: '150px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{u.username}</div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ID: {u.socketId.substr(0, 8)}... | Raum: {u.currentRoom || 'Keiner'}
                          </span>
                        </div>

                        {/* Controls (Rename & Role) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {/* Umbenennen */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input
                              type="text"
                              value={currentEditName}
                              onChange={(e) => setEditNicknames({ ...editNicknames, [u.socketId]: e.target.value })}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', background: 'rgba(0,0,0,0.2)' }}
                              placeholder={t('admin_panel.placeholder_new_name')}
                            />
                            <button
                              onClick={() => handleRenameClick(u.socketId)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >
                              {t('admin_panel.rename_btn')}
                            </button>
                          </div>

                          {/* Rolle ändern */}
                          <select
                            value={u.role}
                            onChange={(e) => onChangeUserRole(u.socketId, e.target.value)}
                            className="input-field"
                            style={{
                              padding: '5px 8px',
                              fontSize: '0.75rem',
                              width: '110px',
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.1)'
                            }}
                          >
                            <option value="guest">{t('admin_panel.role_guest_option')}</option>
                            <option value="member">{t('admin_panel.role_member_option')}</option>
                            <option value="admin">{t('admin_panel.role_admin_option')}</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}


          {/* TAB 2: CHANNEL PERMISSIONS CONFIG */}
          {activeSubTab === 'channels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Textkanäle */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '10px' }}>
                  {t('admin_panel.text_perms')}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {textChannels.map((tc) => (
                    <div
                      key={tc.id}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}># {tc.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('admin_panel.requires_label')}</span>
                        <select
                          value={tc.minRole}
                          onChange={(e) => onChangeChannelPermission('text', tc.id, e.target.value)}
                          className="input-field"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            width: '110px',
                            background: 'rgba(0,0,0,0.3)'
                          }}
                        >
                          <option value="guest">{t('common.guest')}</option>
                          <option value="member">{t('common.member')}</option>
                          <option value="admin">{t('common.admin')}</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sprachkanäle */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '10px' }}>
                  {t('admin_panel.voice_perms')}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {channels.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🔊 {c.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('admin_panel.requires_label')}</span>
                        <select
                          value={c.minRole}
                          onChange={(e) => onChangeChannelPermission('voice', c.id, e.target.value)}
                          className="input-field"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            width: '110px',
                            background: 'rgba(0,0,0,0.3)'
                          }}
                        >
                          <option value="guest">{t('common.guest')}</option>
                          <option value="member">{t('common.member')}</option>
                          <option value="admin">{t('common.admin')}</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}


        </div>
      </div>
    </div>
  );
};
