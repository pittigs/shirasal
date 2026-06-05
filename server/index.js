import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { authenticateLdap } from './ldap.js';
import * as Y from 'yjs';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'shirasal_lk_key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'shirasal_lk_secret_secure_string_987654321';
const LIVEKIT_PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880';

// --- SECURITY HELPERS ---

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
};

const base32Decode = (str) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bin = '';
  for (let i = 0; i < str.length; i++) {
    const val = alphabet.indexOf(str[i].toUpperCase());
    if (val >= 0) {
      bin += val.toString(2).padStart(5, '0');
    }
  }
  const bytes = [];
  for (let i = 0; i < bin.length; i += 8) {
    if (i + 8 <= bin.length) {
      bytes.push(parseInt(bin.substr(i, 8), 2));
    }
  }
  return Buffer.from(bytes);
};

const verifyTotp = (secret, token) => {
  const key = base32Decode(secret);
  const timeStep = Math.floor(Date.now() / 30000);
  
  for (let i = -1; i <= 1; i++) {
    const step = timeStep + i;
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(Math.floor(step / 0x100000000), 0);
    buffer.writeUInt32BE(step % 0x100000000, 4);
    
    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const codeVal = ((hmac[offset] & 0x7f) << 24) |
                    ((hmac[offset + 1] & 0xff) << 16) |
                    ((hmac[offset + 2] & 0xff) << 8) |
                    (hmac[offset + 3] & 0xff);
    const code = (codeVal % 1000000).toString().padStart(6, '0');
    if (code === token) {
      return true;
    }
  }
  return false;
};

const generateTotpSecret = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < bytes.length; i++) {
    secret += chars[bytes[i] % 32];
  }
  return secret;
};

const app = express();
app.use(cors());

// Yjs document memory caches
const activeDocs = {}; // docId -> Y.Doc
const docSaveTimeouts = {}; // docId -> Timeout


