import knexLib from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let knex = null;

export const init = async () => {
  const dbType = process.env.DB_TYPE || 'sqlite';
  
  let config = {};
  if (dbType === 'mariadb' || dbType === 'mysql') {
    config = {
      client: 'mysql2',
      connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'shirasal',
        password: process.env.DB_PASS || 'secret',
        database: process.env.DB_NAME || 'shirasal_db'
      }
    };
    console.log(`Verbinde mit MariaDB-Datenbank: ${config.connection.database} auf ${config.connection.host}`);
  } else {
    const dbPath = process.env.DB_FILE_PATH || path.join(__dirname, 'shirasal.sqlite');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`Verzeichnis für SQLite-Datenbank erstellt: ${dbDir}`);
      } catch (err) {
        console.error(`Fehler beim Erstellen des SQLite-Verzeichnisses: ${err.message}`);
      }
    }
    config = {
      client: 'sqlite3',
      connection: {
        filename: dbPath
      },
      useNullAsDefault: true
    };
    console.log(`Verbinde mit SQLite-Datenbank: ${config.connection.filename}`);
  }

  knex = knexLib(config);

  // Tabellen erstellen
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.string('accountKey', 100).primary();
      table.string('username', 100).unique().notNullable();
      table.string('role', 50).defaultTo('guest');
      table.text('avatar', 'longtext').nullable();
    });
    console.log('Tabelle "users" erstellt.');
  } else {
    // Spalte 'avatar' nachträglich hinzufügen, falls sie fehlt
    if (!(await knex.schema.hasColumn('users', 'avatar'))) {
      await knex.schema.alterTable('users', (table) => {
        table.text('avatar', 'longtext').nullable();
      });
      console.log('Spalte "avatar" zur Tabelle "users" hinzugefügt.');
    }
  }


  if (!(await knex.schema.hasTable('private_messages'))) {
    await knex.schema.createTable('private_messages', (table) => {
      table.string('id', 50).primary();
      table.string('senderUsername', 100).notNullable();
      table.string('senderRole', 50).defaultTo('guest');
      table.string('receiverUsername', 100).notNullable();
      table.text('text', 'longtext').notNullable();
      table.string('timestamp', 20).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('Tabelle "private_messages" erstellt.');
  }

  // Create roles table
  if (!(await knex.schema.hasTable('roles'))) {
    await knex.schema.createTable('roles', (table) => {
      table.string('name', 50).primary();
      table.string('color', 20).notNullable();
      table.boolean('canManageRoles').defaultTo(false);
      table.boolean('canManageChannels').defaultTo(false);
      table.boolean('canManageUsers').defaultTo(false);
    });
    console.log('Tabelle "roles" erstellt.');
    
    // Insert default roles
    await knex('roles').insert([
      { name: 'admin', color: '#ff4a4a', canManageRoles: true, canManageChannels: true, canManageUsers: true },
      { name: 'member', color: '#4aff4a', canManageRoles: false, canManageChannels: false, canManageUsers: false },
      { name: 'guest', color: '#aaaaaa', canManageRoles: false, canManageChannels: false, canManageUsers: false }
    ]);
    console.log('Standardrollen in Tabelle "roles" eingefügt.');
  }

  // Create private message reactions table
  if (!(await knex.schema.hasTable('private_message_reactions'))) {
    await knex.schema.createTable('private_message_reactions', (table) => {
      table.string('messageId', 50).notNullable();
      table.string('emoji', 50).notNullable();
      table.string('username', 100).notNullable();
      table.primary(['messageId', 'emoji', 'username']);
    });
    console.log('Tabelle "private_message_reactions" erstellt.');
  }
};

export const saveUser = async (accountKey, username, role, avatar) => {
  const existing = await knex('users').where({ accountKey }).first();
  if (existing) {
    const updates = { username, role };
    if (avatar !== undefined) updates.avatar = avatar;
    await knex('users').where({ accountKey }).update(updates);
  } else {
    await knex('users').insert({ accountKey, username, role, avatar: avatar || null });
  }
};

export const getUser = async (accountKey) => {
  return knex('users').where({ accountKey }).first();
};

export const getAllUsers = async () => {
  return knex('users').select('username', 'role', 'avatar');
};

export const savePrivateMessage = async (id, senderUsername, senderRole, receiverUsername, text, timestamp) => {
  await knex('private_messages').insert({
    id,
    senderUsername,
    senderRole,
    receiverUsername,
    text,
    timestamp
  });
};

export const getPrivateMessages = async (username) => {
  const list = await knex('private_messages')
    .where({ senderUsername: username })
    .orWhere({ receiverUsername: username })
    .orderBy('created_at', 'asc');
  
  if (list.length === 0) return [];

  const messageIds = list.map(m => m.id);
  const reactions = await knex('private_message_reactions').whereIn('messageId', messageIds);

  const reactionsMap = {};
  reactions.forEach(r => {
    if (!reactionsMap[r.messageId]) {
      reactionsMap[r.messageId] = {};
    }
    if (!reactionsMap[r.messageId][r.emoji]) {
      reactionsMap[r.messageId][r.emoji] = [];
    }
    reactionsMap[r.messageId][r.emoji].push(r.username);
  });

  return list.map(m => ({
    id: m.id,
    senderUsername: m.senderUsername,
    senderRole: m.senderRole,
    receiverUsername: m.receiverUsername,
    text: m.text,
    timestamp: m.timestamp,
    reactions: reactionsMap[m.id] || {}
  }));
};

export const updateUsernameInPns = async (oldName, newName) => {
  await knex('private_messages')
    .where({ senderUsername: oldName })
    .update({ senderUsername: newName });
  await knex('private_messages')
    .where({ receiverUsername: oldName })
    .update({ receiverUsername: newName });
  await knex('private_message_reactions')
    .where({ username: oldName })
    .update({ username: newName });
};

// --- ROLES DATABASE API ---

export const getAllRoles = async () => {
  return knex('roles').select('*');
};

export const saveRole = async (name, color, canManageRoles, canManageChannels, canManageUsers) => {
  const existing = await knex('roles').where({ name }).first();
  const data = {
    color,
    canManageRoles: !!canManageRoles,
    canManageChannels: !!canManageChannels,
    canManageUsers: !!canManageUsers
  };
  if (existing) {
    await knex('roles').where({ name }).update(data);
  } else {
    await knex('roles').insert({ name, ...data });
  }
};

export const deleteRole = async (name) => {
  if (name === 'admin' || name === 'member' || name === 'guest') return;
  await knex('roles').where({ name }).delete();
};

// --- PRIVATE MESSAGE REACTIONS API ---

export const togglePrivateMessageReaction = async (messageId, emoji, username) => {
  const existing = await knex('private_message_reactions')
    .where({ messageId, emoji, username })
    .first();
  if (existing) {
    await knex('private_message_reactions')
      .where({ messageId, emoji, username })
      .delete();
    return false;
  } else {
    await knex('private_message_reactions')
      .insert({ messageId, emoji, username });
    return true;
  }
};

export const getPrivateMessageReactions = async (messageId) => {
  const list = await knex('private_message_reactions').where({ messageId });
  const map = {};
  list.forEach(r => {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.username);
  });
  return map;
};

export const searchPrivateMessages = async (username, partnerUsername, query) => {
  const list = await knex('private_messages')
    .where(function() {
      this.where({ senderUsername: username, receiverUsername: partnerUsername })
        .orWhere({ senderUsername: partnerUsername, receiverUsername: username });
    })
    .andWhere('text', 'like', `%${query}%`)
    .orderBy('created_at', 'asc');

  if (list.length === 0) return [];

  const messageIds = list.map(m => m.id);
  const reactions = await knex('private_message_reactions').whereIn('messageId', messageIds);

  const reactionsMap = {};
  reactions.forEach(r => {
    if (!reactionsMap[r.messageId]) {
      reactionsMap[r.messageId] = {};
    }
    if (!reactionsMap[r.messageId][r.emoji]) {
      reactionsMap[r.messageId][r.emoji] = [];
    }
    reactionsMap[r.messageId][r.emoji].push(r.username);
  });

  return list.map(m => ({
    id: m.id,
    senderUsername: m.senderUsername,
    senderRole: m.senderRole,
    receiverUsername: m.receiverUsername,
    text: m.text,
    timestamp: m.timestamp,
    reactions: reactionsMap[m.id] || {}
  }));
};
