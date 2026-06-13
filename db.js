// Database Layer — SQLite via better-sqlite3
// Manages user accounts and save data persistence.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'game_data.db');

let db;

function initDB() {
    db = new Database(DB_PATH);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');

    // Create tables if they don't exist
    db.exec(`
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

    console.log('✅ Database initialized at:', DB_PATH);
    return db;
}

function getDB() {
    if (!db) {
        return initDB();
    }
    return db;
}

module.exports = { initDB, getDB };