app.get('/health', (req, res) => {
  res.send({ status: 'ok' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendPrivateHistory = async (socket, username) => {
  try {
    const history = await db.getPrivateMessages(username);
    socket.emit('private-history', history);
  } catch (err) {
    console.error("Fehler beim Senden des PN-Verlaufs:", err);
  }
};

const ADJECTIVES = ['Silent', 'Echoing', 'Crystal', 'Vocal', 'Hyper', 'Onyx', 'Turbo', 'Sonic', 'Spectral', 'Quantum', 'Cosmic', 'Aero'];
const NOUNS = ['Hawk', 'Tiger', 'Falcon', 'Wolf', 'Panda', 'Eagle', 'Raven', 'Coyote', 'Phoenix', 'Cheetah', 'Leopard', 'Panther'];

const generateUsername = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}-${num}`;
};

const generateAccountKey = () => {
  const hex = (len) => Math.random().toString(16).substr(2, len).toUpperCase();
  return `OX-${hex(4)}-${hex(4)}-${hex(4)}`;
};

// 1. Sprachkanäle
let channels = [
  { id: 'lobby', name: 'Lobby 🛋️', minRole: 'guest' },
  { id: 'gaming', name: 'Gaming Lounge 🎮', minRole: 'guest' },
  { id: 'members-only', name: 'Mitglieder-Ecke ☕', minRole: 'member' },
  { id: 'admin-hq', name: 'Admin Hauptquartier 🛡️', minRole: 'admin' }
];

// 2. Textkanäle
let textChannels = [
  { id: 'general', name: 'allgemein-💬', minRole: 'guest' },
  { id: 'members-text', name: 'mitglieder-chat-☕', minRole: 'member' },
  { id: 'admin-text', name: 'admin-hq-chat-🛡️', minRole: 'admin' }
];

// Nachrichtenspeicher pro Textkanal
const chatMessagesByChannel = {
  'general': [
    {
      id: 'system-welcome',
      username: 'System',
      role: 'admin',
      text: 'Willkommen in der OpenSource Voice-Chat Alternative! Nutze den Theme-Customizer rechts oben, um die UI anzupassen.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ],
  'members-text': [
    {
      id: 'sys-members',
      username: 'System',
      role: 'member',
      text: 'Willkommen im geschützten Textbereich für verifizierte Mitglieder!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ],
  'admin-text': [
    {
      id: 'sys-admin',
      username: 'System',
      role: 'admin',
      text: 'Internes Admin-Zentrum. Nur für System-Administratoren sichtbar.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]
};

const roomParticipants = {};

// Liste aller online verbundenen Nutzer (mit detaillierten Sockets)
const connectedUsers = {};

const rolesCache = {};

const hasPermission = (socket, permission) => {
  const userRole = socket.data.role;
  if (userRole === 'admin') return true;
  const roleData = rolesCache[userRole];
  return roleData ? !!roleData[permission] : false;
};

const broadcastRoles = () => {
  const rolesList = Object.entries(rolesCache).map(([name, data]) => ({ name, ...data }));
  io.emit('roles-list', rolesList);
};

// Hilfsfunktion: Sendet an alle verbundenen Admins/Moderatoren die detaillierte Live-Nutzerliste
const broadcastConnectedUsersToAdmins = () => {
  const adminSockets = Array.from(io.sockets.sockets.values()).filter(
    (s) => hasPermission(s, 'canManageUsers')
  );
  const userList = Object.values(connectedUsers);
  adminSockets.forEach((s) => {
    s.emit('admin-users-list', userList);
  });
};

// Hilfsfunktion: Sendet an ALLE Benutzer eine vereinfachte Liste der Online-User (für das Laufband/Marquee)
const broadcastOnlineUsersToAll = () => {
  const simplifiedList = Object.values(connectedUsers).map((u) => ({
    socketId: u.socketId,
    username: u.username,
    role: u.role,
    avatar: u.avatar || null
  }));
  io.emit('online-users-list', simplifiedList);
};

// Hilfsfunktion: Sendet an ALLE Benutzer die Liste aller registrierten Accounts samt Online-Status
const broadcastAllUsersToAll = async () => {
  try {
    const dbUsers = await db.getAllUsers();
    const allUsers = dbUsers.map((u) => {
      const onlineUser = Object.values(connectedUsers).find((c) => c.username === u.username);
      return {
        username: u.username,
        role: u.role,
        avatar: u.avatar || null,
        online: !!onlineUser,
        socketId: onlineUser ? onlineUser.socketId : null
      };
    });
    io.emit('all-users-list', allUsers);
  } catch (e) {
    console.error("Fehler beim Senden aller Benutzer:", e);
  }
};

const broadcastUsersState = async () => {
  broadcastOnlineUsersToAll();
  await broadcastAllUsersToAll();
  broadcastConnectedUsersToAdmins();
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send server configuration to client
  socket.emit('server-config', {
    allowDemoRoles: process.env.ALLOW_DEMO_ROLES === 'true'
  });

  // Send roles definition to client
  socket.emit('roles-list', Object.entries(rolesCache).map(([name, data]) => ({ name, ...data })));

  // Initiale Listen senden bei Verbindungsaufbau
  socket.emit('channels-list', channels);
  socket.emit('text-channels-list', textChannels);
  
  // Alle Benutzer (online/offline) senden
  db.getAllUsers().then((dbUsers) => {
    const allUsers = dbUsers.map((u) => {
      const onlineUser = Object.values(connectedUsers).find((c) => c.username === u.username);
      return {
        username: u.username,
        role: u.role,
        avatar: u.avatar || null,
        online: !!onlineUser,
        socketId: onlineUser ? onlineUser.socketId : null
      };
    });
    socket.emit('all-users-list', allUsers);
  }).catch(err => console.error(err));

  // --- ACCOUNT MANAGEMENT SYSTEM ---

  socket.on('create-account', async ({ role, password }) => {
    const username = generateUsername();
    const accountKey = generateAccountKey();
    
    let chosenRole = 'guest';
    if (process.env.ALLOW_DEMO_ROLES === 'true') {
      chosenRole = role || 'guest';
    } else {
      try {
        const users = await db.getAllUsers();
        if (users.length === 0) {
          chosenRole = 'admin'; // Erste Registrierung erhält Admin-Rechte
        } else {
          chosenRole = 'guest'; // Alle weiteren sind Gäste
        }
      } catch (err) {
        console.error('Fehler bei der Rollenprüfung bei Registrierung:', err);
        chosenRole = 'guest';
      }
    }
    
    try {
      const passwordHash = password ? hashPassword(password) : null;
      await db.saveUser(accountKey, username, chosenRole, null, passwordHash);
      console.log(`Account erstellt: ${username} (${chosenRole})`);
      
      socket.data.username = username;
      socket.data.role = chosenRole;
      socket.data.accountKey = accountKey;
      socket.data.avatar = null;
      
      connectedUsers[socket.id] = {
        socketId: socket.id,
        username,
        role: chosenRole,
        avatar: null,
        accountKey,
        currentRoom: null,
        currentTextRoom: 'general'
      };

      socket.emit('account-created', {
        username,
        role: chosenRole,
        accountKey,
        avatar: null,
        twoFactorEnabled: false,
        hasPassword: !!passwordHash,
        hasPasskeys: false
      });
      await sendPrivateHistory(socket, username);
      socket.join('text-general');
      broadcastUsersState();
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Erstellen des Accounts.');
    }
  });

  socket.on('login-account', async ({ accountKey, password, token }) => {
    try {
      const user = await db.getUser(accountKey);
      if (user) {
        // 1. Password check
        if (user.passwordHash) {
          if (!password || !verifyPassword(password, user.passwordHash)) {
            socket.emit('login-error', 'Ungültiges Passwort.');
            return;
          }
        }

        // 2. 2FA Check
        if (user.twoFactorEnabled) {
          if (!token || !verifyTotp(user.twoFactorSecret, token)) {
            socket.emit('login-2fa-required', { accountKey });
            return;
          }
        }

        console.log(`Erfolgreicher Login: ${user.username} (${user.role})`);
        
        socket.data.username = user.username;
        socket.data.role = user.role;
        socket.data.accountKey = accountKey;
        socket.data.avatar = user.avatar || null;

        connectedUsers[socket.id] = {
          socketId: socket.id,
          username: user.username,
          role: user.role,
          avatar: user.avatar || null,
          accountKey,
          currentRoom: null,
          currentTextRoom: 'general'
        };

        socket.emit('login-success', {
          username: user.username,
          role: user.role,
          accountKey: user.accountKey,
          avatar: user.avatar,
          twoFactorEnabled: !!user.twoFactorEnabled,
          hasPassword: !!user.passwordHash,
          hasPasskeys: user.passkeyCredentials ? JSON.parse(user.passkeyCredentials).length > 0 : false
        });
        await sendPrivateHistory(socket, user.username);
        socket.join('text-general');
        broadcastUsersState();
      } else {
        socket.emit('login-error', 'Ungültiger Account-Key.');
      }
    } catch (err) {
      console.error(err);
      socket.emit('login-error', 'Datenbankfehler beim Login.');
    }
  });

  // --- PASSWORD & 2FA MANAGEMENT EVENTS ---

  socket.on('set-password', async ({ password }) => {
    const key = socket.data.accountKey;
    if (!key) return;
    try {
      const hash = password ? hashPassword(password) : null;
      await db.saveUser(key, undefined, undefined, undefined, hash);
      socket.emit('password-updated', { hasPassword: !!hash });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Speichern des Passworts.');
    }
  });

  socket.on('setup-2fa-start', async () => {
    const key = socket.data.accountKey;
    if (!key) return;
    const secret = generateTotpSecret();
    socket.data.temp2faSecret = secret;
    socket.emit('setup-2fa-secret', { secret });
  });

  socket.on('setup-2fa-verify', async ({ token }) => {
    const key = socket.data.accountKey;
    const secret = socket.data.temp2faSecret;
    if (!key || !secret) return;

    if (verifyTotp(secret, token)) {
      await db.saveUser(key, undefined, undefined, undefined, undefined, secret, true);
      socket.data.temp2faSecret = null;
      socket.emit('2fa-setup-success');
    } else {
      socket.emit('error-msg', 'Ungültiger 2FA-Code. Bitte erneut versuchen.');
    }
  });

  socket.on('disable-2fa', async () => {
    const key = socket.data.accountKey;
    if (!key) return;
    await db.saveUser(key, undefined, undefined, undefined, undefined, null, false);
    socket.emit('2fa-disabled-success');
  });

  // --- PASSKEY / WEBAUTHN SOCKET EVENTS ---

  socket.on('register-passkey-start', async ({ hostname }) => {
    const key = socket.data.accountKey;
    if (!key) return;
    try {
      const user = await db.getUser(key);
      const passkeys = user.passkeyCredentials ? JSON.parse(user.passkeyCredentials) : [];
      
      const options = await generateRegistrationOptions({
        rpName: 'ShirAsal',
        rpID: hostname,
        userID: Buffer.from(key),
        userName: user.username,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        excludeCredentials: passkeys.map(p => ({
          id: Buffer.from(p.credentialID, 'base64url'),
          type: 'public-key',
        })),
      });

      socket.data.currentChallenge = options.challenge;
      socket.emit('register-passkey-options', options);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Starten der Passkey-Registrierung: ' + err.message);
    }
  });

  socket.on('register-passkey-finish', async ({ credential, hostname, origin }) => {
    const key = socket.data.accountKey;
    if (!key) return;
    try {
      const user = await db.getUser(key);
      const expectedChallenge = socket.data.currentChallenge;
      
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: hostname,
      });

      if (verification.verified) {
        const { registrationInfo } = verification;
        const { credential } = registrationInfo;
        const { id, publicKey, counter, transports } = credential;
        
        const currentPasskeys = user.passkeyCredentials ? JSON.parse(user.passkeyCredentials) : [];
        currentPasskeys.push({
          credentialID: id,
          credentialPublicKey: Buffer.from(publicKey).toString('base64url'),
          counter,
          transports: transports || credential.response?.transports || []
        });

        await db.saveUser(key, undefined, undefined, undefined, undefined, undefined, undefined, JSON.stringify(currentPasskeys));
        socket.emit('register-passkey-success');
      } else {
        socket.emit('error-msg', 'Passkey-Registrierung fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Abschließen der Passkey-Registrierung: ' + err.message);
    }
  });

  socket.on('login-passkey-start', async ({ accountKey, hostname }) => {
    try {
      const user = await db.getUser(accountKey);
      if (!user || !user.passkeyCredentials) {
        socket.emit('login-error', 'Kein Passkey für diesen Account registriert.');
        return;
      }
      const passkeys = JSON.parse(user.passkeyCredentials || '[]');
      const validPasskeys = passkeys.filter(p => p && p.credentialID && p.credentialPublicKey);
      
      if (validPasskeys.length === 0) {
        socket.emit('login-error', 'Kein gültiger Passkey für diesen Account registriert.');
        return;
      }

      const options = await generateAuthenticationOptions({
        rpID: hostname,
        allowCredentials: validPasskeys.map(p => ({
          id: p.credentialID,
          type: 'public-key',
          transports: p.transports,
        })),
        userVerification: 'preferred',
      });

      socket.data.currentChallenge = options.challenge;
      socket.data.loginAccountKey = accountKey;
      socket.emit('login-passkey-options', options);
    } catch (err) {
      console.error(err);
      socket.emit('login-error', 'Fehler beim Starten des Passkey-Logins.');
    }
  });

  socket.on('login-passkey-finish', async ({ credential, hostname, origin }) => {
    const key = socket.data.loginAccountKey;
    if (!key) return;
    try {
      const user = await db.getUser(key);
      const passkeys = JSON.parse(user.passkeyCredentials || '[]');
      const passkey = passkeys.find(p => p.credentialID === credential.id);
      
      if (!passkey || !passkey.credentialPublicKey) {
        socket.emit('login-error', 'Ungültiger oder korrupter Passkey.');
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: socket.data.currentChallenge,
        expectedOrigin: origin,
        expectedRPID: hostname,
        credential: {
          id: passkey.credentialID,
          publicKey: new Uint8Array(Buffer.from(passkey.credentialPublicKey, 'base64url')),
          counter: passkey.counter,
        },
      });

      if (verification.verified) {
        passkey.counter = verification.authenticationInfo.newCounter;
        await db.saveUser(key, undefined, undefined, undefined, undefined, undefined, undefined, JSON.stringify(passkeys));

        console.log(`Erfolgreicher Passkey-Login: ${user.username} (${user.role})`);
        
        socket.data.username = user.username;
        socket.data.role = user.role;
        socket.data.accountKey = key;
        socket.data.avatar = user.avatar || null;

        connectedUsers[socket.id] = {
          socketId: socket.id,
          username: user.username,
          role: user.role,
          avatar: user.avatar || null,
          accountKey: key,
          currentRoom: null,
          currentTextRoom: 'general'
        };

        socket.emit('login-success', {
          username: user.username,
          role: user.role,
          accountKey: user.accountKey,
          avatar: user.avatar,
          twoFactorEnabled: !!user.twoFactorEnabled,
          hasPassword: !!user.passwordHash,
          hasPasskeys: true
        });
        await sendPrivateHistory(socket, user.username);
        socket.join('text-general');
        broadcastUsersState();
      } else {
        socket.emit('login-error', 'Passkey-Verifikation fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      socket.emit('login-error', 'Fehler beim Abschließen des Passkey-Logins: ' + err.message);
    }
  });

  socket.on('delete-own-account', async () => {
    const key = socket.data.accountKey;
    if (!key) return;
    try {
      await db.deleteUser(key);
      socket.emit('account-deleted');
      console.log(`Account gelöscht: ${socket.data.username} (${key})`);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Löschen des Accounts.');
    }
  });

  socket.on('login-ldap', async ({ username, password }) => {
    try {
      const ldapResult = await authenticateLdap(username, password);
      
      let mappedRole = 'guest';
      
      if (process.env.LDAP_ROLE_MAPPING) {
        try {
          const mapping = JSON.parse(process.env.LDAP_ROLE_MAPPING);
          for (const [group, targetRole] of Object.entries(mapping)) {
            const matched = ldapResult.groups.some(g => {
              const cleanG = g.toLowerCase();
              const cleanGroup = group.toLowerCase();
              return cleanG === cleanGroup || cleanG.includes(`cn=${cleanGroup},`) || cleanG.startsWith(`cn=${cleanGroup}`) || cleanG.includes(cleanGroup);
            });
            if (matched) {
              mappedRole = targetRole;
              break;
            }
          }
        } catch (jsonErr) {
          console.error("Fehler beim Parsen von LDAP_ROLE_MAPPING:", jsonErr);
        }
      }
      
      const accountKey = 'LDAP-' + Buffer.from(username).toString('hex').toUpperCase();
      
      let user = await db.getUser(accountKey);
      if (user) {
        await db.saveUser(accountKey, username, mappedRole, user.avatar);
        user.username = username;
        user.role = mappedRole;
      } else {
        user = {
          accountKey,
          username,
          role: mappedRole,
          avatar: null
        };
        await db.saveUser(accountKey, username, mappedRole, null);
      }
      
      console.log(`Erfolgreicher LDAP-Login: ${user.username} (${user.role})`);
      
      socket.data.username = user.username;
      socket.data.role = user.role;
      socket.data.accountKey = accountKey;
      socket.data.avatar = user.avatar || null;

      connectedUsers[socket.id] = {
        socketId: socket.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null,
        accountKey,
        currentRoom: null,
        currentTextRoom: 'general'
      };

      socket.emit('login-success', user);
      await sendPrivateHistory(socket, user.username);
      socket.join('text-general');
      broadcastUsersState();
    } catch (err) {
      console.error("LDAP Login Fehler:", err.message);
      socket.emit('login-error', `LDAP Login fehlgeschlagen: ${err.message}`);
    }
  });

  socket.on('update-avatar', async ({ avatar }) => {
    const username = socket.data.username;
    const key = socket.data.accountKey;
    if (!key) return;

    try {
      await db.saveUser(key, username, socket.data.role, avatar);
      socket.data.avatar = avatar;
      if (connectedUsers[socket.id]) {
        connectedUsers[socket.id].avatar = avatar;
      }
      socket.emit('avatar-updated', { avatar });
      await broadcastUsersState();
    } catch (err) {
      console.error("Fehler beim Aktualisieren des Avatars:", err);
      socket.emit('error-msg', 'Fehler beim Speichern des Avatars.');
    }
  });

  // --- NICKNAME CHANGE SYSTEM ---

  // 1. Eigener Name ändern
  socket.on('change-nickname', async ({ nickname }) => {
    const oldUsername = socket.data.username;
    const cleanNickname = nickname.trim();
    if (!cleanNickname || cleanNickname.length < 2 || cleanNickname.length > 20) {
      socket.emit('error-msg', 'Name muss zwischen 2 und 20 Zeichen lang sein.');
      return;
    }

    socket.data.username = cleanNickname;
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].username = cleanNickname;
    }

    const key = socket.data.accountKey;
    if (key) {
      try {
        await db.saveUser(key, cleanNickname, socket.data.role);
        // PNs updaten
        await db.updateUsernameInPns(oldUsername, cleanNickname);
      } catch (err) {
        console.error(err);
      }
    }

    // Eigene Bestätigung
    socket.emit('nickname-updated', { username: cleanNickname });
    
    // Voice-Room updaten
    const currentRoom = socket.data.currentRoom;
    if (currentRoom) {
      io.to(currentRoom).emit('user-updated', { socketId: socket.id, username: cleanNickname });
    }

    // Systemmeldung im Textkanal
    const currentTextRoom = connectedUsers[socket.id]?.currentTextRoom || 'general';
    const sysMsg = {
      id: Math.random().toString(36).substr(2, 9),
      username: 'System',
      role: 'admin',
      text: `»${oldUsername}« heißt jetzt »${cleanNickname}«.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!chatMessagesByChannel[currentTextRoom]) {
      chatMessagesByChannel[currentTextRoom] = [];
    }
    chatMessagesByChannel[currentTextRoom].push(sysMsg);
    io.to(`text-${currentTextRoom}`).emit('chat-message', sysMsg);

    broadcastUsersState();
  });

  // 2. Nickname eines anderen Benutzers ändern (Admin-Feature)
  socket.on('change-user-nickname', async ({ targetSocketId, newNickname }) => {
    if (!hasPermission(socket, 'canManageUsers')) {
      socket.emit('error-msg', 'Keine Berechtigung, Nicknames anderer Benutzer zu ändern.');
      return;
    }

    const cleanNickname = newNickname.trim();
    if (!cleanNickname || cleanNickname.length < 2 || cleanNickname.length > 20) {
      socket.emit('error-msg', 'Name muss zwischen 2 und 20 Zeichen lang sein.');
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      const oldUsername = targetSocket.data.username;
      
      targetSocket.data.username = cleanNickname;
      if (connectedUsers[targetSocketId]) {
        connectedUsers[targetSocketId].username = cleanNickname;
      }

      const key = targetSocket.data.accountKey;
      if (key) {
        try {
          await db.saveUser(key, cleanNickname, targetSocket.data.role);
          // PNs updaten
          await db.updateUsernameInPns(oldUsername, cleanNickname);
        } catch (err) {
          console.error(err);
        }
      }

      // Target informieren
      targetSocket.emit('nickname-updated', { username: cleanNickname });
      
      // Voice Room informieren
      const currentRoom = targetSocket.data.currentRoom;
      if (currentRoom) {
        io.to(currentRoom).emit('user-updated', { socketId: targetSocketId, username: cleanNickname });
      }

      // Systemmeldung im Textkanal
      const currentTextRoom = connectedUsers[targetSocketId]?.currentTextRoom || 'general';
      const sysMsg = {
        id: Math.random().toString(36).substr(2, 9),
        username: 'System',
        role: 'admin',
        text: `Admin »${socket.data.username}« hat den Namen von »${oldUsername}« in »${cleanNickname}« geändert.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!chatMessagesByChannel[currentTextRoom]) {
        chatMessagesByChannel[currentTextRoom] = [];
      }
      chatMessagesByChannel[currentTextRoom].push(sysMsg);
      io.to(`text-${currentTextRoom}`).emit('chat-message', sysMsg);

      broadcastUsersState();
    }
  });

  // --- LIVE RECHTEVERWALTUNG (ADMIN FEATURES) ---

  socket.on('change-user-role', async ({ targetSocketId, newRole }) => {
    if (!hasPermission(socket, 'canManageRoles')) {
      socket.emit('error-msg', 'Keine Berechtigung, Benutzerrollen zu verwalten.');
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.data.role = newRole;
      if (connectedUsers[targetSocketId]) {
        connectedUsers[targetSocketId].role = newRole;
      }

      const key = targetSocket.data.accountKey;
      if (key) {
        try {
          await db.saveUser(key, targetSocket.data.username, newRole);
        } catch (err) {
          console.error(err);
        }
      }

      targetSocket.emit('role-updated', { role: newRole });
      console.log(`Admin ${socket.data.username} hat ${targetSocket.data.username} auf '${newRole}' gestuft.`);
      
      broadcastUsersState();
    }
  });

  socket.on('change-channel-permission', ({ channelType, channelId, newMinRole }) => {
    if (!hasPermission(socket, 'canManageChannels')) {
      socket.emit('error-msg', 'Keine Berechtigung, Kanalrechte zu verwalten.');
      return;
    }

    if (channelType === 'voice') {
      const ch = channels.find((c) => c.id === channelId);
      if (ch) {
        ch.minRole = newMinRole;
        io.emit('channels-list', channels);
        console.log(`Kanalrecht geändert für Voice-Kanal ${ch.name} -> ${newMinRole}`);
      }
    } else if (channelType === 'text') {
      const ch = textChannels.find((c) => c.id === channelId);
      if (ch) {
        ch.minRole = newMinRole;
        io.emit('text-channels-list', textChannels);
        console.log(`Kanalrecht geändert für Text-Kanal ${ch.name} -> ${newMinRole}`);
      }
    }
  });

  // --- TEXT CHANNEL MANAGEMENT ---

  socket.on('join-text-channel', ({ channelId }) => {
    const currentTextRoom = connectedUsers[socket.id]?.currentTextRoom;
    if (currentTextRoom) {
      socket.leave(`text-${currentTextRoom}`);
    }

    socket.join(`text-${channelId}`);
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].currentTextRoom = channelId;
    }

    const history = chatMessagesByChannel[channelId] || [];
    socket.emit('text-history', history);
    
    // Nach Beitritt auch direkt Online-User an diesen Client schicken
    socket.emit('online-users-list', Object.values(connectedUsers).map(u => ({ socketId: u.socketId, username: u.username, role: u.role })));
    
    broadcastUsersState();
  });

  socket.on('create-text-channel', ({ name, minRole, creatorRole }) => {
    if (creatorRole !== 'admin') {
      socket.emit('error-msg', 'Nur Admins können Kanäle erstellen.');
      return;
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-💬';
    const newId = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4);

    const newChannel = {
      id: newId,
      name: cleanName,
      minRole: minRole || 'guest'
    };

    textChannels.push(newChannel);
    chatMessagesByChannel[newId] = [
      {
        id: `sys-created-${newId}`,
        username: 'System',
        role: 'admin',
        text: `Kanal #${cleanName} wurde erfolgreich erstellt.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    io.emit('text-channels-list', textChannels);
  });

  // --- VOICE SYSTEMS ---

  socket.on('join-room', async ({ roomId, username, role }) => {
    const channel = channels.find(c => c.id === roomId);
    if (!channel) {
      socket.emit('error-msg', 'Raum existiert nicht.');
      return;
    }

    const rolesPriority = { guest: 1, member: 2, admin: 3 };
    const userPriority = rolesPriority[role] || 1;
    const requiredPriority = rolesPriority[channel.minRole] || 1;

    if (userPriority < requiredPriority) {
      socket.emit('error-msg', 'Keine Berechtigung für diesen Raum.');
      return;
    }

    leaveCurrentRooms(socket);

    socket.join(roomId);
    socket.data.currentRoom = roomId;
    socket.data.username = username;
    socket.data.role = role;

    if (!roomParticipants[roomId]) {
      roomParticipants[roomId] = {};
    }

    roomParticipants[roomId][socket.id] = {
      socketId: socket.id,
      username,
      role
    };

    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].currentRoom = roomId;
    }

    console.log(`${username} joined room: ${roomId}`);

    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      username,
      role
    });

    const participants = Object.values(roomParticipants[roomId]).filter(p => p.socketId !== socket.id);
    socket.emit('room-participants', participants);

    // LiveKit Token für den Client generieren und senden
    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: username,
        ttl: '2h',
      });
      at.addGrant({
        roomJoin: true,
        room: roomId,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });
      const token = await at.toJwt();
      socket.emit('livekit-token', {
        token,
        serverUrl: LIVEKIT_PUBLIC_URL,
        roomId
      });
    } catch (err) {
      console.error('Fehler bei der LiveKit-Tokengenerierung:', err);
      socket.emit('error-msg', 'LiveKit Token-Generierung fehlgeschlagen.');
    }
    
    broadcastUsersState();
  });

  // --- TEXT MESSAGE DISTRIBUTION ---
  
  socket.on('chat-message', ({ text, username, role, channelId }) => {
    const activeChannel = channelId || 'general';
    
    const newMessage = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      role,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!chatMessagesByChannel[activeChannel]) {
      chatMessagesByChannel[activeChannel] = [];
    }

    chatMessagesByChannel[activeChannel].push(newMessage);
    if (chatMessagesByChannel[activeChannel].length > 100) {
      chatMessagesByChannel[activeChannel].shift();
    }

    io.to(`text-${activeChannel}`).emit('chat-message', newMessage);
  });

  // --- PRIVATE MESSAGE DISTRIBUTION ---
  socket.on('private-message', async ({ receiverUsername, text }) => {
    const senderUsername = socket.data.username;
    if (!senderUsername) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = {
      id: Math.random().toString(36).substr(2, 9),
      senderUsername,
      senderRole: socket.data.role || 'guest',
      receiverUsername,
      text,
      timestamp
    };

    try {
      // In DB speichern
      await db.savePrivateMessage(payload.id, payload.senderUsername, payload.senderRole, payload.receiverUsername, payload.text, payload.timestamp);

      // An Empfänger senden (falls online)
      const receiverConnection = Object.values(connectedUsers).find((c) => c.username === receiverUsername);
      if (receiverConnection) {
        io.to(receiverConnection.socketId).emit('private-message', payload);
      }

      // An Sender senden zur Bestätigung
      socket.emit('private-message', payload);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Senden der privaten Nachricht.');
    }
  });

  socket.on('create-channel', ({ name, minRole }) => {
    if (!hasPermission(socket, 'canManageChannels')) {
      socket.emit('error-msg', 'Keine Berechtigung, Kanäle zu erstellen.');
      return;
    }

    const newChannel = {
      id: name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4),
      name,
      minRole: minRole || 'guest'
    };

    channels.push(newChannel);
    io.emit('channels-list', channels);
  });

  // --- EMOJI REACTION EVENTS ---

  socket.on('toggle-reaction', ({ channelId, messageId, emoji }) => {
    const activeChannel = channelId || 'general';
    const channelMessages = chatMessagesByChannel[activeChannel] || [];
    const msg = channelMessages.find(m => m.id === messageId);
    if (msg) {
      if (!msg.reactions) {
        msg.reactions = {};
      }
      if (!msg.reactions[emoji]) {
        msg.reactions[emoji] = [];
      }
      
      const idx = msg.reactions[emoji].indexOf(socket.data.username);
      if (idx > -1) {
        msg.reactions[emoji].splice(idx, 1);
        if (msg.reactions[emoji].length === 0) {
          delete msg.reactions[emoji];
        }
      } else {
        msg.reactions[emoji].push(socket.data.username);
      }
      
      io.to(`text-${activeChannel}`).emit('message-reactions-updated', {
        channelId: activeChannel,
        messageId,
        reactions: msg.reactions
      });
    }
  });

  socket.on('toggle-private-reaction', async ({ messageId, emoji, partnerUsername }) => {
    try {
      const username = socket.data.username;
      if (!username) return;
      
      await db.togglePrivateMessageReaction(messageId, emoji, username);
      const updatedReactions = await db.getPrivateMessageReactions(messageId);
      
      socket.emit('private-message-reactions-updated', { messageId, reactions: updatedReactions });
      
      const partnerConnection = Object.values(connectedUsers).find(c => c.username === partnerUsername);
      if (partnerConnection) {
        io.to(partnerConnection.socketId).emit('private-message-reactions-updated', { messageId, reactions: updatedReactions });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // --- ROLE MANAGEMENT EVENTS ---

  socket.on('create-role', async ({ name, color, canManageRoles, canManageChannels, canManageUsers }) => {
    if (!hasPermission(socket, 'canManageRoles')) {
      socket.emit('error-msg', 'Keine Berechtigung, Rollen zu verwalten.');
      return;
    }
    try {
      await db.saveRole(name, color, canManageRoles, canManageChannels, canManageUsers);
      rolesCache[name] = { color, canManageRoles, canManageChannels, canManageUsers };
      broadcastRoles();
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Erstellen der Rolle.');
    }
  });

  socket.on('update-role', async ({ name, color, canManageRoles, canManageChannels, canManageUsers }) => {
    if (!hasPermission(socket, 'canManageRoles')) {
      socket.emit('error-msg', 'Keine Berechtigung, Rollen zu verwalten.');
      return;
    }
    try {
      await db.saveRole(name, color, canManageRoles, canManageChannels, canManageUsers);
      rolesCache[name] = { color, canManageRoles, canManageChannels, canManageUsers };
      broadcastRoles();
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Aktualisieren der Rolle.');
    }
  });

  socket.on('delete-role', async ({ name }) => {
    if (!hasPermission(socket, 'canManageRoles')) {
      socket.emit('error-msg', 'Keine Berechtigung, Rollen zu verwalten.');
      return;
    }
    if (name === 'admin' || name === 'member' || name === 'guest') {
      socket.emit('error-msg', 'Standardrollen können nicht gelöscht werden.');
      return;
    }
    try {
      await db.deleteRole(name);
      delete rolesCache[name];
      broadcastRoles();
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Löschen der Rolle.');
    }
  });

  // --- MESSAGE SEARCH EVENTS ---

  socket.on('search-private-messages', async ({ partnerUsername, query }) => {
    try {
      const username = socket.data.username;
      if (!username || !partnerUsername) return;
      const results = await db.searchPrivateMessages(username, partnerUsername, query);
      socket.emit('search-private-results', { partnerUsername, results });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler bei der Suche nach DMs.');
    }
  });

  // --- COWORKING / DOCUMENT WORKSPACE EVENTS ---

  socket.on('get-documents', async () => {
    try {
      const list = await db.getAllDocuments();
      socket.emit('documents-list', list);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Laden der Dokumentenliste.');
    }
  });

  socket.on('create-document', async ({ title, type, externalUrl }) => {
    const cleanTitle = title.trim() || 'Unbenanntes Dokument';
    const docId = Math.random().toString(36).substr(2, 9);
    try {
      await db.saveDocument(docId, cleanTitle, null, type || 'text', externalUrl || null);
      const list = await db.getAllDocuments();
      io.emit('documents-list', list);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Erstellen des Dokuments.');
    }
  });

  socket.on('delete-document', async ({ docId }) => {
    if (!hasPermission(socket, 'canManageChannels') && socket.data.role !== 'admin') {
      socket.emit('error-msg', 'Keine Berechtigung, Dokumente zu löschen.');
      return;
    }
    try {
      await db.deleteDocument(docId);
      delete activeDocs[docId];
      if (docSaveTimeouts[docId]) {
        clearTimeout(docSaveTimeouts[docId]);
        delete docSaveTimeouts[docId];
      }
      const list = await db.getAllDocuments();
      io.emit('documents-list', list);
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Löschen des Dokuments.');
    }
  });

  socket.on('join-document', async ({ docId }) => {
    try {
      const prevDocId = socket.data.currentDocId;
      if (prevDocId) {
        socket.leave(`doc-${prevDocId}`);
      }

      socket.join(`doc-${docId}`);
      socket.data.currentDocId = docId;

      let ydoc = activeDocs[docId];
      if (!ydoc) {
        ydoc = new Y.Doc();
        const dbDoc = await db.getDocument(docId);
        if (dbDoc && dbDoc.content) {
          Y.applyUpdate(ydoc, new Uint8Array(dbDoc.content));
        }
        activeDocs[docId] = ydoc;
      }

      const stateUpdate = Y.encodeStateAsUpdate(ydoc);
      socket.emit('document-init', {
        docId,
        update: Buffer.from(stateUpdate)
      });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Öffnen des Dokuments.');
    }
  });

  socket.on('leave-document', () => {
    const docId = socket.data.currentDocId;
    if (docId) {
      socket.leave(`doc-${docId}`);
      socket.data.currentDocId = null;
    }
  });

  socket.on('yjs-update', ({ docId, update }) => {
    const ydoc = activeDocs[docId];
    if (ydoc && update) {
      try {
        Y.applyUpdate(ydoc, new Uint8Array(update));
        socket.to(`doc-${docId}`).emit('yjs-update', { docId, update });

        if (!docSaveTimeouts[docId]) {
          docSaveTimeouts[docId] = setTimeout(async () => {
            delete docSaveTimeouts[docId];
            const currentDoc = activeDocs[docId];
            if (currentDoc) {
              try {
                const dbDoc = await db.getDocument(docId);
                const title = dbDoc ? dbDoc.title : 'Unbenanntes Dokument';
                const binaryState = Y.encodeStateAsUpdate(currentDoc);
                await db.saveDocument(docId, title, Buffer.from(binaryState));
              } catch (saveErr) {
                console.error(`Fehler beim automatischen Speichern von Dokument ${docId}:`, saveErr);
              }
            }
          }, 2000);
        }
      } catch (err) {
        console.error("Yjs update error:", err);
      }
    }
  });

  socket.on('yjs-awareness-update', ({ docId, update }) => {
    socket.to(`doc-${docId}`).emit('yjs-awareness-update', { docId, update });
  });

  socket.on('yjs-awareness-request', ({ docId }) => {
    socket.to(`doc-${docId}`).emit('yjs-awareness-request', { docId });
  });

  socket.on('get-attachments', async ({ docId }) => {
    try {
      const list = await db.getAttachments(docId);
      socket.emit('attachments-list', { docId, list });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Laden der Dateianhänge.');
    }
  });

  socket.on('upload-attachment', async ({ docId, filename, filedata }) => {
    const attachmentId = Math.random().toString(36).substr(2, 9);
    try {
      await db.saveAttachment(attachmentId, docId, filename, filedata);
      const list = await db.getAttachments(docId);
      io.to(`doc-${docId}`).emit('attachments-list', { docId, list });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Hochladen der Datei.');
    }
  });

  socket.on('delete-attachment', async ({ docId, attachmentId }) => {
    if (!hasPermission(socket, 'canManageChannels') && socket.data.role !== 'admin') {
      socket.emit('error-msg', 'Keine Berechtigung, Anhänge zu löschen.');
      return;
    }
    try {
      await db.deleteAttachment(attachmentId);
      const list = await db.getAttachments(docId);
      io.to(`doc-${docId}`).emit('attachments-list', { docId, list });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Löschen der Datei.');
    }
  });

  socket.on('leave-room', () => {
    leaveCurrentRooms(socket);
    broadcastUsersState();
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete connectedUsers[socket.id];
    broadcastUsersState();
    leaveCurrentRooms(socket);
  });
});

function leaveCurrentRooms(socket) {
  const roomId = socket.data.currentRoom;
  if (roomId && roomParticipants[roomId]) {
    delete roomParticipants[roomId][socket.id];
    
    if (Object.keys(roomParticipants[roomId]).length === 0) {
      delete roomParticipants[roomId];
    }

    socket.to(roomId).emit('user-left', { socketId: socket.id });
    socket.leave(roomId);
    socket.data.currentRoom = null;
    
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].currentRoom = null;
    }
  }
}

