// UI Adapter and Rendering Engine
// Connects core gameplay states to beautiful interactive DOM structures and glassmorphism tabs.

class GameUI {
    constructor(gameInstance) {
        this.game = gameInstance;
        
        // Element cache
        this.els = {};
        this.activeTab = "inventory";
        this.selectedInventoryItem = null;
        this.hoveredTooltipEl = null;

        this.cacheElements();
        this.setupEventListeners();
        this.renderAll();
    }

    cacheElements() {
        const ids = [
            'player-level', 'player-hp-bar', 'player-hp-text', 'player-gauge-bar',
            'enemy-name', 'enemy-hp-bar', 'enemy-hp-text', 'enemy-gauge-bar',
            'gold-display', 'scrap-display', 'crystals-display',
            'stage-name', 'stage-wave-text',
            'combat-logs', 'inventory-grid', 'inventory-count',
            'skill-points', 'skills-grid',
            'forge-upgrade-card', 'forge-craft-grid',
            'transcend-shop', 'transcend-crystals', 'transcend-btn',
            'stat-kills', 'stat-boss-kills', 'stat-total-gold', 'stat-total-scrap', 'stat-total-crystals', 'stat-time-played',
            'mute-btn', 'auto-sell-select', 'reset-btn',
            'offline-modal', 'offline-duration', 'offline-battles', 'offline-gold', 'offline-exp', 'offline-items', 'offline-close',
            'battle-arena', 'player-card', 'enemy-card',
            'player-cp', 'enemy-cp', 'auto-equip-btn'
        ];

        ids.forEach(id => {
            this.els[id] = document.getElementById(id);
        });

        // Add class element handles
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabPanels = document.querySelectorAll('.tab-panel');
    }

