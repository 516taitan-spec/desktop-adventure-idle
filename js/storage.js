// Save State and LocalStorage Syncing Engine
// Implements safe state merging, default values, and progress persistence.

const SAVE_KEY = "desktop_cozy_adventure_save_v1";

const DEFAULT_STATE = {
    gold: 100, // Small starting allowance
    scrap: 0,
    crystals: 0, // Transcendence crystals
    
    level: 1,
    exp: 0,
    stage: 1,
    maxStage: 1,
    wave: 1,
    skillPoints: 0,
    
    equipped: {
        weapon: null,
        armor: null,
        shield: null,
        ring: null,
        amulet: null
    },
    
    inventory: [],
    inventoryMax: 50,
    
    skills: {
        warrior_might: 0,
        iron_will: 0,
        steel_skin: 0,
        wind_runner: 0,
        assassin_eye: 0,
        blood_thirst: 0,
        heavy_strike: 0,
        golden_touch: 0,
        scavenger: 0,
        lucky_charm: 0
    },

    transcendenceUpgrades: {
        statsBoost: 0,    // +30% all stats per level
        goldBoost: 0,     // +40% gold gain per level
        expBoost: 0,      // +40% exp gain per level
        dropBoost: 0      // +25% Magic Find & +5% higher-lvl drops
    },
    
    stats: {
        kills: 0,
        bossKills: 0,
        totalGold: 100,
        totalScrap: 0,
        totalCrystals: 0,
        legendariesFound: 0,
        transcendsCount: 0,
        timePlayed: 0
    },
    
    settings: {
        muted: false,
        autoSellRarity: 'none' // 'none', 'common', 'uncommon'
    },

    lastSaved: Date.now()
};

// Deep merge two objects safely
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            // Arrays: replace completely if we want clean arrays, or merge objects
            if (Array.isArray(source[key])) {
                target[key] = [...source[key]];
            } else {
                Object.assign(target[key], deepMerge(target[key], source[key]));
            }
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

// Save game state
function saveGame(state) {
    try {
        state.lastSaved = Date.now();
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        
        // Trigger cloud sync if user is logged in
        if (window.auth && typeof window.auth.uploadSave === 'function' && window.auth.isAuthenticated()) {
            window.auth.uploadSave(state);
        }
        
        return true;
    } catch (e) {
        console.error("Failed to save game state:", e);
        return false;
    }
}


// Load game state
function loadGame() {
    try {
        const savedData = localStorage.getItem(SAVE_KEY);
        if (!savedData) {
            return JSON.parse(JSON.stringify(DEFAULT_STATE));
        }

        const parsed = JSON.parse(savedData);
        // Start with a clean default copy and merge saved data over it
        const mergedState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        deepMerge(mergedState, parsed);
        
        return mergedState;
    } catch (e) {
        console.error("Failed to load game state, fallback to default:", e);
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
}

// Wipe save data
function wipeSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
        return true;
    } catch (e) {
        console.error("Failed to wipe save:", e);
        return false;
    }
}

window.DEFAULT_STATE = DEFAULT_STATE;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.wipeSave = wipeSave;
