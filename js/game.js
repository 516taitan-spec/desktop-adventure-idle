// Core Game Engine and Progression Logic
// Manages combat loop, background calculations, level progression, and stats scaling.

class IdleGame {
    constructor() {
        this.state = loadGame();
        
        // Fix: update lastSaved after load so offline timer is anchored correctly
        // (Only update if freshly loaded — keep the original timestamp for offline calc)
        this._loadTimestamp = Date.now();
        
        // Active battle states
        this.playerHP = 100;
        this.playerMaxHP = 100;
        this.playerGauge = 0; // 0 to 100
        
        this.enemy = null;
        this.enemyHP = 0;
        this.enemyMaxHP = 0;
        this.enemyGauge = 0;
        
        this.playerStats = {};
        this.calculatedMultipliers = {};
        
        // Loop controls
        this.lastTick = Date.now();
        this.saveTimer = 0;
        this.gameSpeed = 1; // x1, x2, x3 speed
        
        // UI Bridge
        this.ui = null;
        
        this.initGame();
    }

    setUI(uiInstance) {
        this.ui = uiInstance;
        // Trigger initial render
        this.recalculatePlayerStats();
        this.spawnEnemy();
        this.healPlayer();
        this.processOfflineProgress();
        // NOW write fresh lastSaved — after offline progress has been calculated
        saveGame(this.state);
    }

    initGame() {
        this.recalculatePlayerStats();
        
        // Load settings to Audio
        gameAudio.muted = this.state.settings.muted;
        
        // Start auto-save timer (initial save is done in setUI after offline progress)
        this.saveInterval = setInterval(() => {
            saveGame(this.state);
            if (this.ui) this.ui.showToast("オートセーブ完了 💾");
        }, 15000); // Save every 15 seconds
    }

    initFromState() {
        // Clear old auto-save interval to prevent duplicates
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
        }
        
        // Re-run initialization
        this.initGame();
        
        // Reset combat state
        this.spawnEnemy();
        this.healPlayer();
        
