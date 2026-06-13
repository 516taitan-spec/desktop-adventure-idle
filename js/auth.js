// Authentication & Cloud Save Sync Engine
// Handles JWT storage, server APIs, and conflict resolution between local and cloud states.

const AUTH_TOKEN_KEY = "desktop_cozy_adventure_token";
const CLOUD_SYNC_INTERVAL = 15000; // 15 seconds

class AuthManager {
    constructor() {
        this.token = localStorage.getItem(AUTH_TOKEN_KEY) || null;
        this.user = null;
        this.syncTimer = null;
        this.lastCloudSyncTime = 0;
    }

    async init() {
        if (!this.token) return null;

        try {
            const response = await fetch('/api/me', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.startAutoSync();
                this.triggerAuthChange();
                return this.user;
            } else {
                // Token expired or invalid
                this.logout();
                return null;
            }
        } catch (e) {
            console.error("Auth initialization failed:", e);
            // Don't log out on network error, keep local token
            return null;
        }
    }

    isAuthenticated() {
        return !!this.user;
    }

    getUsername() {
        return this.user ? this.user.username : null;
    }

    triggerAuthChange() {
        const event = new CustomEvent('auth-change', { detail: { user: this.user } });
        window.dispatchEvent(event);
    }

    async register(username, password) {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '登録中にエラーが発生しました。');
        }

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem(AUTH_TOKEN_KEY, this.token);
        
        // On new registration, upload the current local state immediately to the cloud
        if (window.game) {
            await this.uploadSave(window.game.state);
        }

        this.startAutoSync();
        this.triggerAuthChange();
        return this.user;
    }

    async login(username, password) {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'ログイン中にエラーが発生しました。');
        }

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem(AUTH_TOKEN_KEY, this.token);

        this.triggerAuthChange();
        
        // Sync save data after login
        await this.handleLoginSync();
        
        this.startAutoSync();
        return this.user;
    }

    logout() {
        this.stopAutoSync();
        this.token = null;
        this.user = null;
        localStorage.removeItem(AUTH_TOKEN_KEY);
        this.triggerAuthChange();
    }

    // Compare local save and cloud save, resolving conflicts
    async handleLoginSync() {
        if (!window.game) return;

        try {
            const cloudSave = await this.downloadSave();
            if (!cloudSave.exists) {
                // No cloud save exists, upload current local state
                await this.uploadSave(window.game.state);
                console.log("Cloud save initialized with local state.");
                return;
            }

            const localTime = window.game.state.lastSaved || 0;
            const cloudTime = cloudSave.gameState.lastSaved || 0;

            if (cloudTime > localTime) {
                // Cloud save is newer, ask user to load it or keep local
                const confirmLoad = confirm(
                    `クラウドに最新のセーブデータが見つかりました。\n` +
                    `クラウドのデータ: ${new Date(cloudTime).toLocaleString()}\n` +
                    `ローカルのデータ: ${new Date(localTime).toLocaleString()}\n\n` +
                    `クラウドのデータをロードしますか？\n` +
                    `（「キャンセル」を押すと、ローカルのデータでクラウドを上書きします）`
                );

                if (confirmLoad) {
                    // Update state and save locally
                    window.game.state = cloudSave.gameState;
                    window.saveGame(window.game.state);
                    window.game.initFromState(); // Reinitialize game variables (UI, stats, items)
                    alert("クラウドのデータをロードしました。");
                } else {
                    // Overwrite cloud save with local
                    await this.uploadSave(window.game.state);
                    alert("ローカルのデータでクラウドを更新しました。");
                }
            } else {
                // Local is newer or equal, upload to cloud
                await this.uploadSave(window.game.state);
                console.log("Cloud save updated (Local state was newer/equal).");
            }
        } catch (e) {
            console.error("Failed to sync save data after login:", e);
            alert("クラウドセーブ同期中にエラーが発生しました。ローカルデータでプレイを続行します。");
        }
    }

    async uploadSave(gameState) {
        if (!this.isAuthenticated()) return;

        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ gameState }),
                keepalive: true
            });

            if (response.ok) {
                this.lastCloudSyncTime = Date.now();
                console.log("☁️ Save data successfully synced to the cloud.");
                return true;
            } else {
                console.warn("☁️ Cloud sync failed with status:", response.status);
                return false;
            }
        } catch (e) {
            console.error("☁️ Network error during cloud save:", e);
            return false;
        }
    }

    async downloadSave() {
        if (!this.isAuthenticated()) return { exists: false, gameState: null };

        const response = await fetch('/api/save', {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('クラウドデータの取得に失敗しました。');
        }

        return await response.json();
    }

    startAutoSync() {
        this.stopAutoSync();
        this.syncTimer = setInterval(async () => {
            if (this.isAuthenticated() && window.game) {
                // Ensure state lastSaved matches current time before syncing
                window.game.state.lastSaved = Date.now();
                window.saveGame(window.game.state);
                await this.uploadSave(window.game.state);
            }
        }, CLOUD_SYNC_INTERVAL);
    }

    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }
}

// Instantiate globally
window.auth = new AuthManager();
