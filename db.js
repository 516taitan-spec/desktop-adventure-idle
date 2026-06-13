// Database Layer — Supports SQLite (local) or PostgreSQL (production via Supabase/Neon)
// Dynamically switches based on the presence of the DATABASE_URL environment variable.

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DB_PATH = path.join(__dirname, 'game_data.db');
const DATABASE_URL = process.env.DATABASE_URL;

let sqliteDb = null;
let pgPool = null;
let isPostgres = false;

function initDB() {
    if (DATABASE_URL) {
        console.log('🔌 DATABASE_URL found. Initializing PostgreSQL pool...');
        isPostgres = true;
        pgPool = new Pool({
            connectionString: DATABASE_URL,
            ssl: {
                rejectUnauthorized: false // Required for hosted Postgres (e.g. Supabase/Neon)
            }
        });

        // Initialize PG tables
        const createTablesQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS save_data (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                game_state TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        pgPool.query(createTablesQuery)
            .then(() => {
                console.log('✅ PostgreSQL tables checked/created.');
            })
            .catch(err => {
                console.error('❌ Error initializing PostgreSQL tables:', err);
            });

    } else {
        console.log('💾 No DATABASE_URL found. Initializing local SQLite database...');
        isPostgres = false;
        sqliteDb = new Database(DB_PATH);

        // Enable WAL mode for better concurrency
        sqliteDb.pragma('journal_mode = WAL');

        // Create tables if they don't exist
        sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS save_data (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                game_state TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Local SQLite database initialized at:', DB_PATH);
    }
}

// Database helper functions (abstracted async interface)

async function findUser(username) {
    if (isPostgres) {
        const res = await pgPool.query('SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        return res.rows[0] || null;
    } else {
        const row = sqliteDb.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
        return row || null;
    }
}

async function createUser(username, passwordHash) {
    if (isPostgres) {
        const res = await pgPool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [username, passwordHash]);
        return { id: res.rows[0].id };
    } else {
        const result = sqliteDb.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
        return { id: Number(result.lastInsertRowid) };
    }
}

async function getSaveData(userId) {
    if (isPostgres) {
        const res = await pgPool.query('SELECT game_state, updated_at FROM save_data WHERE user_id = $1', [userId]);
        return res.rows[0] || null;
    } else {
        const row = sqliteDb.prepare('SELECT game_state, updated_at FROM save_data WHERE user_id = ?').get(userId);
        return row || null;
    }
}

async function saveData(userId, gameState) {
    if (isPostgres) {
        await pgPool.query(`
            INSERT INTO save_data (user_id, game_state, updated_at) 
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET 
                game_state = EXCLUDED.game_state,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, gameState]);
    } else {
        sqliteDb.prepare(`
            INSERT INTO save_data (user_id, game_state, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET 
                game_state = excluded.game_state,
                updated_at = CURRENT_TIMESTAMP
        `).run(userId, gameState);
    }
}

module.exports = {
    initDB,
    findUser,
    createUser,
    getSaveData,
    saveData
};