    setupEventListeners() {
        // Tab switching
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = btn.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Click Battle Arena for Active click
        if (this.els['battle-arena']) {
            this.els['battle-arena'].addEventListener('click', (e) => {
                // Prevent click triggering if clicking logs/buttons inside
                if (e.target.closest('button') || e.target.closest('#combat-logs')) return;
                
                // Audio and game direct damage
                this.game.activeClick();
                
                // Micro bubble click effect
                this.createClickRipple(e);
            });
        }

        // Mute button
        if (this.els['mute-btn']) {
            this.els['mute-btn'].addEventListener('click', () => {
                const isMuted = gameAudio.toggleMute();
                this.els['mute-btn'].innerHTML = isMuted ? '🔇 消音中' : '🔊 音あり';
                this.game.state.settings.muted = isMuted;
                this.showToast(isMuted ? "ミュートにしました" : "サウンドを有効にしました");
            });
            // Set initial button text
            this.els['mute-btn'].innerHTML = this.game.state.settings.muted ? '🔇 消音中' : '🔊 音あり';
        }

        // Auto Sell Select
        if (this.els['auto-sell-select']) {
            this.els['auto-sell-select'].value = this.game.state.settings.autoSellRarity;
            this.els['auto-sell-select'].addEventListener('change', (e) => {
                this.game.state.settings.autoSellRarity = e.target.value;
                this.showToast(`自動売却設定を更新: ${e.target.value === 'none' ? 'なし' : e.target.value === 'common' ? 'コモンのみ' : 'コモン＆アンコモン'}`);
            });
        }

        // Reset button
        if (this.els['reset-btn']) {
            this.els['reset-btn'].addEventListener('click', () => {
                if (confirm("本当に最初からやり直しますか？全ての装備、強化、転生状況が完全にリセットされます。")) {
                    wipeSave();
                    window.location.reload();
                }
            });
        }

        // Transcend (Rebirth) button
        if (this.els['transcend-btn']) {
            this.els['transcend-btn'].addEventListener('click', () => {
                const crystals = Math.max(0, Math.floor(Math.pow(this.game.state.maxStage, 1.4) * (this.game.state.level / 90) - 1));
                if (crystals <= 0) {
                    this.showToast("転生に必要なレベル・ステージが不足しています！🔒", "error");
                    return;
                }
                if (confirm(`転生を実行しますか？\n獲得できる結晶: 💎${crystals}個\n※レベル、進行ステージ、スキルはリセットされますが、インベントリ内の装備品や装備中の装備は保持されます。`)) {
                    this.game.transcend();
                }
            });
        }

        // Close offline modal
        if (this.els['offline-close']) {
            this.els['offline-close'].addEventListener('click', () => {
                this.els['offline-modal'].classList.remove('active');
                gameAudio.playClick();
            });
        }

        // Global tooltips behavior: dismiss comparison on click anywhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.inventory-slot')) {
                this.selectedInventoryItem = null;
                this.hideActionMenu();
            }
        });

        // Speed Multiplier Toggles
        const speedBtns = document.querySelectorAll('.speed-btn');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseInt(btn.getAttribute('data-speed'));
                this.game.gameSpeed = speed;
                
                speedBtns.forEach(b => b.classList.toggle('active', b === btn));
                if (window.gameAudio) window.gameAudio.playClick();
                this.showToast(`戦闘速度を x${speed} 倍速にしました ⚡`);
                this.addLog(`⚡ 戦闘速度が ${speed}倍速 に変更されました。`, "#fbbf24");
            });
        });

        // Auto Equip button
        if (this.els['auto-equip-btn']) {
            this.els['auto-equip-btn'].addEventListener('click', () => {
                this.game.autoEquip();
            });
        }

        // --- AUTH EVENT LISTENERS ---
        window.addEventListener('auth-change', () => {
            this.updateAuthPanel();
        });

        // Trigger manual status check updates on sync status changes
        setInterval(() => {
            if (window.auth && window.auth.isAuthenticated()) {
                this.updateAuthPanel();
            }
        }, 5000);

        const authModal = document.getElementById('auth-modal');
        const showLoginBtn = document.getElementById('auth-show-login-btn');
        const closeAuthBtn = document.getElementById('auth-close-btn');

        if (showLoginBtn && authModal) {
            showLoginBtn.addEventListener('click', () => {
                authModal.classList.add('active');
                this.resetAuthForm();
                if (window.gameAudio) window.gameAudio.playClick();
            });
        }

        if (closeAuthBtn && authModal) {
            closeAuthBtn.addEventListener('click', () => {
                authModal.classList.remove('active');
                if (window.gameAudio) window.gameAudio.playClick();
            });
        }

        let authMode = 'login';
        const toggleModeBtn = document.getElementById('auth-toggle-mode-btn');
        const modalTitle = document.getElementById('auth-modal-title');
        const modalDesc = document.getElementById('auth-modal-desc');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleDesc = document.getElementById('auth-toggle-desc');

        if (toggleModeBtn) {
            toggleModeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.gameAudio) window.gameAudio.playClick();
                
                if (authMode === 'login') {
                    authMode = 'register';
                    modalTitle.textContent = '📝 アカウント作成';
                    modalDesc.textContent = 'ユーザー名とパスワードを入力して登録してください。';
                    submitBtn.textContent = '新規登録';
                    toggleDesc.textContent = 'すでにアカウントをお持ちですか？';
                    toggleModeBtn.textContent = 'ログイン';
                } else {
                    authMode = 'login';
                    modalTitle.textContent = '🔑 ログイン';
                    modalDesc.textContent = 'アカウント情報を入力してください。';
                    submitBtn.textContent = 'ログイン';
                    toggleDesc.textContent = 'アカウントをお持ちでないですか？';
                    toggleModeBtn.textContent = '新規登録';
                }
                document.getElementById('auth-error-msg').style.display = 'none';
            });
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                const usernameInput = document.getElementById('auth-input-username');
                const passwordInput = document.getElementById('auth-input-password');
                const errorMsg = document.getElementById('auth-error-msg');

                const username = usernameInput.value;
                const password = passwordInput.value;

                if (!username || !password) {
                    errorMsg.textContent = 'すべてのフィールドを入力してください。';
                    errorMsg.style.display = 'block';
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = authMode === 'login' ? 'ログイン中...' : '登録中...';
                errorMsg.style.display = 'none';

                try {
                    if (authMode === 'login') {
                        await window.auth.login(username, password);
                        this.showToast("ログインしました！");
                    } else {
                        await window.auth.register(username, password);
                        this.showToast("アカウントが作成されました！");
                    }
                    authModal.classList.remove('active');
                } catch (err) {
                    errorMsg.textContent = err.message || '通信エラーが発生しました。';
                    errorMsg.style.display = 'block';
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = authMode === 'login' ? 'ログイン' : '新規登録';
                }
            });
        }

        const logoutBtn = document.getElementById('auth-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('ログアウトしますか？ログアウトしてもローカルのデータはそのまま残ります。')) {
                    window.auth.logout();
                    if (window.gameAudio) window.gameAudio.playClick();
                    this.showToast('ログアウトしました');
                }
            });
        }

        const manualSyncBtn = document.getElementById('auth-manual-sync-btn');
        if (manualSyncBtn) {
            manualSyncBtn.addEventListener('click', async () => {
                if (window.auth && window.auth.isAuthenticated()) {
                    manualSyncBtn.disabled = true;
                    manualSyncBtn.textContent = '同期中...';
                    this.game.state.lastSaved = Date.now();
                    window.saveGame(this.game.state);
                    const success = await window.auth.uploadSave(this.game.state);
                    if (success) {
                        this.showToast('☁️ クラウドセーブ同期に成功しました！');
                        this.updateAuthPanel();
                    } else {
                        this.showToast('❌ 同期に失敗しました。ネットワークを確認してください。', 'error');
                    }
                    manualSyncBtn.disabled = false;
                    manualSyncBtn.textContent = '手動同期';
                }
            });
        }

        // Initial draw of auth details
        this.updateAuthPanel();
    }

    updateAuthPanel() {
        const loggedOutDiv = document.getElementById('auth-logged-out');
        const loggedInDiv = document.getElementById('auth-logged-in');
        const usernameSpan = document.getElementById('auth-username');
        const syncStatusSpan = document.getElementById('auth-sync-status');

        if (!loggedOutDiv || !loggedInDiv) return;

        if (window.auth && window.auth.isAuthenticated()) {
            loggedOutDiv.style.display = 'none';
            loggedInDiv.style.display = 'block';
            if (usernameSpan) usernameSpan.textContent = window.auth.getUsername();
            if (syncStatusSpan) {
                const lastSync = window.auth.lastCloudSyncTime;
                if (lastSync > 0) {
                    syncStatusSpan.innerHTML = `☁️ 同期完了 (${new Date(lastSync).toLocaleTimeString()})`;
                    syncStatusSpan.style.color = '#4ade80';
                } else {
                    syncStatusSpan.innerHTML = `☁️ 同期中...`;
                    syncStatusSpan.style.color = '#38bdf8';
                }
            }
        } else {
            loggedOutDiv.style.display = 'block';
            loggedInDiv.style.display = 'none';
        }
    }

    resetAuthForm() {
        const usernameInput = document.getElementById('auth-input-username');
        const passwordInput = document.getElementById('auth-input-password');
        const errorMsg = document.getElementById('auth-error-msg');
        
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (errorMsg) {
            errorMsg.style.display = 'none';
            errorMsg.textContent = '';
        }
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        gameAudio.playClick();

        this.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });

        this.tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });

        // Trigger updates specific to tab
        if (tabName === 'inventory') {
            this.renderInventory();
        } else if (tabName === 'skills') {
            this.renderSkills();
        } else if (tabName === 'forge') {
            this.renderForge();
        } else if (tabName === 'transcend') {
            this.renderTranscend();
        } else if (tabName === 'stats') {
            this.renderStatsTab();
        }
    }

    renderAll() {
        this.renderStats();
        this.renderBattleHP();
        this.renderEquipped();
        this.renderInventory();
        this.renderSkills();
        this.renderForge();
        this.renderTranscend();
        this.renderStatsTab();
    }

    renderStats() {
        // Currencies
        if (this.els['gold-display']) this.els['gold-display'].innerHTML = `🪙 ${this.game.state.gold.toLocaleString()}`;
        if (this.els['scrap-display']) this.els['scrap-display'].innerHTML = `🔥 ${this.game.state.scrap}`;
        if (this.els['crystals-display']) this.els['crystals-display'].innerHTML = `💎 ${this.game.state.crystals}`;

        // Top progress bar and labels
        if (this.els['player-level']) this.els['player-level'].innerHTML = `Lv.${this.game.state.level}`;
        
        // Progress stage name
        const stageThemes = ["囁きの森林", "輝く鍾乳洞", "琥珀の古城跡", "熱砂の荒野", "天空の回廊", "果てなき奈落"];
        const themeIndex = Math.min(Math.floor((this.game.state.stage - 1) / 3), stageThemes.length - 1);
        if (this.els['stage-name']) {
            this.els['stage-name'].innerHTML = `第 ${this.game.state.stage} 関門 : ${stageThemes[themeIndex]}`;
        }
        if (this.els['stage-wave-text']) {
            this.els['stage-wave-text'].innerHTML = `Wave ${this.game.state.wave}/10`;
        }

        // Exp bar
        const expRequired = this.game.getExpRequired();
        const expPct = Math.min(100, (this.game.state.exp / expRequired) * 100);
        const expBar = document.getElementById('player-exp-bar');
        const expText = document.getElementById('player-exp-text');
        if (expBar) expBar.style.width = `${expPct}%`;
        if (expText) expText.innerHTML = `EXP: ${this.game.state.exp} / ${expRequired} (${expPct.toFixed(1)}%)`;

        // Update transcendence buttons state
        if (this.els['transcend-btn']) {
            const crystals = Math.max(0, Math.floor(Math.pow(this.game.state.maxStage, 1.4) * (this.game.state.level / 90) - 1));
            this.els['transcend-btn'].innerHTML = `🪐 魂の転生を実行する (結晶 +💎${crystals})`;
            this.els['transcend-btn'].classList.toggle('disabled', crystals <= 0);
        }
    }

    renderBattleHP() {
        const pPct = Math.max(0, (this.game.playerHP / this.game.playerMaxHP) * 100);
        if (this.els['player-hp-bar']) this.els['player-hp-bar'].style.width = `${pPct}%`;
        if (this.els['player-hp-text']) this.els['player-hp-text'].innerHTML = `${this.game.playerHP} / ${this.game.playerMaxHP}`;

        if (this.game.enemy) {
            const ePct = Math.max(0, (this.game.enemyHP / this.game.enemyMaxHP) * 100);
            if (this.els['enemy-hp-bar']) this.els['enemy-hp-bar'].style.width = `${ePct}%`;
            if (this.els['enemy-hp-text']) this.els['enemy-hp-text'].innerHTML = `${this.game.enemyHP} / ${this.game.enemyMaxHP}`;
        }
    }

    updateGauges(pG, eG) {
        if (this.els['player-gauge-bar']) this.els['player-gauge-bar'].style.width = `${pG}%`;
        if (this.els['enemy-gauge-bar']) this.els['enemy-gauge-bar'].style.width = `${eG}%`;
    }

    renderEnemyCard() {
        if (!this.game.enemy) return;
        if (this.els['enemy-name']) {
            this.els['enemy-name'].innerHTML = this.game.enemy.name;
            this.els['enemy-name'].style.color = this.game.enemy.color;
        }
        
        // Add boss class to card
        if (this.els['enemy-card']) {
            this.els['enemy-card'].classList.toggle('boss-card', this.game.enemy.isBoss);
        }

        // Render Enemy CP
        const enemyCP = this.game.calculateEnemyCP();
        if (this.els['enemy-cp']) {
            this.els['enemy-cp'].innerHTML = `戦闘力: ${enemyCP.toLocaleString()}`;
        }

        this.renderBattleHP();
    }

    // Static character attributes display
    renderStats() {
        // Redefined inside to avoid double definitions
        // Currencies
        if (this.els['gold-display']) this.els['gold-display'].innerHTML = `🪙 ${this.game.state.gold.toLocaleString()}`;
        if (this.els['scrap-display']) this.els['scrap-display'].innerHTML = `🔥 ${this.game.state.scrap}`;
        if (this.els['crystals-display']) this.els['crystals-display'].innerHTML = `💎 ${this.game.state.crystals}`;

        // Top progress bar and labels
        if (this.els['player-level']) this.els['player-level'].innerHTML = `Lv.${this.game.state.level}`;
        
        // Progress stage name
        const stageThemes = ["囁きの森林", "輝く鍾乳洞", "琥珀の古城跡", "熱砂の荒野", "天空の回廊", "果てなき奈落"];
        const themeIndex = Math.min(Math.floor((this.game.state.stage - 1) / 3), stageThemes.length - 1);
        if (this.els['stage-name']) {
            this.els['stage-name'].innerHTML = `第 ${this.game.state.stage} 関門 : ${stageThemes[themeIndex]}`;
        }
        if (this.els['stage-wave-text']) {
            this.els['stage-wave-text'].innerHTML = `Wave ${this.game.state.wave}/10`;
        }

        // Exp bar
        const expRequired = this.game.getExpRequired();
        const expPct = Math.min(100, (this.game.state.exp / expRequired) * 100);
        const expBar = document.getElementById('player-exp-bar');
        const expText = document.getElementById('player-exp-text');
        if (expBar) expBar.style.width = `${expPct}%`;
        if (expText) expText.innerHTML = `EXP: ${this.game.state.exp} / ${expRequired} (${expPct.toFixed(1)}%)`;

        // Update transcendence buttons state
        if (this.els['transcend-btn']) {
            const crystals = Math.max(0, Math.floor(Math.pow(this.game.state.maxStage, 1.4) * (this.game.state.level / 90) - 1));
            this.els['transcend-btn'].innerHTML = `🪐 魂の転生を実行する (結晶 +💎${crystals})`;
            this.els['transcend-btn'].classList.toggle('disabled', crystals <= 0);
        }

        // Detailed Stats Panel in Left Side
        const statIds = ['stat-val-atk', 'stat-val-def', 'stat-val-hp', 'stat-val-speed', 'stat-val-crit', 'stat-val-critdmg', 'stat-val-lifesteal', 'stat-val-mf'];
        const values = [
            this.game.playerStats.atk,
            this.game.playerStats.def,
            this.game.playerStats.maxHp,
            `${Math.round(this.game.playerStats.speed * 100)}%`,
            `${this.game.playerStats.critRate}%`,
            `${this.game.playerStats.critDmg}%`,
            `${this.game.playerStats.lifesteal}%`,
            `+${this.game.playerStats.magicFind}%`
        ];

        statIds.forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = values[index];
        });

        // Render Player CP (Combat Power) on card
        const playerCP = this.game.calculatePlayerCP();
        if (this.els['player-cp']) {
            this.els['player-cp'].innerHTML = `戦闘力: ${playerCP.toLocaleString()}`;
        }
    }

    renderEquipped() {
        const slots = ['weapon', 'armor', 'shield', 'ring', 'amulet'];
        slots.forEach(slot => {
            const item = this.game.state.equipped[slot];
            const slotEl = document.getElementById(`slot-${slot}`);
            if (!slotEl) return;

            slotEl.innerHTML = "";
            slotEl.className = `equip-slot-card empty rarity-none`;

            if (item) {
                slotEl.className = `equip-slot-card rarity-${item.rarity}`;
                slotEl.innerHTML = `
                    <div class="equipped-item-icon">${this.getItemIcon(item.type)}</div>
                    <div class="equipped-item-info">
                        <span class="eq-item-name">${item.enhancement > 0 ? `+${item.enhancement} ` : ''}${item.name}</span>
                        <span class="eq-item-sub">Lv.${item.level} ${ITEM_TYPES[item.type].name}</span>
                    </div>
                    <button class="unequip-btn" data-slot="${slot}">外す</button>
                `;

                // Add comparison hover listener
                slotEl.addEventListener('mouseenter', (e) => {
                    this.showTooltip(item, null, e);
                });
                slotEl.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });

                // Unequip handler
                const btn = slotEl.querySelector('.unequip-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.hideTooltip();
                        this.game.unequipItem(slot);
                    });
                }
            } else {
                slotEl.innerHTML = `
                    <div class="equipped-item-icon empty-icon">➕</div>
                    <div class="equipped-item-info">
                        <span class="eq-item-name empty-placeholder">${ITEM_TYPES[slot].name}未装備</span>
                    </div>
                `;
            }
        });
    }

    renderInventory() {
        if (!this.els['inventory-grid']) return;
        this.els['inventory-grid'].innerHTML = "";
        
        const inv = this.game.state.inventory;
        if (this.els['inventory-count']) {
            this.els['inventory-count'].innerHTML = `${inv.length} / ${this.game.state.inventoryMax}`;
        }

        // Append slots
        for (let i = 0; i < this.game.state.inventoryMax; i++) {
            const item = inv[i];
            const slot = document.createElement('div');
            slot.className = "inventory-slot";

            if (item) {
                slot.className = `inventory-slot active rarity-${item.rarity}`;
                slot.innerHTML = `
                    <div class="inv-icon">${this.getItemIcon(item.type)}</div>
                    ${item.enhancement > 0 ? `<div class="inv-enhance">+${item.enhancement}</div>` : ''}
                    <div class="inv-level">L${item.level}</div>
                `;

                // Hover comparative tooltip
                const equippedItem = this.game.state.equipped[item.type];
                slot.addEventListener('mouseenter', (e) => {
                    this.showTooltip(item, equippedItem, e);
                });
                slot.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });

                // Click action menu popup
                slot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedInventoryItem = item;
                    this.showActionMenu(slot, item);
                });
            } else {
                slot.innerHTML = "";
            }

            this.els['inventory-grid'].appendChild(slot);
        }

        // Set up bulk action event listeners
        const bulkCommon = document.getElementById('bulk-salvage-common');
        const bulkUncommon = document.getElementById('bulk-salvage-uncommon');
        const bulkRare = document.getElementById('bulk-salvage-rare');

        if (bulkCommon && !bulkCommon.dataset.listened) {
            bulkCommon.dataset.listened = "true";
            bulkCommon.addEventListener('click', () => {
                if (confirm("コモン(白色)の装備を一括分解しますか？")) {
                    this.game.bulkSalvage('common');
                }
            });
        }
        if (bulkUncommon && !bulkUncommon.dataset.listened) {
            bulkUncommon.dataset.listened = "true";
            bulkUncommon.addEventListener('click', () => {
                if (confirm("コモンとアンコモン(緑色)の装備を一括分解しますか？")) {
                    this.game.bulkSalvage('uncommon');
                }
            });
        }
        if (bulkRare && !bulkRare.dataset.listened) {
            bulkRare.dataset.listened = "true";
            bulkRare.addEventListener('click', () => {
                if (confirm("レア(青色)以下の装備を一括分解しますか？\n※エピック以上は保護されます。")) {
                    this.game.bulkSalvage('rare');
                }
            });
        }
    }

    getItemIcon(type) {
        const icons = {
            weapon: "⚔️",
            armor: "👕",
            shield: "🛡️",
            ring: "💍",
            amulet: "📿"
        };
        return icons[type] || "❓";
    }

    showActionMenu(slotEl, item) {
        this.hideActionMenu();

        // Create elegant floating context menu next to the slot
        const menu = document.createElement('div');
        menu.id = "inventory-action-menu";
        menu.className = "action-menu-popup";
        
        menu.innerHTML = `
            <button class="menu-action-btn equip-act">装備する ⚔️</button>
            <button class="menu-action-btn upgrade-act">強化の素材にする 🛠️</button>
            <button class="menu-action-btn scrap-act">分解する (🔥+${item.scrapValue})</button>
            <button class="menu-action-btn sell-act">売却する (🪙+${item.goldValue})</button>
        `;

        document.body.appendChild(menu);

        // Position it nicely
        const rect = slotEl.getBoundingClientRect();
        menu.style.top = `${rect.top + window.scrollY - 100}px`;
        menu.style.left = `${rect.left + window.scrollX + 50}px`;

        // Event hooks
        menu.querySelector('.equip-act').addEventListener('click', () => {
            this.game.equipItem(item);
            this.hideActionMenu();
        });

        menu.querySelector('.upgrade-act').addEventListener('click', () => {
            this.switchTab('forge');
            this.setForgeItem(item);
            this.hideActionMenu();
        });

        menu.querySelector('.scrap-act').addEventListener('click', () => {
            this.game.scrapItem(item);
            this.hideActionMenu();
            this.hideTooltip();
        });

        menu.querySelector('.sell-act').addEventListener('click', () => {
            this.game.sellItem(item);
            this.hideActionMenu();
            this.hideTooltip();
        });
    }

    hideActionMenu() {
        const oldMenu = document.getElementById('inventory-action-menu');
        if (oldMenu) oldMenu.remove();
    }

    showTooltip(item, equippedItem, event) {
        this.hideTooltip();

        const tooltipHtml = getCompareTooltip(item, equippedItem);
        const tooltip = document.createElement('div');
        tooltip.id = "global-tooltip-container";
        tooltip.innerHTML = tooltipHtml;
        document.body.appendChild(tooltip);

        // Position tooltip
        const updatePosition = (e) => {
            const tip = document.getElementById('global-tooltip-container');
            if (!tip) return;
            
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            const tipWidth = tip.offsetWidth;
            const tipHeight = tip.offsetHeight;
            
            let posX = mouseX + 15;
            let posY = mouseY + 15;

            // Prevent going out of window bounds
            if (posX + tipWidth > window.innerWidth) {
                posX = mouseX - tipWidth - 15;
            }
            if (posY + tipHeight > window.innerHeight) {
                posY = window.innerHeight - tipHeight - 15;
            }

            tip.style.left = `${posX + window.scrollX}px`;
            tip.style.top = `${posY + window.scrollY}px`;
        };

        updatePosition(event);
        this.hoveredTooltipEl = tooltip;
    }

    hideTooltip() {
        const tooltip = document.getElementById('global-tooltip-container');
        if (tooltip) tooltip.remove();
        this.hoveredTooltipEl = null;
    }

    // Interactive Skill Tree tab
    renderSkills() {
        if (!this.els['skills-grid']) return;
        this.els['skills-grid'].innerHTML = "";

        if (this.els['skill-points']) {
            this.els['skill-points'].innerHTML = `利用可能なスキルポイント: <span class="sp-highlight">${this.game.state.skillPoints}</span>`;
        }

        // Layout skill tree as beautifully styled panels
        Object.entries(SKILL_TREE).forEach(([skillId, skill]) => {
            const currentLevel = this.game.state.skills[skillId] || 0;
            const unlocked = isSkillUnlocked(skillId, this.game.state.skills);
            
            const card = document.createElement('div');
            card.className = `skill-node-card ${unlocked ? 'unlocked' : 'locked'} ${currentLevel >= skill.maxLevel ? 'maxed' : ''}`;
            
            // Generate requirements string
            let reqs = "";
            if (skill.dependencies.length > 0) {
                reqs = "必要: " + skill.dependencies.map(d => {
                    const parentSkill = SKILL_TREE[d.id];
                    return `${parentSkill.name} Lv.${d.minLevel}`;
                }).join(", ");
            }

            const isPct = skill.effectType === "flat_pct";
            const valPerLvl = skill.effectPerLevel;
            const currentBonus = currentLevel * valPerLvl;
            const effectDesc = isPct ? `現在: +${currentBonus}%` : `現在: +${Math.round(currentBonus * 100)}%`;

            card.innerHTML = `
                <div class="skill-icon">${skill.icon}</div>
                <div class="skill-main">
                    <span class="skill-name">${skill.name}</span>
                    <span class="skill-level">${currentLevel} / ${skill.maxLevel}</span>
                    <p class="skill-desc">${skill.desc}</p>
                    ${currentLevel > 0 ? `<p class="skill-bonus-active">${effectDesc}</p>` : ''}
                    ${!unlocked ? `<p class="skill-reqs">${reqs}</p>` : ''}
                </div>
                <button class="upgrade-skill-btn" ${(!unlocked || this.game.state.skillPoints <= 0 || currentLevel >= skill.maxLevel) ? 'disabled' : ''}>
                    ${currentLevel >= skill.maxLevel ? '最大' : '習得'}
                </button>
            `;

            this.els['skills-grid'].appendChild(card);

            // Click listener for upgrading skill
            const btn = card.querySelector('.upgrade-skill-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (this.game.state.skillPoints > 0 && currentLevel < skill.maxLevel) {
                        this.game.state.skills[skillId]++;
                        this.game.state.skillPoints--;
                        gameAudio.playClick();
                        this.game.recalculatePlayerStats();
                        this.renderSkills();
                        this.renderStats();
                        this.showToast(`${skill.name} のレベルを上げました！🌟`);
                    }
                });
            }
        });
    }

    // Forge tab: Item enhancement and crafting
    setForgeItem(item) {
        this.selectedForgeItem = item;
        this.renderForge();
    }

    renderForge() {
        if (!this.els['forge-upgrade-card']) return;
        const upgradeCard = this.els['forge-upgrade-card'];
        
        upgradeCard.innerHTML = "";

        if (this.selectedForgeItem) {
            const item = this.selectedForgeItem;
            // Verify if still in inventory (could have been sold/scrapped)
            const exists = this.game.state.inventory.find(i => i.id === item.id);
            if (!exists) {
                this.selectedForgeItem = null;
                this.renderForge();
                return;
            }

            const { scrapCost, goldCost } = getUpgradeCost(item);
            const canAfford = this.game.state.scrap >= scrapCost && this.game.state.gold >= goldCost;
            const maxed = item.enhancement >= MAX_ENHANCEMENT;

            let statsHtml = "";
            const flatStats = ['atk', 'def', 'hp'];
            Object.keys(item.stats).forEach(stat => {
                const val = item.stats[stat];
                const baseVal = item.baseStats[stat];
                const isPct = !flatStats.includes(stat);
                
                // Show next potential stats
                const nextVal = baseVal * (1 + 0.15 * (item.enhancement + 1));
                const nextValStr = isPct ? `${nextVal.toFixed(1)}%` : Math.round(nextVal);
                const curValStr = isPct ? `${val}%` : val;

                statsHtml += `
                    <div class="forge-stat-row">
                        <span>${getStatName(stat)}</span>
                        <span>${curValStr} ➡️ <span class="stat-better">+${nextValStr}</span></span>
                    </div>
                `;
            });

            upgradeCard.innerHTML = `
                <div class="forge-item-preview rarity-${item.rarity}">
                    <span class="forge-item-name">${item.enhancement > 0 ? `+${item.enhancement} ` : ''}${item.name}</span>
                    <span class="forge-item-sub">Lv.${item.level} ${ITEM_TYPES[item.type].name} | レアリティ: <b style="color:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].name}</b></span>
                </div>
                <div class="forge-stats-comparison">
                    <p class="forge-section-title">強化プレビュー (+15% 基礎能力値上昇)</p>
                    ${statsHtml}
                </div>
                <div class="forge-costs">
                    <div class="forge-cost-row">
                        <span>必要ゴールド:</span>
                        <span class="${this.game.state.gold >= goldCost ? 'text-ok' : 'text-poor'}">🪙 ${goldCost.toLocaleString()} / ${this.game.state.gold.toLocaleString()}</span>
                    </div>
                    <div class="forge-cost-row">
                        <span>必要残り火の破片:</span>
                        <span class="${this.game.state.scrap >= scrapCost ? 'text-ok' : 'text-poor'}">🔥 ${scrapCost} / ${this.game.state.scrap}</span>
                    </div>
                </div>
                <div class="forge-actions">
                    <button id="forge-upgrade-btn" class="forge-main-btn" ${(!canAfford || maxed) ? 'disabled' : ''}>
                        ${maxed ? '最大強化済み' : '装備を強化する 🛠️'}
                    </button>
                    <button id="forge-clear-btn" class="forge-sec-btn">外す</button>
                </div>
            `;

            // Action hooks
            const upgradeBtn = document.getElementById('forge-upgrade-btn');
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', () => {
                    const res = upgradeItem(item, this.game.state.scrap, this.game.state.gold);
                    if (res.success) {
                        this.game.state.scrap -= res.scrapCost;
                        this.game.state.gold -= res.goldCost;
                        this.game.state.stats.totalScrap += res.scrapCost; // track spending actually count as scrap processed
                        
                        gameAudio.playLevelUp(); // Retro chime
                        this.game.recalculatePlayerStats();
                        this.renderForge();
                        this.renderStats();
                        this.renderInventory();
                        this.renderEquipped();
                        this.showToast(`装備の強化に成功しました！ (+${item.enhancement}) 🛠️`);
                    } else {
                        this.showToast(res.reason, "error");
                    }
                });
            }

            const clearBtn = document.getElementById('forge-clear-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    this.selectedForgeItem = null;
                    this.renderForge();
                });
            }

        } else {
            upgradeCard.innerHTML = `
                <div class="forge-empty-state">
                    <p class="forge-empty-prompt">🎒 インベントリから強化したい装備を選択し、<br>「強化の素材にする」をクリックしてください。</p>
                </div>
            `;
        }

        // Craft grid rendering
        if (this.els['forge-craft-grid']) {
            this.els['forge-craft-grid'].innerHTML = "";
            
            Object.entries(CRAFT_TIERS).forEach(([tierKey, tier]) => {
                const canAfford = this.game.state.scrap >= tier.scrapCost && this.game.state.gold >= tier.goldCost;
                
                const card = document.createElement('div');
                card.className = `craft-node-card ${canAfford ? 'craft-affordable' : ''}`;
                
                card.innerHTML = `
                    <div class="craft-details">
                        <span class="craft-title">${tier.name}</span>
                        <p class="craft-desc">${tier.desc}</p>
                    </div>
                    <div class="craft-cost-box">
                        <span class="cost-item ${this.game.state.gold >= tier.goldCost ? '' : 'insufficient'}">🪙 ${tier.goldCost.toLocaleString()}</span>
                        <span class="cost-item ${this.game.state.scrap >= tier.scrapCost ? '' : 'insufficient'}">🔥 ${tier.scrapCost}</span>
                    </div>
                    <button class="craft-btn" ${(!canAfford || this.game.state.inventory.length >= this.game.state.inventoryMax) ? 'disabled' : ''}>
                        作成
                    </button>
                `;

                this.els['forge-craft-grid'].appendChild(card);

                // Craft action trigger
                const btn = card.querySelector('.craft-btn');
                if (btn) {
                    btn.addEventListener('click', () => {
                        const res = craftItem(this.game.state.stage, tierKey, this.game.state.scrap, this.game.state.gold, this.game.playerStats.magicFind);
                        if (res.success) {
                            this.game.state.scrap -= res.scrapCost;
                            this.game.state.gold -= res.goldCost;
                            this.game.state.inventory.push(res.item);
                            
                            gameAudio.playLootDrop(res.item.rarity);
                            this.game.recalculatePlayerStats();
                            this.renderForge();
                            this.renderStats();
                            this.renderInventory();
                            
                            const rColor = this.game.getRarityColor(res.item.rarity);
                            this.addLog(`🛠️ 鍛冶屋クラフト: **[${res.item.name}]** (Lv.${res.item.level}) を鋳造しました！`, rColor);
                            this.showToast(`クラフト成功: ${res.item.name} 💎`);
                        } else {
                            this.showToast(res.reason, "error");
                        }
                    });
                }
            });
        }
    }

    // Transcend permanent upgrade panel
    renderTranscend() {
        if (!this.els['transcend-shop']) return;
        this.els['transcend-shop'].innerHTML = "";

        if (this.els['transcend-crystals']) {
            this.els['transcend-crystals'].innerHTML = `保有中のエーテル結晶: <span class="crystal-highlight">💎 ${this.game.state.crystals}</span>`;
        }

        const upgrades = [
            {
                key: "statsBoost",
                name: "星辰の加護",
                desc: "全ステータス（HP、攻撃力、防御力）が恒久的に +30% 上昇する。",
                costFormula: (lvl) => Math.round(Math.pow(2, lvl)),
                icon: "🌌"
            },
            {
                key: "goldBoost",
                name: "豊穣のルーン",
                desc: "戦闘で獲得できるゴールドが恒久的に +40% 上昇する。",
                costFormula: (lvl) => Math.round(Math.pow(2, lvl)),
                icon: "💰"
            },
            {
                key: "expBoost",
                name: "叡智のスクロール",
                desc: "獲得できる経験値が恒久的に +40% 上昇する。",
                costFormula: (lvl) => Math.round(Math.pow(2, lvl)),
                icon: "📜"
            },
            {
                key: "dropBoost",
                name: "幸運の彗星",
                desc: "魔法発見力（Magic Find）が +25% 上昇し、高レア装備が出現しやすくなる。",
                costFormula: (lvl) => Math.round(Math.pow(2.2, lvl)),
                icon: "☄️"
            }
        ];

        upgrades.forEach(upg => {
            const currentLevel = this.game.state.transcendenceUpgrades[upg.key] || 0;
            const cost = upg.costFormula(currentLevel);
            const canAfford = this.game.state.crystals >= cost;
            
            let valText = "";
            if (upg.key === "statsBoost") valText = `現在: +${currentLevel * 30}%`;
            else if (upg.key === "goldBoost") valText = `現在: +${currentLevel * 40}%`;
            else if (upg.key === "expBoost") valText = `現在: +${currentLevel * 40}%`;
            else if (upg.key === "dropBoost") valText = `現在: +${currentLevel * 25}% Magic Find`;

            const card = document.createElement('div');
            card.className = `transcend-node-card ${canAfford ? 'transcend-affordable' : ''}`;
            
            card.innerHTML = `
                <div class="transcend-icon">${upg.icon}</div>
                <div class="transcend-main">
                    <span class="transcend-title">${upg.name} (Lv.${currentLevel})</span>
                    <p class="transcend-desc">${upg.desc}</p>
                    <span class="transcend-val">${valText}</span>
                </div>
                <button class="transcend-buy-btn" ${!canAfford ? 'disabled' : ''}>
                    購入 💎 ${cost}
                </button>
            `;

            this.els['transcend-shop'].appendChild(card);

            // Click listener
            const btn = card.querySelector('.transcend-buy-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (this.game.state.crystals >= cost) {
                        this.game.state.crystals -= cost;
                        this.game.state.transcendenceUpgrades[upg.key]++;
                        
                        gameAudio.playTranscend();
                        this.game.recalculatePlayerStats();
                        this.renderTranscend();
                        this.renderStats();
                        this.showToast(`${upg.name} を強化しました！ 🌌`);
                    }
                });
            }
        });
    }

    renderStatsTab() {
        const stats = this.game.state.stats;
        
        // Calculate played duration
        const playedHours = Math.floor(stats.timePlayed / 3600);
        const playedMins = Math.floor((stats.timePlayed % 3600) / 60);
        const playedSecs = Math.floor(stats.timePlayed % 60);
        const playedStr = `${playedHours}時間 ${playedMins}分 ${playedSecs}秒`;

        if (this.els['stat-kills']) this.els['stat-kills'].innerHTML = stats.kills.toLocaleString();
        if (this.els['stat-boss-kills']) this.els['stat-boss-kills'].innerHTML = this.game.state.maxStage.toLocaleString(); // Boss kills roughly corresponds to max stage reached
        if (this.els['stat-total-gold']) this.els['stat-total-gold'].innerHTML = `🪙 ${stats.totalGold.toLocaleString()}`;
        if (this.els['stat-total-scrap']) this.els['stat-total-scrap'].innerHTML = `🔥 ${stats.totalScrap.toLocaleString()}`;
        if (this.els['stat-total-crystals']) this.els['stat-total-crystals'].innerHTML = `💎 ${stats.totalCrystals.toLocaleString()}`;
        if (this.els['stat-time-played']) this.els['stat-time-played'].innerHTML = playedStr;
    }

    showOfflineModal(data) {
        if (!this.els['offline-modal']) return;
        
        if (this.els['offline-duration']) this.els['offline-duration'].innerHTML = `${data.hours}時間 ${data.mins}分 ${data.secs}秒`;
        if (this.els['offline-battles']) this.els['offline-battles'].innerHTML = data.battles.toLocaleString();
        if (this.els['offline-gold']) this.els['offline-gold'].innerHTML = `🪙 ${data.gold.toLocaleString()}`;
        if (this.els['offline-exp']) this.els['offline-exp'].innerHTML = data.exp.toLocaleString();
        if (this.els['offline-items']) this.els['offline-items'].innerHTML = `${data.items} 個`;

        this.els['offline-modal'].classList.add('active');
    }

    // Scroll combat logs
    addLog(text, color = "#e2e8f0") {
        if (!this.els['combat-logs']) return;
        const logs = this.els['combat-logs'];
        
        const logEntry = document.createElement('div');
        logEntry.className = "log-entry";
        logEntry.style.color = color;
        logEntry.innerHTML = text;

        logs.appendChild(logEntry);

        // Keep last 100 entries to prevent DOM bloating and memory issues
        while (logs.children.length > 100) {
            logs.removeChild(logs.firstChild);
        }

        // Auto scroll to bottom
        logs.scrollTop = logs.scrollHeight;
    }

    // Trigger visual shake/bump animations on cards during combat hits
    animateCard(side) {
        const card = side === 'player' ? this.els['player-card'] : this.els['enemy-card'];
        if (!card) return;

        // Reset classes
        card.classList.remove('shake-horizontal', 'bump-attack');
        // Force reflow
        void card.offsetWidth;

        // Apply visual bump/shake classes
        if (side === 'player') {
            card.classList.add('bump-attack-player');
            setTimeout(() => card.classList.remove('bump-attack-player'), 200);
        } else {
            card.classList.add('bump-attack-enemy');
            setTimeout(() => card.classList.remove('bump-attack-enemy'), 200);
        }
    }

    triggerCritFlash() {
        const arena = this.els['battle-arena'];
        if (!arena) return;
        
        arena.classList.add('crit-flash');
        setTimeout(() => arena.classList.remove('crit-flash'), 150);
    }

    // Create 3D-like float text popups above character cards
    createFloatingNumber(val, side, isCrit, isHeal) {
        const card = side === 'player' ? this.els['player-card'] : this.els['enemy-card'];
        if (!card) return;

        const floatText = document.createElement('div');
        floatText.className = "floating-num";
        
        if (isHeal) {
            floatText.className += " heal-num";
            floatText.innerHTML = `+${val}`;
        } else if (isCrit) {
            floatText.className += " crit-num";
            floatText.innerHTML = `${val}💥`;
        } else {
            floatText.className += " damage-num";
            floatText.innerHTML = `-${val}`;
        }

        // Random offset slightly to the sides for gorgeous look
        const randomOffset = Math.floor(Math.random() * 60) - 30; // -30px to +30px
        floatText.style.left = `calc(50% + ${randomOffset}px)`;
        floatText.style.top = `20%`;

        card.appendChild(floatText);

        // Remove from DOM when animation completes
        setTimeout(() => {
            floatText.remove();
        }, 1100);
    }

    createClickRipple(event) {
        const arena = this.els['battle-arena'];
        if (!arena) return;

        const ripple = document.createElement('div');
        ripple.className = "click-ripple-bubble";
        
        const rect = arena.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        arena.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // Create simple nice bubble toast messages
    showToast(message, type = "info") {
        const toast = document.createElement('div');
        toast.className = `floating-toast ${type === 'error' ? 'toast-err' : ''}`;
        toast.innerHTML = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 2200);
    }

    renderLevelUpEffects() {
        const pCard = this.els['player-card'];
        if (!pCard) return;

        const lvlUpText = document.createElement('div');
        lvlUpText.className = "lvl-up-flash";
        lvlUpText.innerHTML = "LEVEL UP! 🌟";
        pCard.appendChild(lvlUpText);

        setTimeout(() => {
            lvlUpText.remove();
        }, 1800);
    }
}

window.GameUI = GameUI;
