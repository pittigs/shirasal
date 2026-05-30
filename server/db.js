import knexLib from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

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
    config = {
      client: 'sqlite3',
      connection: {
        filename: process.env.DB_FILE_PATH || path.join(__dirname, 'shirasal.sqlite')
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
  
  // Format to standard JS object
  return list.map(m => ({
    id: m.id,
    senderUsername: m.senderUsername,
    senderRole: m.senderRole,
    receiverUsername: m.receiverUsername,
    text: m.text,
    timestamp: m.timestamp
  }));
};

export const updateUsernameInPns = async (oldName, newName) => {
  await knex('private_messages')
    .where({ senderUsername: oldName })
    .update({ senderUsername: newName });
  await knex('private_messages')
    .where({ receiverUsername: oldName })
    .update({ receiverUsername: newName });
};
