import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { useTranslation } from './contexts/LanguageContext';

import { ThemeCustomizer } from './components/ThemeCustomizer';
import { ChannelList } from './components/ChannelList';
import { ChatRoom } from './components/ChatRoom';
import { AudioVisualizer } from './components/AudioVisualizer';
import { AdminPanel } from './components/AdminPanel';
import { Workspace } from './components/Workspace';
import logo from './assets/logo.png';

export const App: React.FC = () => {
  const { t, language } = useTranslation();
  const {

    username,
    role,
    avatar,
    updateAvatar,
    accountKey,
    isLoggedIn,
    channels,
    textChannels,
    chatMessages,
    joinedRoomId,
    currentTextRoomId,
    remoteStreams,
    adminUsersList,
    onlineUsers, // Vereinfachte Liste für Laufband
    isMuted,
    selfHearing,
    localSpeaking,
    activationMode,
    setActivationMode,
    pttKey,
    setPttKey,
    isPTTPressed,
    noiseSuppressionMode,
    createAccount,
    loginWithKey,
    loginWithLdap,
    logout,
    changeNickname, // Eigener Name ändern
    changeUserRole,
    changeUserNickname, // Fremder Name ändern
    changeChannelPermission,
    toggleMute,
    toggleNoiseSuppression,
    toggleSelfHearing,
    sendChatMessage,
    sendPrivateMessage,
    privateChats,
    activePrivatePartner,
    setActivePrivatePartner,
    unreadDMs,
    setUnreadDMs,
    allUsers,
    noiseThreshold,
    setNoiseThreshold,
    echoCancellation,
    setEchoCancellation,
    autoGainControl,
    setAutoGainControl,
    keyboardFilter,
    setKeyboardFilter,
    localScreenStream,
    startScreenShare,
    stopScreenShare,
    localCameraStream,
    startCamera,
    stopCamera,
    createChannel,
    createTextChannel,
    joinRoom,
    leaveRoom,
    joinTextChannel,
    localAnalyser,
    allowDemoRoles,
    roles,
    createRole,
    updateRole,
    deleteRole,
    hasPermission,
    toggleReaction,
    togglePrivateReaction,
    searchPrivateMessages,
    searchResults,
    clearSearchResults,
    serverUrl,
    changeServerUrl,
    socket
  } = useWebRTC();

  const [layout, setLayout] = useState({ chatVisible: true, chatPosition: 'right' as 'left' | 'right' });

  const handleLayoutChange = (visible: boolean, position: 'left' | 'right') => {
    setLayout({ chatVisible: visible, chatPosition: position });
  };

  const getUsernameColor = (name: string, fallbackRole: string) => {
    if (name === 'System') return '#94a3b8';
    const userObj = allUsers.find(u => u.username === name);
    const actualRole = userObj ? userObj.role : fallbackRole;
    const roleObj = roles.find(r => r.name === actualRole);
    return roleObj ? roleObj.color : '#ffffff';
  };

  // Load and apply custom theme settings on startup (forces consistent styling on login screen)
  React.useEffect(() => {
    const saved = localStorage.getItem('voicechat-theme-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const root = document.documentElement;
        if (parsed.bgValue) root.style.setProperty('--bg-primary', parsed.bgValue);
        if (parsed.accentColor) root.style.setProperty('--accent-color', parsed.accentColor);
        if (parsed.accentRgb) root.style.setProperty('--accent-rgb', parsed.accentRgb);
        if (parsed.glassBlur !== undefined) root.style.setProperty('--glass-blur', `${parsed.glassBlur}px`);
        if (parsed.borderRadius !== undefined) root.style.setProperty('--border-radius', `${parsed.borderRadius}px`);
      } catch (e) {
        console.error('Failed to load startup theme:', e);
      }
    }
  }, []);


  const [activeTab, setActiveTab] = useState<'register' | 'login' | 'ldap'>('register');
  const [chosenRole, setChosenRole] = useState('guest'); // guest, member, admin
  const [inputKey, setInputKey] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [ldapUsername, setLdapUsername] = useState('');
  const [ldapPassword, setLdapPassword] = useState('');
  const [mainView, setMainView] = useState<'chat' | 'workspace'>('chat');
  const [showKeyReveal, setShowKeyReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // States für eigene Nickname-Bearbeitung
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');

  const [isBindingKey, setIsBindingKey] = useState(false);

  const handleStartBinding = () => {
    setIsBindingKey(true);
  };

  React.useEffect(() => {
    if (!isBindingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPttKey(e.key);
      setIsBindingKey(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isBindingKey]);

  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif';
    const isSmallGif = isGif && file.size <= 150 * 1024; // 150KB

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (isSmallGif) {
        updateAvatar(result);
      } else {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 96;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
            const compressed = canvas.toDataURL('image/jpeg', 0.6);
            updateAvatar(compressed);
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount(chosenRole);
    setShowKeyReveal(true);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputKey.trim()) {
      loginWithKey(inputKey.trim());
    }
  };

  const handleLdapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ldapUsername.trim() && ldapPassword) {
      loginWithLdap(ldapUsername.trim(), ldapPassword);
    }
  };

  const handleCopyKey = () => {
    if (accountKey) {
      navigator.clipboard.writeText(accountKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNicknameChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNameInput.trim() && newNameInput.trim() !== username) {
      changeNickname(newNameInput.trim());
    }
    setIsEditingName(false);
  };

  // 1. ZWISCHENBILDSCHIRM ZUR KEY-SICHERUNG
  if (isLoggedIn && showKeyReveal) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '20px'
        }}
      >

        
        <div
          className="glass-panel fade-in"
          style={{
            width: '100%',
            maxWidth: '460px',
            padding: '30px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          <div>
            <span style={{ fontSize: '2.5rem' }}>🎉</span>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '8px', color: '#fff' }}>
              {t('register_success.title')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '6px' }}>
              {t('register_success.subtitle')}
            </p>
          </div>

          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('register_success.random_name')}</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-color)' }}>{username}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('register_success.key_label')}</span>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color: '#fff',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '10px',
                  borderRadius: '6px',
                  marginTop: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{accountKey}</span>
                <button
                  onClick={handleCopyKey}
                  style={{
                    background: 'var(--accent-color)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {copied ? t('common.copied') : t('common.copy')}
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: '0.75rem',
              color: '#f43f5e',
              background: 'rgba(244, 63, 94, 0.1)',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              textAlign: 'left',
              lineHeight: '1.4'
            }}
          >
            {t('register_success.important_warning')}
          </div>

          <button
            onClick={() => setShowKeyReveal(false)}
            className="btn-primary"
            style={{ padding: '12px', fontSize: '0.95rem' }}
          >
            {t('register_success.continue_btn')}
          </button>

        </div>
      </div>
    );
  }

  // 2. REGISTRIERUNG / LOGIN
  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '20px'
        }}
      >

        
        <div
          className="glass-panel fade-in"
          style={{
            width: '100%',
            maxWidth: '420px',
            padding: '30px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <img src={logo} alt="ShirAsal Logo" style={{ height: '72px', width: '72px', borderRadius: '16px', boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.4)', marginBottom: '8px' }} />
            <h1
              style={{
                fontSize: '2.5rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #fff 0%, var(--accent-color) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1px',
                marginBottom: '4px',
                lineHeight: 1
              }}
            >
              ShirAsal
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {t('login.subtitle')}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.2)',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <button
              onClick={() => setActiveTab('register')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'register' ? 'var(--accent-color)' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              {t('login.register_tab')}
            </button>
            <button
              onClick={() => setActiveTab('login')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'login' ? 'var(--accent-color)' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              {t('login.login_tab')}
            </button>
            <button
              onClick={() => setActiveTab('ldap')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'ldap' ? 'var(--accent-color)' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              {t('login.ldap_tab')}
            </button>
          </div>

          {activeTab === 'register' ? (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {allowDemoRoles && (
                <div style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    {t('login.role_label')}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['guest', 'member', 'admin'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setChosenRole(r)}
                        style={{
                          flex: 1,
                          padding: '10px 6px',
                          borderRadius: '8px',
                          background: chosenRole === r ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
                          border: chosenRole === r ? 'none' : '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          transition: 'all 0.2s',
                          boxShadow: chosenRole === r ? '0 2px 10px rgba(var(--accent-rgb), 0.3)' : 'none'
                        }}
                      >
                        {r === 'guest' ? '👤 ' + t('common.guest') : r === 'member' ? '🛡️ ' + t('common.member') : '👑 ' + t('common.admin')}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                    {chosenRole === 'guest' && t('login.role_guest_desc')}
                    {chosenRole === 'member' && t('login.role_member_desc')}
                    {chosenRole === 'admin' && t('login.role_admin_desc')}
                  </span>
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ marginTop: allowDemoRoles ? '8px' : '0px' }}>
                {t('login.register_btn')}
              </button>
            </form>
          ) : activeTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  {t('login.key_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('login.key_placeholder')}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px', textTransform: 'uppercase' }}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                {t('login.login_btn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLdapSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  {t('login.ldap_user_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('login.ldap_user_placeholder')}
                  value={ldapUsername}
                  onChange={(e) => setLdapUsername(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  {t('login.ldap_pass_label')}
                </label>
                <input
                  type="password"
                  placeholder={t('login.ldap_pass_placeholder')}
                  value={ldapPassword}
                  onChange={(e) => setLdapPassword(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                {t('login.login_btn')}
              </button>
            </form>
          )}

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '12px 0 4px 0' }} />
          
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
              🌐 {t('login.server_url_label')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder={t('login.server_url_placeholder')}
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                className="input-field"
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
              />
              <button 
                type="button" 
                onClick={() => changeServerUrl(serverUrlInput)}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem', width: 'auto' }}
              >
                {t('login.server_url_save')}
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 3. MAIN DASHBOARD
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '24px',
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {/* GEMEINSAME FLOATING TOOLBAR OBEN RECHTS (Gegen Höhenversatz!) */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 100,
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}
      >
        {(role === 'admin' || hasPermission('canManageRoles') || hasPermission('canManageChannels') || hasPermission('canManageUsers')) && (
          <button
            onClick={() => setIsAdminOpen(true)}
            className="glass-panel"
            style={{
              padding: '10px 16px',
              borderRadius: '20px',
              color: '#fff',
              border: '1px solid rgba(var(--accent-rgb), 0.3)',
              background: 'rgba(var(--accent-rgb), 0.15)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 2px 10px rgba(var(--accent-rgb), 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '42px', // Identisch mit ThemeCustomizer Button
              boxSizing: 'border-box'
            }}
          >
            🛡️ {t('admin_panel.title')}
          </button>
        )}
        <ThemeCustomizer onChangeLayout={handleLayoutChange} />

      </div>

      {/* AdminPanel Modal */}
      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        usersList={adminUsersList.filter(u => u.username !== username)}
        channels={channels}
        textChannels={textChannels}
        onChangeUserRole={changeUserRole}
        onChangeUserNickname={changeUserNickname} // Neu!
        onChangeChannelPermission={changeChannelPermission}
        roles={roles}
        onCreateRole={createRole}
        onUpdateRole={updateRole}
        onDeleteRole={deleteRole}
      />

      {/* Unsichtbare Audio-Empfänger für WebRTC-Sprachausgabe */}
      <div style={{ display: 'none' }}>
        {remoteStreams.map((p) => (
          <audio
            key={p.socketId}
            ref={(el) => {
              if (el && p.stream) {
                el.srcObject = p.stream;
              }
            }}
            autoPlay
          />
        ))}
      </div>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          height: '42px' // Feste Höhe passend zur Toolbar
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div>
            <h1
              style={{
                fontSize: '1.8rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #fff 0%, var(--accent-color) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.5px'
              }}
            >
              ShirAsal
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {t('login.subtitle')}
            </p>
          </div>

          {/* Main View Tabs */}
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', marginLeft: '40px' }}>
            <button
              onClick={() => setMainView('chat')}
              className="glass-panel"
              style={{
                padding: '6px 16px',
                borderRadius: '16px',
                border: 'none',
                background: mainView === 'chat' ? 'var(--accent-color)' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                boxShadow: mainView === 'chat' ? '0 2px 8px rgba(var(--accent-rgb), 0.3)' : 'none'
              }}
            >
              💬 Chat & Voice
            </button>
            <button
              onClick={() => setMainView('workspace')}
              className="glass-panel"
              style={{
                padding: '6px 16px',
                borderRadius: '16px',
                border: 'none',
                background: mainView === 'workspace' ? 'var(--accent-color)' : 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                boxShadow: mainView === 'workspace' ? '0 2px 8px rgba(var(--accent-rgb), 0.3)' : 'none'
              }}
            >
              📂 Workspace (Docs)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {mainView === 'chat' ? (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: !layout.chatVisible 
              ? '1fr' 
              : (layout.chatPosition === 'left' ? '1fr minmax(300px, 350px)' : 'minmax(300px, 350px) 1fr'),
            gap: '20px',
            height: 'calc(100% - 70px)',
            minHeight: 0
          }}
        >
        {/* Linke Spalte (Kanäle, Profil, Audio-Visualizer) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0, order: layout.chatPosition === 'right' ? 1 : 2 }}>
          
          {/* User Profile Card */}
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current?.click()}>
                  {avatar ? (
                    <img 
                      src={avatar} 
                      alt={username} 
                      style={{ 
                        width: '46px', 
                        height: '46px', 
                        borderRadius: '50%', 
                        objectFit: 'cover', 
                        border: '2px solid var(--accent-color)',
                        boxShadow: '0 0 10px rgba(var(--accent-rgb), 0.3)'
                      }} 
                    />
                  ) : (
                    <div 
                      style={{ 
                        width: '46px', 
                        height: '46px', 
                        borderRadius: '50%', 
                        backgroundColor: 'rgba(255, 255, 255, 0.08)', 
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: 'var(--accent-color)'
                      }}
                    >
                      {username ? username.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                  <div 
                    style={{
                      position: 'absolute',
                      bottom: '-2px',
                      right: '-2px',
                      background: 'var(--accent-color)',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      border: '1px solid var(--bg-primary)'
                    }}
                    title="Avatar ändern"
                  >
                    📷
                  </div>
                </div>
                
                <input 
                  type="file" 
                  ref={avatarInputRef} 
                  onChange={handleAvatarChange} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />

                <div>
                  {/* Name (Editierbar!) */}
                  {isEditingName ? (
                    <form onSubmit={handleNicknameChangeSubmit} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={newNameInput}
                        onChange={(e) => setNewNameInput(e.target.value)}
                        className="input-field"
                        style={{ padding: '2px 6px', fontSize: '0.8rem', width: '110px', height: '24px' }}
                        maxLength={20}
                        required
                        autoFocus
                      />
                      <button type="submit" className="btn-primary" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✓</button>
                      <button type="button" className="btn-secondary" onClick={() => setIsEditingName(false)} style={{ padding: '2px 6px', fontSize: '0.75rem' }}>✕</button>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.9rem' }}>{role === 'admin' ? '👑' : role === 'member' ? '🛡️' : '👤'}</span>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: getUsernameColor(username, role) }}>{username}</h4>
                      <button
                        onClick={() => {
                          setNewNameInput(username);
                          setIsEditingName(true);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px', opacity: 0.7 }}
                        title={t('common.edit_name_title')}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                    Key: <span style={{ fontFamily: 'var(--font-mono)' }}>{accountKey}</span>
                  </span>
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={logout}
                style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#ef4444' }}
              >
                {t('common.logout')}
              </button>
            </div>

            <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

            {/* Audio & Video Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={toggleMute}
                  className={isMuted ? 'btn-secondary' : 'btn-primary'}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    background: isMuted ? '#ef4444' : 'var(--accent-color)',
                    boxShadow: isMuted ? '0 2px 10px rgba(239, 68, 68, 0.25)' : '0 2px 10px rgba(var(--accent-rgb), 0.25)'
                  }}
                >
                  {isMuted ? t('controls.mute_on') : t('controls.mute_off')}
                </button>

                <button
                  onClick={toggleNoiseSuppression}
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    borderColor: noiseSuppressionMode !== 'off' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                    background: noiseSuppressionMode !== 'off' ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)'
                  }}
                >
                  {noiseSuppressionMode === 'off' 
                    ? (language === 'de' ? 'Filter: Aus' : 'Filter: Off') 
                    : noiseSuppressionMode === 'gate' 
                      ? (language === 'de' ? 'Filter: Gate' : 'Filter: Gate') 
                      : (language === 'de' ? 'Filter: KI (WASM)' : 'Filter: AI (WASM)')}
                </button>
              </div>

              {/* Bildschirm- & Kameraübertragung */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={localScreenStream ? stopScreenShare : startScreenShare}
                  disabled={!joinedRoomId}
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    borderColor: localScreenStream ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                    background: localScreenStream ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                    color: localScreenStream ? 'var(--accent-color)' : '#fff',
                    opacity: joinedRoomId ? 1 : 0.5,
                    cursor: joinedRoomId ? 'pointer' : 'not-allowed',
                    fontWeight: localScreenStream ? 700 : 500
                  }}
                  title={t('controls.screen_share_start')}
                >
                  {localScreenStream ? t('controls.screen_share_stop') : t('controls.screen_share_start')}
                </button>

                <button
                  onClick={localCameraStream ? stopCamera : startCamera}
                  disabled={!joinedRoomId}
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    borderColor: localCameraStream ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                    background: localCameraStream ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                    color: localCameraStream ? 'var(--accent-color)' : '#fff',
                    opacity: joinedRoomId ? 1 : 0.5,
                    cursor: joinedRoomId ? 'pointer' : 'not-allowed',
                    fontWeight: localCameraStream ? 700 : 500
                  }}
                  title={t('controls.camera_start')}
                >
                  {localCameraStream ? t('controls.camera_stop') : t('controls.camera_start')}
                </button>
              </div>

              {/* Echomodus */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  onClick={toggleSelfHearing}
                  className="btn-secondary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    borderColor: selfHearing ? '#eab308' : 'rgba(255,255,255,0.1)',
                    background: selfHearing ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.04)',
                    color: selfHearing ? '#eab308' : '#fff'
                  }}
                >
                  {selfHearing ? t('controls.self_hearing_on') : t('controls.self_hearing_off')}
                </button>
                {selfHearing && (
                  <span style={{ fontSize: '0.7rem', color: '#f43f5e', textAlign: 'center', display: 'block', marginTop: '2px' }}>
                    {t('controls.headphone_warning')}
                  </span>
                )}
              </div>


              {/* Advanced Audio Calibration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                {/* Transmission Mode Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                    {language === 'de' ? 'Aktivierungsmodus' : 'Activation Mode'}
                  </span>
                  
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setActivationMode('vad')}
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        borderColor: activationMode === 'vad' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                        background: activationMode === 'vad' ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                        color: '#fff'
                      }}
                    >
                      🗣️ {language === 'de' ? 'Sprache' : 'Voice'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivationMode('ptt')}
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        borderColor: activationMode === 'ptt' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                        background: activationMode === 'ptt' ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                        color: '#fff'
                      }}
                    >
                      🔘 PTT
                    </button>
                  </div>

                  {activationMode === 'ptt' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#fff' }}>Hotkey:</span>
                      <button
                        type="button"
                        onClick={handleStartBinding}
                        className="btn-primary"
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          background: isBindingKey ? '#eab308' : 'var(--accent-color)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        {isBindingKey 
                          ? (language === 'de' ? 'Drücke Taste...' : 'Press key...') 
                          : pttKey === ' ' 
                            ? (language === 'de' ? 'Leertaste' : 'Space') 
                            : pttKey.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                  {t('controls.advanced_calibration')}
                </span>
                
                {/* Echo Cancellation Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#fff' }}>{t('controls.aec')}</span>
                  <button
                    onClick={() => setEchoCancellation(!echoCancellation)}
                    className="btn-secondary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      borderColor: echoCancellation ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                      background: echoCancellation ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px'
                    }}
                  >
                    {echoCancellation ? t('controls.enabled') : t('controls.disabled')}
                  </button>
                </div>

                {/* Auto Gain Control Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#fff' }}>{t('controls.agc')}</span>
                  <button
                    onClick={() => setAutoGainControl(!autoGainControl)}
                    className="btn-secondary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      borderColor: autoGainControl ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                      background: autoGainControl ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px'
                    }}
                  >
                    {autoGainControl ? t('controls.enabled') : t('controls.disabled')}
                  </button>
                </div>

                {/* Keyboard Filter Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#fff' }}>{t('controls.hpf')}</span>
                  <button
                    onClick={() => setKeyboardFilter(!keyboardFilter)}
                    className="btn-secondary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      borderColor: keyboardFilter ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
                      background: keyboardFilter ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px'
                    }}
                  >
                    {keyboardFilter ? t('controls.enabled') : t('controls.disabled')}
                  </button>
                </div>
              </div>

              {/* Noise Gate Sensitivity Slider */}
              <div style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{t('controls.voice_threshold')}</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{noiseThreshold}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={noiseThreshold}
                  onChange={(e) => setNoiseThreshold(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--accent-color)',
                    background: 'rgba(255,255,255,0.1)',
                    height: '6px',
                    borderRadius: '3px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {t('controls.voice_threshold_desc')}
                </span>
              </div>

              {/* Live Audio Visualizer */}
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  {t('controls.mic_activity')}
                </span>

                <AudioVisualizer analyser={localAnalyser} isMuted={isMuted} />

                {activationMode === 'ptt' && (
                  <div 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '6px', 
                      fontSize: '0.75rem', 
                      background: isPTTPressed ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.02)', 
                      border: isPTTPressed ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px', 
                      padding: '4px',
                      marginTop: '6px',
                      color: isPTTPressed ? '#22c55e' : 'var(--text-secondary)'
                    }}
                  >
                    <span style={{ fontSize: '0.8rem' }}>{isPTTPressed ? '🟢' : '🔴'}</span>
                    <strong>
                      {isPTTPressed 
                        ? (language === 'de' ? 'SENDEN AKTIV' : 'TRANSMITTING') 
                        : (language === 'de' ? 'PTT GEHALTEN' : 'PTT IDLE')}
                    </strong>
                    <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                      ({pttKey === ' ' ? (language === 'de' ? 'Leertaste' : 'Space') : pttKey.toUpperCase()})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Voice & Text Channels List */}
          <div className="glass-panel" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            <ChannelList
              channels={channels}
              textChannels={textChannels}
              joinedRoomId={joinedRoomId}
              currentTextRoomId={currentTextRoomId}
              userRole={role}
              localUsername={username}
              localSpeaking={localSpeaking}
              isMuted={isMuted}
              remoteParticipants={remoteStreams.map((p) => ({
                socketId: p.socketId,
                username: p.username,
                role: p.role,
                isSpeaking: p.isSpeaking
              }))}
              onJoinRoom={joinRoom}
              onLeaveRoom={leaveRoom}
              onJoinTextRoom={joinTextChannel}
              onCreateChannel={createChannel}
              onCreateTextChannel={createTextChannel}
              allUsers={allUsers}
              activePrivatePartner={activePrivatePartner}
              unreadDMs={unreadDMs}
              onSelectPrivatePartner={(partner) => {
                setActivePrivatePartner(partner);
                if (partner) {
                  setUnreadDMs((prev) => ({
                    ...prev,
                    [partner]: false
                  }));
                }
              }}
              roles={roles}
            />
          </div>
        </div>

        {/* Rechte Spalte (Text Chat & Online Marquee) */}
        {layout.chatVisible && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, order: layout.chatPosition === 'right' ? 2 : 1 }}>
            
            {/* Video Stage Grid */}
            {(localScreenStream || localCameraStream || remoteStreams.some(p => p.videoStream || p.cameraStream)) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: (Number(!!localScreenStream) + Number(!!localCameraStream) + remoteStreams.filter(p => p.videoStream || p.cameraStream).flatMap(p => [p.videoStream, p.cameraStream].filter(Boolean)).length) === 1 ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '12px',
                  marginBottom: '12px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '12px',
                  borderRadius: 'var(--border-radius)',
                  border: 'var(--glass-border)'
                }}
              >
                {/* Eigener Bildschirm-Stream */}
                {localScreenStream && (
                  <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                    <video
                      ref={(el) => { if (el && el.srcObject !== localScreenStream) el.srcObject = localScreenStream; }}
                      autoPlay
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#fff' }}>
                      🖥️ {t('channels.you')} ({language === 'de' ? 'Bildschirm' : 'Screen'})
                    </div>
                  </div>
                )}

                {/* Eigener Kamera-Stream */}
                {localCameraStream && (
                  <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                    <video
                      ref={(el) => { if (el && el.srcObject !== localCameraStream) el.srcObject = localCameraStream; }}
                      autoPlay
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#fff' }}>
                      📷 {t('channels.you')} ({language === 'de' ? 'Kamera' : 'Camera'})
                    </div>
                  </div>
                )}

                {/* Remote Streams */}
                {remoteStreams.map((p) => {
                  return (
                    <React.Fragment key={p.socketId}>
                      {p.videoStream && (
                        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                          <video
                            ref={(el) => { if (el && p.videoStream && el.srcObject !== p.videoStream) el.srcObject = p.videoStream; }}
                            autoPlay
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                          <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🖥️ {p.username} ({language === 'de' ? 'Bildschirm' : 'Screen'})</span>
                          </div>
                        </div>
                      )}
                      {p.cameraStream && (
                        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                          <video
                            ref={(el) => { if (el && p.cameraStream && el.srcObject !== p.cameraStream) el.srcObject = p.cameraStream; }}
                            autoPlay
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📷 {p.username}</span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0 }}>
            <ChatRoom
              messages={activePrivatePartner ? (privateChats[activePrivatePartner] || []) : chatMessages}
              onSendMessage={(text) => {
                if (activePrivatePartner) {
                  sendPrivateMessage(activePrivatePartner, text);
                } else {
                  sendChatMessage(text);
                }
              }}
              currentUser={username}
              title={activePrivatePartner ? `PN mit @${activePrivatePartner}` : undefined}
              placeholder={activePrivatePartner ? `Nachricht an @${activePrivatePartner}...` : undefined}
              allUsers={allUsers}
              roles={roles}
              activeChannelId={currentTextRoomId}
              activePrivatePartner={activePrivatePartner || undefined}
              toggleReaction={toggleReaction}
              togglePrivateReaction={togglePrivateReaction}
              searchPrivateMessages={searchPrivateMessages}
              searchResults={searchResults}
              clearSearchResults={clearSearchResults}
            />
          </div>

          {/* Online Users Loop Marquee (Neu!) */}
          <div
            className="glass-panel"
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              border: 'var(--glass-border)',
              height: '34px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ fontWeight: 800, color: '#fff', marginRight: '10px', zIndex: 2, background: 'var(--bg-card)', paddingRight: '10px' }}>
              ONLINE ({onlineUsers.length}):
            </div>
            
            <div className="marquee-wrapper">
              {/* Wir rendern die Liste doppelt, um eine nahtlose Schleife bei translateX(-50%) zu garantieren */}
              {[...onlineUsers, ...onlineUsers].map((u, idx) => {
                const isSelf = u.username === username;
                return (
                  <span
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: isSelf ? 'default' : 'pointer'
                    }}
                    onClick={() => {
                      if (!isSelf) {
                        setActivePrivatePartner(u.username);
                        setUnreadDMs((prev) => ({
                          ...prev,
                          [u.username]: false
                        }));
                      }
                    }}
                    title={isSelf ? undefined : `PN an @${u.username} senden`}
                  >
                    <span style={{ color: '#22c55e' }}>🟢</span>
                    <strong style={{ color: getUsernameColor(u.username, u.role) }}>{u.username}</strong>
                    <span style={{ fontSize: '0.7rem', opacity: 0.7, color: getUsernameColor(u.username, u.role) }}>
                      ({u.role.toUpperCase()})
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div style={{ flex: 1, height: 'calc(100% - 70px)', minHeight: 0 }}>
      <Workspace
        socket={socket}
        userRole={role}
        hasPermission={hasPermission}
      />
    </div>
  )}

  </div>
  );
};

export default App;
