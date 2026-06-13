// API Routes — Authentication & Save Data
// RESTful endpoints for user management and cloud save persistence.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('./db');

const router = express.Router();

// JWT secret — in production use env variable, for this game a static key is fine
const JWT_SECRET = process.env.JWT_SECRET || 'cozy_adventure_chronicle_secret_key_2024';
const JWT_EXPIRES_IN = '30d'; // Token lasts 30 days

// ─────────────────── Middleware: JWT Auth ───────────────────

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: '認証が必要です。ログインしてください。' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'トークンが無効または期限切れです。再ログインしてください。' });
    }
}

// ─────────────────── POST /api/register ───────────────────

router.post('/register', (req, res) => {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
        return res.status(400).json({ error: 'ユーザー名は3〜20文字にしてください。' });
    }

    if (!/^[a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/.test(trimmedUsername)) {
        return res.status(400).json({ error: 'ユーザー名に使用できるのは英数字、ひらがな、カタカナ、漢字、アンダースコアのみです。' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'パスワードは6文字以上にしてください。' });
    }

    const db = getDB();

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUsername);
    if (existing) {
        return res.status(409).json({ error: 'そのユーザー名はすでに使用されています。' });
    }

    // Hash password and insert
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(trimmedUsername, passwordHash);

    // Generate JWT
    const token = jwt.sign(
        { id: result.lastInsertRowid, username: trimmedUsername },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
        message: 'アカウントが作成されました！',
        token,
        user: { id: result.lastInsertRowid, username: trimmedUsername }
    });
});

// ─────────────────── POST /api/login ───────────────────

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
    }

    const db = getDB();
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username.trim());

    if (!user) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています。' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています。' });
    }

    // Generate JWT
    const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
        message: 'ログイン成功！',
        token,
        user: { id: user.id, username: user.username }
    });
});

// ─────────────────── GET /api/me ───────────────────

router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username } });
});

// ─────────────────── GET /api/save ───────────────────

router.get('/save', authenticateToken, (req, res) => {
    const db = getDB();
    const row = db.prepare('SELECT game_state, updated_at FROM save_data WHERE user_id = ?').get(req.user.id);

    if (!row) {
        return res.json({ exists: false, gameState: null });
    }

    try {
        const gameState = JSON.parse(row.game_state);
        res.json({ exists: true, gameState, updatedAt: row.updated_at });
    } catch (e) {
        res.json({ exists: false, gameState: null });
    }
});

// ─────────────────── POST /api/save ───────────────────

router.post('/save', authenticateToken, (req, res) => {
    const { gameState } = req.body;

    if (!gameState) {
        return res.status(400).json({ error: 'セーブデータが含まれていません。' });
    }

    const db = getDB();
    const gameStateJSON = JSON.stringify(gameState);

    // UPSERT: insert or update
    db.prepare(`
        INSERT INTO save_data (user_id, game_state, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET 
            game_state = excluded.game_state,
            updated_at = CURRENT_TIMESTAMP
    `).run(req.user.id, gameStateJSON);

    res.json({ message: 'セーブ完了！', savedAt: new Date().toISOString() });
});

module.exports = router;
