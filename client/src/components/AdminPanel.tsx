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

interface RoleInfo {
  name: string;
  color: string;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canManageUsers: boolean;
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
  roles: RoleInfo[];
  onCreateRole: (name: string, color: string, canManageRoles: boolean, canManageChannels: boolean, canManageUsers: boolean) => void;
  onUpdateRole: (name: string, color: string, canManageRoles: boolean, canManageChannels: boolean, canManageUsers: boolean) => void;
  onDeleteRole: (name: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  usersList,
  channels,
  textChannels,
  onChangeUserRole,
  onChangeUserNickname,
  onChangeChannelPermission,
  roles,
  onCreateRole,
  onUpdateRole,
  onDeleteRole
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'channels' | 'roles'>('users');
  // Lokaler State für temporäre Namensedits der Benutzer
  const [editNicknames, setEditNicknames] = useState<{ [socketId: string]: string }>({});

  // Role Form States
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#ffffff');
  const [permRoles, setPermRoles] = useState(false);
  const [permChannels, setPermChannels] = useState(false);
  const [permUsers, setPermUsers] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleInfo | null>(null);

  const resetRoleForm = () => {
    setRoleName('');
    setRoleColor('#ffffff');
    setPermRoles(false);
    setPermChannels(false);
    setPermUsers(false);
    setEditingRole(null);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;
    const cleanName = roleName.trim().toLowerCase();
    
    if (editingRole) {
      onUpdateRole(cleanName, roleColor, permRoles, permChannels, permUsers);
    } else {
      onCreateRole(cleanName, roleColor, permRoles, permChannels, permUsers);
    }
    resetRoleForm();
  };

  const handleEditRoleClick = (r: RoleInfo) => {
    setEditingRole(r);
    setRoleName(r.name);
    setRoleColor(r.color);
    setPermRoles(r.canManageRoles);
    setPermChannels(r.canManageChannels);
    setPermUsers(r.canManageUsers);
  };

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
          <button
            onClick={() => setActiveSubTab('roles')}
            className={activeSubTab === 'roles' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            {t('admin_panel.tab_roles') || 'Rollen-Verwaltung'}
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
                            {roles.map((r) => (
                              <option key={r.name} value={r.name}>
                                {r.name.toUpperCase()}
                              </option>
                            ))}
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
                          {roles.map((r) => (
                            <option key={r.name} value={r.name}>
                              {r.name.toUpperCase()}
                            </option>
                          ))}
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
                          {roles.map((r) => (
                            <option key={r.name} value={r.name}>
                              {r.name.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: ROLES MANAGER */}
          {activeSubTab === 'roles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Form to create/edit role */}
              <form onSubmit={handleSaveRole} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-color)', margin: 0 }}>
                  {editingRole ? `Rolle bearbeiten: ${editingRole.name.toUpperCase()}` : 'Neue Rolle erstellen'}
                </h4>
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '150px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Rollen-Name</label>
                    <input
                      type="text"
                      placeholder="z.B. moderator"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      disabled={!!editingRole}
                      className="input-field"
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                      required
                    />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: '80px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Farbe</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={roleColor}
                        onChange={(e) => setRoleColor(e.target.value)}
                        style={{ width: '36px', height: '32px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={roleColor}
                        onChange={(e) => setRoleColor(e.target.value)}
                        className="input-field"
                        style={{ padding: '4px 6px', fontSize: '0.8rem', width: '70px', height: '32px', boxSizing: 'border-box' }}
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Berechtigungen</span>
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={permRoles}
                      onChange={(e) => setPermRoles(e.target.checked)}
                      style={{ accentColor: 'var(--accent-color)' }}
                    />
                    Rollen verwalten (canManageRoles)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={permChannels}
                      onChange={(e) => setPermChannels(e.target.checked)}
                      style={{ accentColor: 'var(--accent-color)' }}
                    />
                    Kanäle verwalten (canManageChannels)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={permUsers}
                      onChange={(e) => setPermUsers(e.target.checked)}
                      style={{ accentColor: 'var(--accent-color)' }}
                    />
                    Benutzer verwalten (canManageUsers)
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                  {editingRole && (
                    <button type="button" onClick={resetRoleForm} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      Abbrechen
                    </button>
                  )}
                  <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    {editingRole ? 'Änderungen speichern' : 'Rolle anlegen'}
                  </button>
                </div>
              </form>

              {/* Roles List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Registrierte Rollen</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {roles.map((r) => {
                    const isStandard = r.name === 'admin' || r.name === 'member' || r.name === 'guest';
                    return (
                      <div
                        key={r.name}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: r.color }} />
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                            {r.name.toUpperCase()}
                          </span>
                          {isStandard && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              System
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {/* Permissions summary icons */}
                          <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {r.canManageRoles && <span title="Rollen verwalten">🛡️ Roles</span>}
                            {r.canManageChannels && <span title="Kanäle verwalten">💬 Channels</span>}
                            {r.canManageUsers && <span title="Benutzer verwalten">👥 Users</span>}
                            {!r.canManageRoles && !r.canManageChannels && !r.canManageUsers && <span style={{ color: 'var(--text-muted)' }}>Keine Rechte</span>}
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleEditRoleClick(r)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            >
                              Bearbeiten
                            </button>
                            {!isStandard && (
                              <button
                                type="button"
                                onClick={() => onDeleteRole(r.name)}
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#ef4444' }}
                              >
                                Löschen
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  );
};