        // Re-render UI
        if (this.ui) {
            this.ui.renderAll();
        }
    }

    // Process offline idle progression
    processOfflineProgress() {
        const now = Date.now();
        const timeDiffSec = (now - this.state.lastSaved) / 1000;
        
        if (timeDiffSec > 30) { // More than 30 seconds offline
            const hours = Math.floor(timeDiffSec / 3600);
            const mins = Math.floor((timeDiffSec % 3600) / 60);
            const secs = Math.floor(timeDiffSec % 60);
            
            // Limit offline progress simulation time to max 12 hours to prevent performance crash
            const simTime = Math.min(timeDiffSec, 12 * 3600);
            
            // Calculate approximate kills per minute
            // A battle takes average time: (PlayerHP / EnemyDps) and (EnemyHP / PlayerDps)
            const pDps = (this.playerStats.atk - 2) * (this.playerStats.speed || 1.0);
            const eDps = (10) * 0.9;
            
            // Simple robust estimation of offline progress
            const battleTimeSec = Math.max(2, this.enemyMaxHP / Math.max(1, pDps) + 1);
            const totalSimulatedBattles = Math.floor(simTime / battleTimeSec);
            
            if (totalSimulatedBattles > 0) {
                // Scaling parameters
                const stageScale = Math.pow(1.20, this.state.stage - 1) * (1 + 0.12 * this.state.wave);
                const expPerKill = Math.round(12 * stageScale * this.calculatedMultipliers.expMult);   // matches online reward
                const goldPerKill = Math.round(18 * stageScale * this.calculatedMultipliers.goldMult); // matches online reward
                
                const earnedExp = totalSimulatedBattles * expPerKill;
                const earnedGold = totalSimulatedBattles * goldPerKill;
                
                // Add resources
                this.state.gold += earnedGold;
                this.state.stats.totalGold += earnedGold;
                this.gainExp(earnedExp);
                this.state.stats.kills += totalSimulatedBattles;
                
                // Roll offline items! Max 10 items to prevent inventory overflow
                let itemsDropped = 0;
                let details = [];
                for (let i = 0; i < Math.min(totalSimulatedBattles, 100); i++) {
                    if (Math.random() < 0.12) { // 12% drop rate for offline
                        if (this.state.inventory.length < this.state.inventoryMax) {
                            const item = generateItem(this.state.stage, this.playerStats.magicFind);
                            
                            // Check auto sell
                            if (this.shouldAutoSell(item)) {
                                const goldGained = item.goldValue;
                                this.state.gold += goldGained;
                            } else {
                                this.state.inventory.push(item);
                                if (item.rarity === 'legendary' || item.rarity === 'ethereal') {
                                    this.state.stats.legendariesFound++;
                                }
                                itemsDropped++;
                            }
                        }
                    }
                }
                
                if (this.ui) {
                    this.ui.showOfflineModal({
                        hours, mins, secs,
                        battles: totalSimulatedBattles,
                        gold: earnedGold,
                        exp: earnedExp,
                        items: itemsDropped
                    });
                    this.ui.addLog(`💤 放置中（${hours}時間${mins}分）に敵を${totalSimulatedBattles}体撃破！`, "#a855f7");
                    this.ui.addLog(`💰 🪙${earnedGold.toLocaleString()} ゴールドと ✨${earnedExp} 経験値を獲得。`, "#f59e0b");
                }
            }
        }
    }

    shouldAutoSell(item) {
        const autoSell = this.state.settings.autoSellRarity;
        if (autoSell === 'common' && item.rarity === 'common') return true;
        if (autoSell === 'uncommon' && (item.rarity === 'common' || item.rarity === 'uncommon')) return true;
        return false;
    }

    recalculatePlayerStats() {
        // 1. Base Stats based on level (buffed growth for better tempo)
        const lvl = this.state.level;
        let baseHp = 120 + (lvl - 1) * 30;   // was 100 + 18
        let baseAtk = 12 + (lvl - 1) * 6.0;  // was 10 + 3.5
        let baseDef = 4 + (lvl - 1) * 2.5;   // was 3 + 1.5
        
        let bonusSpeed = 0;     // Flat %
        let bonusCrit = 5;      // Flat %
        let bonusCritDmg = 150; // Flat %
        let bonusLifesteal = 0; // Flat %
        let bonusMagicFind = 0; // Flat %
        
        // 2. Equipment Stats
        Object.values(this.state.equipped).forEach(item => {
            if (!item) return;
            if (item.stats.hp) baseHp += item.stats.hp;
            if (item.stats.atk) baseAtk += item.stats.atk;
            if (item.stats.def) baseDef += item.stats.def;
            
            if (item.stats.speed) bonusSpeed += item.stats.speed;
            if (item.stats.critRate) bonusCrit += item.stats.critRate;
            if (item.stats.critDmg) bonusCritDmg += item.stats.critDmg;
            if (item.stats.lifesteal) bonusLifesteal += item.stats.lifesteal;
        });

        // 3. Skill Modifiers
        const skillBonuses = calculateSkillStats(this.state.skills);
        
        let hpMult = skillBonuses.hpMult;
        let atkMult = skillBonuses.atkMult;
        let defMult = skillBonuses.defMult;
        
        bonusSpeed += skillBonuses.speedBonus;
        bonusCrit += skillBonuses.critRateBonus;
        bonusCritDmg += skillBonuses.critDmgBonus;
        bonusLifesteal += skillBonuses.lifestealBonus;
        bonusMagicFind += skillBonuses.magicFindBonus;

        // 4. Transcendence Multipliers (Permanent shop boosts)
        const t = this.state.transcendenceUpgrades;
        hpMult += (t.statsBoost * 0.3);
        atkMult += (t.statsBoost * 0.3);
        defMult += (t.statsBoost * 0.3);
        
        const goldMult = skillBonuses.goldGainMult + (t.goldBoost * 0.4);
        const expMult = skillBonuses.scrapGainMult + (t.expBoost * 0.4);
        bonusMagicFind += (t.dropBoost * 25);

        // Store multipliers
        this.calculatedMultipliers = {
            hpMult, atkMult, defMult,
            goldMult, expMult,
            scrapMult: skillBonuses.scrapGainMult
        };

        // Final calculated attributes
        this.playerStats = {
            maxHp: Math.round(baseHp * hpMult),
            atk: Math.round(baseAtk * atkMult),
            def: Math.round(baseDef * defMult),
            speed: parseFloat((1.0 + (bonusSpeed / 100)).toFixed(2)), // Speed multiplier
            critRate: parseFloat(Math.min(95, bonusCrit).toFixed(1)), // Cap crit at 95%
            critDmg: parseFloat(bonusCritDmg.toFixed(1)),
            lifesteal: parseFloat(Math.min(50, bonusLifesteal).toFixed(1)), // Cap lifesteal at 50%
            magicFind: Math.round(bonusMagicFind)
        };

        this.playerMaxHP = this.playerStats.maxHp;
        // Make sure current HP doesn't exceed new Max HP
        if (this.playerHP > this.playerMaxHP) {
            this.playerHP = this.playerMaxHP;
        }

        if (this.ui) this.ui.renderStats();
    }

    spawnEnemy() {
        const stage = this.state.stage;
        const wave = this.state.wave;
        const isBoss = wave === 10;

        // Enemy stats scale exponentially with stage
        const stageMultiplier = Math.pow(1.20, stage - 1) * (1 + 0.10 * wave); // Stronger stage scaling for inflation
        
        let bossScale = 1.0;
        let enemyName = "";
        let color = "#e2e8f0";

        // Localized Stage Names / Themes
        const stageThemes = [
            { name: "囁きの森林", enemies: ["ウッドゴブリン", "大牙ウサギ", "迷いウルフ", "森の若樹兵"], boss: "古木の守護者キングウッド" },
            { name: "輝く鍾乳洞", enemies: ["結晶カブト", "発光コウモリ", "青色スライム", "地底蜘蛛"], boss: "巨岩のヌシ・クレイゴーレム" },
            { name: "琥珀の古城跡", enemies: ["朽ちた骸骨兵", "彷徨う霊魂", "ガーゴイル", "石像の騎士"], boss: "アンデッド・キャプテン" },
            { name: "熱砂の荒野", enemies: ["砂漠ヘビ", "火炎サソリ", "熱砂のハルピュイア", "流砂ゴースト"], boss: "獄炎のイフリート" },
            { name: "天空の回廊", enemies: ["ストームイーグル", "雷雲エレメンタル", "翼持つ使者", "虚空の戦士"], boss: "天空竜ファヴニール" },
            { name: "果てなき奈落", enemies: ["深淵の悪魔", "虚無の影", "カオススライム", "地獄の番犬"], boss: "深淵の王アバドン" }
        ];

        const themeIndex = Math.min(Math.floor((stage - 1) / 3), stageThemes.length - 1);
        const theme = stageThemes[themeIndex];

        if (isBoss) {
            bossScale = 2.8;
            enemyName = `👑 [BOSS] ${theme.boss}`;
            color = "#f59e0b"; // Golden Boss
        } else {
            const index = Math.floor(Math.random() * theme.enemies.length);
            enemyName = theme.enemies[index];
        }

        const baseEnemyHP = 60 * stageMultiplier * bossScale;   // was 45, bumped for challenge
        const baseEnemyAtk = 11 * stageMultiplier * (isBoss ? 1.6 : 1.0); // was 9
        const baseEnemyDef = 2 * stageMultiplier * (isBoss ? 1.4 : 1.0);

        this.enemy = {
            name: enemyName,
            maxHp: Math.max(10, Math.round(baseEnemyHP)),
            atk: Math.max(3, Math.round(baseEnemyAtk)),
            def: Math.max(0, Math.round(baseEnemyDef)),
            speed: parseFloat((0.85 + 0.05 * wave + (isBoss ? 0.2 : 0)).toFixed(2)),
            isBoss,
            color
        };

        this.enemyHP = this.enemy.maxHp;
        this.enemyMaxHP = this.enemy.maxHp;
        this.enemyGauge = 0;

        if (this.ui) {
            this.ui.renderEnemyCard();
            this.ui.addLog(`⚔️ ${this.enemy.name} が現れた！ (Wave ${wave}/10)`, isBoss ? "#ef4444" : "#94a3b8");
        }
    }

    healPlayer() {
        this.playerHP = this.playerMaxHP;
        if (this.ui) this.ui.renderBattleHP();
    }

    // High precision game loop tick
    tick(dt) {
        // Game running in real-time
        this.state.stats.timePlayed += dt;

        // Cumulative active timers (save every 10s internally too)
        this.saveTimer += dt;
        if (this.saveTimer >= 10) {
            this.saveTimer = 0;
            saveGame(this.state);
        }

        if (!this.enemy || this.playerHP <= 0 || this.enemyHP <= 0) return;

        // Attack gauges accumulation (multiplied by gameSpeed)
        const scaledDt = dt * this.gameSpeed;
        this.playerGauge += scaledDt * this.playerStats.speed * 28; // Speed multiplier scales gauge speed
        this.enemyGauge += scaledDt * this.enemy.speed * 25;

        // Check player attack
        if (this.playerGauge >= 100) {
            this.playerGauge = 0;
            this.playerAttack();
        }

        // Check enemy attack
        if (this.enemyGauge >= 100 && this.enemyHP > 0) {
            this.enemyGauge = 0;
            this.enemyAttack();
        }
        
        if (this.ui) {
            this.ui.updateGauges(this.playerGauge, this.enemyGauge);
        }
    }

    playerAttack(isManual = false) {
        if (!this.enemy || this.enemyHP <= 0) return;

        // 1. Calculate hit parameters
        const isCrit = Math.random() * 100 < this.playerStats.critRate;
        const roll = 0.9 + Math.random() * 0.2; // 90% to 110%
        let damage = Math.max(1, this.playerStats.atk - this.enemy.def);
        
        if (isCrit) {
            damage = damage * (this.playerStats.critDmg / 100);
        }
        damage = Math.round(damage * roll);

        // 2. Deal Damage
        this.enemyHP = Math.max(0, this.enemyHP - damage);
        
        // 3. Life steal
        let lifestealHeal = 0;
        if (this.playerStats.lifesteal > 0) {
            lifestealHeal = Math.round(damage * (this.playerStats.lifesteal / 100));
            this.playerHP = Math.min(this.playerMaxHP, this.playerHP + lifestealHeal);
        }

        // 4. Play visual sound cues
        if (isCrit) {
            gameAudio.playCrit();
            if (this.ui) this.ui.triggerCritFlash();
        } else {
            gameAudio.playSlash();
        }

        // 5. Trigger UI updates & Floating numbers
        if (this.ui) {
            this.ui.animateCard('player');
            this.ui.createFloatingNumber(damage, 'enemy', isCrit, false);
            if (lifestealHeal > 0) {
                this.ui.createFloatingNumber(lifestealHeal, 'player', false, true);
            }
            this.ui.renderBattleHP();
            
            const actionText = isManual ? "クリック突撃" : "強撃";
            this.ui.addLog(
                `🗡️ プレイヤーの${actionText}！ ${this.enemy.name} に **${damage}** ${isCrit ? '💥クリティカル！' : ''}ダメージを与える。` + 
                (lifestealHeal > 0 ? ` (吸血 +${lifestealHeal}HP)` : ''), 
                isCrit ? "#fbbf24" : "#e2e8f0"
            );
        }

        // 6. Death Check
        if (this.enemyHP <= 0) {
            this.handleEnemyDefeat();
        }
    }

    enemyAttack() {
        if (this.playerHP <= 0) return;

        // 1. Calculate damage
        const roll = 0.9 + Math.random() * 0.2;
        let damage = Math.max(1, this.enemy.atk - this.playerStats.def);
        damage = Math.round(damage * roll);

        // 2. Deal Damage
        this.playerHP = Math.max(0, this.playerHP - damage);

        // 3. Audio & Visuals
        gameAudio.playHit();
        
        if (this.ui) {
            this.ui.animateCard('enemy');
            this.ui.createFloatingNumber(damage, 'player', false, false);
            this.ui.renderBattleHP();
            this.ui.addLog(`💥 ${this.enemy.name} の攻撃！ プレイヤーに **${damage}** ダメージを与える。`, "#f87171");
        }

        // 4. Defeat check
        if (this.playerHP <= 0) {
            this.handlePlayerDefeat();
        }
    }

    // Active screen click action
    activeClick() {
        if (this.playerHP <= 0 || !this.enemy || this.enemyHP <= 0) return;
        // Direct click does 15% of standard attack power as instant click damage
        // Instantly advances gauge by 10%
        this.playerGauge = Math.min(100, this.playerGauge + 8);
        this.playerAttack(true);
    }

    handleEnemyDefeat() {
        this.state.stats.kills++;
        
        const stage = this.state.stage;
        const wave = this.state.wave;
        const isBoss = this.enemy.isBoss;

        // Calculate gold & exp rewards (buffed base values for better tempo)
        const stageScale = Math.pow(1.20, stage - 1) * (1 + 0.12 * wave);
        const goldEarned = Math.round(18 * stageScale * this.calculatedMultipliers.goldMult * (isBoss ? 4.0 : 1.0));  // was 8, boss×3→×4
        const expEarned = Math.round(12 * stageScale * this.calculatedMultipliers.expMult * (isBoss ? 3.0 : 1.0));   // was 5, boss×2.5→×3

        this.state.gold += goldEarned;
        this.state.stats.totalGold += goldEarned;
        
        if (this.ui) {
            this.ui.addLog(`💀 ${this.enemy.name} を討伐した！`, "#ef4444");
            this.ui.addLog(`💰 🪙${goldEarned} ゴールドと ✨${expEarned} 経験値を獲得。`, "#f59e0b");
        }

        this.gainExp(expEarned);

        // 🎁 Loot Drop Roll!
        // Bosses: 100% drop rate. Normal: 15% drop rate.
        const dropChance = isBoss ? 1.0 : 0.15;
        if (Math.random() < dropChance) {
            if (this.state.inventory.length < this.state.inventoryMax) {
                const item = generateItem(stage, this.playerStats.magicFind);
                
                if (this.shouldAutoSell(item)) {
                    // Auto-sold!
                    this.state.gold += item.goldValue;
                    if (this.ui) this.ui.addLog(`🎒 自動売却: [${item.name}] を 🪙${item.goldValue} ゴールドで自動的に売却しました。`, "#64748b");
                } else {
                    this.state.inventory.push(item);
                    gameAudio.playLootDrop(item.rarity);
                    
                    if (item.rarity === 'legendary' || item.rarity === 'ethereal') {
                        this.state.stats.legendariesFound++;
                    }

                    if (this.ui) {
                        const rColor = this.getRarityColor(item.rarity);
                        this.ui.addLog(`🎁 装備ドロップ！ **[${item.name}]** (Lv.${item.level}) を手に入れた！`, rColor);
                        this.ui.renderInventory();
                    }
                }
            } else {
                if (this.ui) this.ui.addLog("🎒 インベントリがいっぱいです！ 装備品をドロップできませんでした。", "#ef4444");
            }
        }

        // Progress wave
        if (isBoss) {
            // Unlock next stage!
            this.state.stage++;
            this.state.maxStage = Math.max(this.state.maxStage, this.state.stage);
            this.state.wave = 1;
            
            if (this.ui) {
                this.ui.addLog(`🎉 ステージクリア！ 次のステージ「ステージ ${this.state.stage}」が解放された！`, "#22c55e");
                this.ui.renderStats();
            }
            saveGame(this.state);
        } else {
            this.state.wave++;
        }

        // Spawn next foe
        setTimeout(() => {
            this.spawnEnemy();
            this.healPlayer();
        }, 800); // Small immersive pause between fights
    }

    handlePlayerDefeat() {
        if (this.ui) {
            this.ui.addLog(`❌ プレイヤーが力尽きた...`, "#ef4444");
            this.ui.addLog(`⛺ 近くの安全なキャンプに退却し、体力を回復して再挑戦します。`, "#38bdf8");
        }

        // Player setback in cozy mode:
        // Set wave back to 1. If wave is 1, drop stage back 1 level.
        if (this.state.wave > 1) {
            this.state.wave = 1;
        } else if (this.state.stage > 1) {
            this.state.stage--;
            this.state.wave = 1;
        }

        this.playerGauge = 0;
        this.enemyGauge = 0;

        setTimeout(() => {
            this.spawnEnemy();
            this.healPlayer();
            if (this.ui) this.ui.renderStats();
        }, 1500);
    }

    gainExp(amount) {
        this.state.exp += amount;
        let req = this.getExpRequired();
        let leveledUp = false;
        
        while (this.state.exp >= req) {
            this.state.exp -= req;
            this.state.level++;
            this.state.skillPoints++;
            leveledUp = true;
            
            gameAudio.playLevelUp();
            if (this.ui) {
                this.ui.addLog(`🌟 レベルアップ！ レベル **${this.state.level}** に達した！ (スキルポイント+1)`, "#3b82f6");
                this.ui.renderLevelUpEffects();
            }
            this.recalculatePlayerStats();
            req = this.getExpRequired();
        }
        
        if (leveledUp) {
            saveGame(this.state);
        }
        
        if (this.ui) this.ui.renderStats();
    }

    getExpRequired() {
        // Gentler curve: 1.15→1.10 base, linear factor halved for faster early levels
        return Math.round(80 * Math.pow(1.10, this.state.level - 1) + this.state.level * 6);
    }

    // Equip an item
    equipItem(item) {
        const type = item.type;
        const currentEquipped = this.state.equipped[type];

        // 1. Remove from inventory
        const idx = this.state.inventory.findIndex(i => i.id === item.id);
        if (idx !== -1) {
            this.state.inventory.splice(idx, 1);
        }

        // 2. Put old item back into inventory
        if (currentEquipped) {
            this.state.inventory.push(currentEquipped);
        }

        // 3. Equip new item
        this.state.equipped[type] = item;

        gameAudio.playClick();
        
        this.recalculatePlayerStats();
        
        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderEquipped();
            this.ui.showToast(`${item.name} を装備しました ⚔️`);
        }
        saveGame(this.state);
    }

    // Unequip an item
    unequipItem(type) {
        const item = this.state.equipped[type];
        if (!item) return;

        if (this.state.inventory.length >= this.state.inventoryMax) {
            if (this.ui) this.ui.showToast("インベントリがいっぱいです！ 🎒", "error");
            return;
        }

        this.state.equipped[type] = null;
        this.state.inventory.push(item);
        
        gameAudio.playClick();
        this.recalculatePlayerStats();

        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderEquipped();
            this.ui.showToast(`${item.name} を外しました 🛡️`);
        }
        saveGame(this.state);
    }

    // Sell item for gold
    sellItem(item) {
        const idx = this.state.inventory.findIndex(i => i.id === item.id);
        if (idx === -1) return;

        this.state.inventory.splice(idx, 1);
        this.state.gold += item.goldValue;
        this.state.stats.totalGold += item.goldValue;

        gameAudio.playClick();

        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderStats();
            this.ui.showToast(`${item.name} を売却しました (+🪙${item.goldValue.toLocaleString()})`);
        }
        saveGame(this.state);
    }

    // Salvage/Scrap item
    scrapItem(item) {
        const idx = this.state.inventory.findIndex(i => i.id === item.id);
        if (idx === -1) return;

        this.state.inventory.splice(idx, 1);
        
        const res = salvageItem(item, this.calculatedMultipliers.scrapMult);
        this.state.scrap += res.scrap;
        this.state.gold += res.gold;
        this.state.stats.totalScrap += res.scrap;

        gameAudio.playClick();

        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderStats();
            this.ui.showToast(`${item.name} を分解しました (+🔥${res.scrap} | +🪙${res.gold})`);
        }
        saveGame(this.state);
    }

    // Multi salvage
    bulkSalvage(rarityThreshold) {
        let count = 0;
        let scrapGained = 0;
        let goldGained = 0;

        // Filter and salvage
        const keepItems = [];
        this.state.inventory.forEach(item => {
            let matches = false;
            if (rarityThreshold === 'common' && item.rarity === 'common') matches = true;
            if (rarityThreshold === 'uncommon' && (item.rarity === 'common' || item.rarity === 'uncommon')) matches = true;
            if (rarityThreshold === 'rare' && (item.rarity === 'common' || item.rarity === 'uncommon' || item.rarity === 'rare')) matches = true;

            if (matches) {
                const res = salvageItem(item, this.calculatedMultipliers.scrapMult);
                scrapGained += res.scrap;
                goldGained += res.gold;
                count++;
            } else {
                keepItems.push(item);
            }
        });

        if (count === 0) {
            if (this.ui) this.ui.showToast("分解可能な装備がありません。 🎒");
            return;
        }

        this.state.inventory = keepItems;
        this.state.scrap += scrapGained;
        this.state.gold += goldGained;
        this.state.stats.totalScrap += scrapGained;

        gameAudio.playClick();

        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderStats();
            this.ui.showToast(`${count}個 の装備を分解しました (+🔥${scrapGained} | +🪙${goldGained})`);
        }
        saveGame(this.state);
    }

    // Transcendence / Rebirth (転生)
    transcend() {
        const crystalsEarned = Math.max(0, Math.floor(Math.pow(this.state.maxStage, 1.4) * (this.state.level / 90) - 1));
        
        if (crystalsEarned <= 0) {
            if (this.ui) this.ui.showToast("転生に必要なエーテル結晶が足りません。もっとステージを進めてください！ 🔒", "error");
            return;
        }

        this.state.crystals += crystalsEarned;
        this.state.stats.totalCrystals += crystalsEarned;
        this.state.stats.transcendsCount++;

        // Reset values
        this.state.level = 1;
        this.state.exp = 0;
        this.state.stage = 1;
        this.state.wave = 1;
        this.state.skillPoints = 0;
        
        // Reset skills
        for (const skillId of Object.keys(this.state.skills)) {
            this.state.skills[skillId] = 0;
        }

        // Reset stats but keep inventory and equipped (cozy style!)
        // However, equipment stays equipped. Recalculating stats will scale down their power relative to level 1 baseline.
        
        gameAudio.playTranscend();
        this.recalculatePlayerStats();
        this.spawnEnemy();
        this.healPlayer();
        
        saveGame(this.state);

        if (this.ui) {
            this.ui.renderInventory();
            this.ui.renderEquipped();
            this.ui.renderSkills();
            this.ui.renderTranscend();
            this.ui.renderStats();
            this.ui.addLog(`🌌 転生が完了した！ エーテル結晶を ${crystalsEarned}個 獲得し、新たな境地へ旅立ちます。`, "#06b6d4");
            this.ui.showToast(`転生完了！ +💎${crystalsEarned} エーテル結晶`);
        }
    }

    calculatePlayerCP() {
        const s = this.playerStats;
        if (!s || !s.atk) return 0;
        const baseCP = (s.atk * 5.2 + s.def * 12.5 + s.maxHp * 0.45);
        const speedMult = 1.0 + (s.speed - 1.0) * 1.5;
        const critMult = 1.0 + (s.critRate / 100) * (s.critDmg - 100) / 100;
        const lsMult = 1.0 + (s.lifesteal / 55);
        return Math.max(1, Math.round(baseCP * speedMult * critMult * lsMult));
    }

    calculateEnemyCP() {
        if (!this.enemy) return 0;
        const e = this.enemy;
        const baseCP = (e.atk * 5.2 + e.def * 12.5 + e.maxHp * 0.45);
        const speedMult = 1.0 + (e.speed - 0.85) * 1.5;
        return Math.max(1, Math.round(baseCP * speedMult));
    }

    autoEquip() {
        if (this.state.inventory.length === 0) {
            if (this.ui) this.ui.showToast("インベントリが空です。 🎒");
            return;
        }

        const slots = ['weapon', 'armor', 'shield', 'ring', 'amulet'];
        let equipCount = 0;

        // Stat scoring helper for ranking
        const getItemScore = (item) => {
            let score = item.level * 12;
            
            // Rarity scoring
            const rarityScores = { common: 0, uncommon: 6, rare: 18, epic: 40, legendary: 85, ethereal: 180 };
            score += rarityScores[item.rarity] || 0;
            score += item.enhancement * 12;

            // Stat lines scoring
            const flatStats = ['atk', 'def', 'hp'];
            Object.keys(item.stats).forEach(stat => {
                const val = item.stats[stat];
                if (stat === 'atk') score += val * 5.0;
                else if (stat === 'def') score += val * 12.0;
                else if (stat === 'hp') score += val * 0.4;
                else if (stat === 'speed') score += val * 6.0;
                else if (stat === 'critRate') score += val * 8.0;
                else if (stat === 'critDmg') score += val * 1.5;
                else if (stat === 'lifesteal') score += val * 12.0;
            });
            return score;
        };

        slots.forEach(slot => {
            const currentEquipped = this.state.equipped[slot];
            const currentScore = currentEquipped ? getItemScore(currentEquipped) : -1;

            // Find best item of this slot type in inventory
            let bestItem = null;
            let bestScore = currentScore;
            let bestIdx = -1;

            this.state.inventory.forEach((item, idx) => {
                if (item.type === slot) {
                    const score = getItemScore(item);
                    if (score > bestScore) {
                        bestScore = score;
                        bestItem = item;
                        bestIdx = idx;
                    }
                }
            });

            if (bestItem && bestIdx !== -1) {
                // Perform equip swap
                this.state.inventory.splice(bestIdx, 1);
                if (currentEquipped) {
                    this.state.inventory.push(currentEquipped);
                }
                this.state.equipped[slot] = bestItem;
                equipCount++;
            }
        });

        if (equipCount > 0) {
            if (window.gameAudio) window.gameAudio.playClick();
            this.recalculatePlayerStats();
            if (this.ui) {
                this.ui.renderInventory();
                this.ui.renderEquipped();
                this.ui.showToast(`装備を最適化しました！ (${equipCount}箇所変更) ⚔️`);
                this.ui.addLog(`🎒 装備一括最適化: 最も戦闘力の高い装備を ${equipCount}箇所 自動で装着しました。`, "#22c55e");
            }
        } else {
            if (this.ui) this.ui.showToast("すでに最適な装備を装着しています。 🛡️");
        }
    }

    getRarityColor(rarity) {
        const r = {
            common: "#f1f5f9",
            uncommon: "#4ade80",
            rare: "#3b82f6",
            epic: "#a855f7",
            legendary: "#f59e0b",
            ethereal: "#06b6d4"
        };
        return r[rarity] || "#ffffff";
    }
}

window.IdleGame = IdleGame;
