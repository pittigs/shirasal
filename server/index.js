import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const app = express();
app.use(cors());

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

// Hilfsfunktion: Sendet an alle verbundenen Admins die detaillierte Live-Nutzerliste
const broadcastConnectedUsersToAdmins = () => {
  const adminSockets = Array.from(io.sockets.sockets.values()).filter(
    (s) => s.data.role === 'admin'
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
    role: u.role
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
        online: !!onlineUser,
        socketId: onlineUser ? onlineUser.socketId : null
      };
    });
    socket.emit('all-users-list', allUsers);
  }).catch(err => console.error(err));

  // --- ACCOUNT MANAGEMENT SYSTEM ---

  socket.on('create-account', async ({ role }) => {
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
    
    const newUser = {
      accountKey,
      username,
      role: chosenRole
    };

    try {
      await db.saveUser(accountKey, username, chosenRole);
      console.log(`Account erstellt: ${username} (${chosenRole})`);
      
      socket.data.username = username;
      socket.data.role = chosenRole;
      socket.data.accountKey = accountKey;
      
      connectedUsers[socket.id] = {
        socketId: socket.id,
        username,
        role: chosenRole,
        accountKey,
        currentRoom: null,
        currentTextRoom: 'general'
      };

      socket.emit('account-created', newUser);
      await sendPrivateHistory(socket, username);
      socket.join('text-general');
      broadcastUsersState();
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Fehler beim Erstellen des Accounts.');
    }
  });

  socket.on('login-account', async ({ accountKey }) => {
    try {
      const user = await db.getUser(accountKey);
      if (user) {
        console.log(`Erfolgreicher Login: ${user.username} (${user.role})`);
        
        socket.data.username = user.username;
        socket.data.role = user.role;
        socket.data.accountKey = accountKey;

        connectedUsers[socket.id] = {
          socketId: socket.id,
          username: user.username,
          role: user.role,
          accountKey,
          currentRoom: null,
          currentTextRoom: 'general'
        };

        socket.emit('login-success', user);
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
    if (socket.data.role !== 'admin') {
      socket.emit('error-msg', 'Nur Admins dürfen Nicknames anderer Benutzer ändern.');
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
    if (socket.data.role !== 'admin') {
      socket.emit('error-msg', 'Nur Admins dürfen Benutzerrechte verwalten.');
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
    if (socket.data.role !== 'admin') {
      socket.emit('error-msg', 'Nur Admins dürfen Kanallizenzen verwalten.');
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

  socket.on('join-room', ({ roomId, username, role }) => {
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
    
    broadcastUsersState();
  });

  socket.on('webrtc-signal', ({ targetId, signal }) => {
    io.to(targetId).emit('webrtc-signal', {
      senderId: socket.id,
      signal
    });
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

  socket.on('create-channel', ({ name, minRole, creatorRole }) => {
    if (creatorRole !== 'admin') {
      socket.emit('error-msg', 'Nur Admins können Kanäle erstellen.');
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
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error("Kritischer Startfehler:", err);
});