// Serve static built client files in production (Unified port 3001)
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  const clientDistPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  console.log(`Produktionsmodus: Statische Client-Dateien werden aus ${clientDistPath} serviert.`);
}

const startServer = async () => {
  await db.init();

  // Load roles from database into cache
  try {
    const dbRoles = await db.getAllRoles();
    dbRoles.forEach(r => {
      rolesCache[r.name] = {
        color: r.color,
        canManageRoles: !!r.canManageRoles,
        canManageChannels: !!r.canManageChannels,
        canManageUsers: !!r.canManageUsers
      };
    });
    console.log(`${Object.keys(rolesCache).length} Rollen erfolgreich in den Cache geladen.`);
  } catch (err) {
    console.error("Fehler beim Laden der Rollen in den Cache:", err);
  }

  // Demo-Bereinigungs-Intervall (alle 1 Minute)
  if (process.env.ALLOW_DEMO_ROLES === 'true') {
    setInterval(async () => {
      try {
        await db.deleteOldDemoAccounts();
      } catch (err) {
        console.error("Fehler bei der Demo-Bereinigung:", err);
      }
    }, 60000);
    console.log("Demo-Bereinigungs-Intervall (10 Min. Lebensdauer) gestartet.");
  }

  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error("Kritischer Startfehler:", err);
});
