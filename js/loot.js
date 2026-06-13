// Loot Generation and Equipment Database Engine
// Implements randomized drops, stat modifiers, and progressive scaling.

const RARITIES = {
    common: { name: "コモン", color: "#e2e8f0", weight: 6000 },
    uncommon: { name: "アンコモン", color: "#4ade80", weight: 2500 },
    rare: { name: "レア", color: "#3b82f6", weight: 1000 },
    epic: { name: "エピック", color: "#a855f7", weight: 400 },
    legendary: { name: "レジェンダリー", color: "#f59e0b", weight: 90 },
    ethereal: { name: "エーテル", color: "#06b6d4", weight: 10 }
};
window.RARITIES = RARITIES;

const ITEM_TYPES = {
    weapon: { name: "武器", baseStats: { atk: 1.0 } },
    armor: { name: "鎧", baseStats: { def: 1.0, hp: 1.0 } },
    shield: { name: "盾", baseStats: { def: 1.2, hp: 0.8 } },
    ring: { name: "指輪", baseStats: { critRate: 1.0, critDmg: 1.0 } },
    amulet: { name: "魔除け", baseStats: { speed: 1.0, lifesteal: 1.0 } }
};
window.ITEM_TYPES = ITEM_TYPES;

const STAT_NAMES = {
    atk: "攻撃力",
    def: "防御力",
    hp: "最大HP",
    speed: "攻撃速度",
    critRate: "クリティカル率",
    critDmg: "クリティカルダメージ",
    lifesteal: "吸血率"
};

const PREFIXES = [
    { name: "猛き", stat: "atk", mult: 1.3 },
    { name: "堅牢なる", stat: "def", mult: 1.3 },
    { name: "活力の", stat: "hp", mult: 1.3 },
    { name: "神速の", stat: "speed", mult: 1.25 },
    { name: "鋭い", stat: "critRate", mult: 1.25 },
    { name: "破壊の", stat: "critDmg", mult: 1.3 },
    { name: "血塗られた", stat: "lifesteal", mult: 1.3 },
    { name: "祝福された", stat: "all", mult: 1.15 }
];

const SUFFIXES = [
    { name: "の力", stat: "atk" },
    { name: "の防壁", stat: "def" },
    { name: "の息吹", stat: "hp" },
    { name: "の追い風", stat: "speed" },
    { name: "の刃", stat: "critRate" },
    { name: "の咆哮", stat: "critDmg" },
    { name: "の渇き", stat: "lifesteal" }
];

const BASE_NAMES = {
    weapon: ["鉄の剣", "ブロードソード", "クレイモア", "ハルバード", "ルーンブレード", "神殺しの剣"],
    armor: ["革の服", "鉄の胸当て", "銀の甲冑", "ミスリルの鎧", "魔封じの衣", "星屑のローブ"],
    shield: ["木製盾", "鉄の丸盾", "カイトシールド", "タワーシールド", "イージスの盾", "聖騎士の盾"],
    ring: ["銅の指輪", "銀の指輪", "金の指輪", "ルビーの指輪", "サファイアの指輪", "永遠の指輪"],
    amulet: ["琥珀の首飾り", "翡翠の魔除け", "真珠のタリスマン", "結晶のペンダント", "ドラゴンの瞳", "星宿の護符"]
};

// Generates an item procedurally
function generateItem(stage, magicFind = 0, forceRarity = null) {
    const id = "item_" + Math.random().toString(36).substr(2, 9);
    
    // 1. Roll Rarity
    let rarity = "common";
    if (forceRarity) {
        rarity = forceRarity;
    } else {
        // Adjust weights based on Magic Find (magicFind is percentage, e.g. 50 means +50% chance for higher rarities)
        const mfMultiplier = 1 + (magicFind / 100);
        let weights = { ...RARITIES };
        
        let totalWeight = 0;
        const rolledWeights = {};
        
        for (const [key, details] of Object.entries(weights)) {
            let weight = details.weight;
            if (key !== 'common') {
                weight = Math.round(weight * mfMultiplier);
            }
            rolledWeights[key] = weight;
            totalWeight += weight;
        }

        let roll = Math.random() * totalWeight;
        let cumulative = 0;
        
        // Priority from highest to lowest rarity
        const rarityOrder = ['ethereal', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        for (const key of rarityOrder) {
            cumulative += rolledWeights[key];
            if (roll <= cumulative) {
                rarity = key;
                break;
            }
        }
    }

    // 2. Select Item Type
    const types = Object.keys(ITEM_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];

    // 3. Select Base Name based on Stage
    const baseNames = BASE_NAMES[type];
    const nameIndex = Math.min(Math.floor((stage - 1) / 5), baseNames.length - 1);
    const baseName = baseNames[nameIndex];

    // 4. Roll Prefix/Suffix
    let prefix = null;
    let suffix = null;
    
    if (Math.random() < 0.4 || rarity === 'legendary' || rarity === 'ethereal') {
        prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    }
    if (Math.random() < 0.4 || rarity === 'ethereal') {
        suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    }

    let fullName = baseName;
    if (prefix) fullName = `${prefix.name}${fullName}`;
    if (suffix) fullName = `${fullName}${suffix.name}`;

    // 5. Generate Stats based on Stage scaling
    // Level scaling: 1.12^stage, and stats have base parameters
    const stageScale = Math.pow(1.12, stage - 1);
    const stats = {};
    const itemLevel = stage;

    // Standard scaling factors
    const baseValues = {
        atk: 5 * stageScale,
        def: 3 * stageScale,
        hp: 30 * stageScale,
        speed: 1, // Percentage, max +30%
        critRate: 1, // Percentage, max +20%
        critDmg: 5, // Percentage, max +50%
        lifesteal: 0.5 // Percentage, max +10%
    };

    // Determine how many stat lines an item gets
    // Common: 1 stat (base stat)
    // Uncommon: 1 stats (boosted)
    // Rare: 2 stats
    // Epic: 3 stats
    // Legendary: 4 stats
    // Ethereal: 4 stats (max roll)
    let numStats = 1;
    if (rarity === 'uncommon') numStats = 1;
    else if (rarity === 'rare') numStats = 2;
    else if (rarity === 'epic') numStats = 3;
    else if (rarity === 'legendary') numStats = 4;
    else if (rarity === 'ethereal') numStats = 4;

    // Pick potential stats based on Item Type
    const potentialStats = ['atk', 'def', 'hp', 'speed', 'critRate', 'critDmg', 'lifesteal'];
    const selectedStats = [];
    
    // Add primary type stat first
    if (type === 'weapon') selectedStats.push('atk');
    else if (type === 'armor') selectedStats.push('def');
    else if (type === 'shield') selectedStats.push('hp');
    else if (type === 'ring') selectedStats.push('critRate');
    else if (type === 'amulet') selectedStats.push('speed');

    while (selectedStats.length < numStats) {
        const randStat = potentialStats[Math.floor(Math.random() * potentialStats.length)];
        if (!selectedStats.includes(randStat)) {
            selectedStats.push(randStat);
        }
    }

    // Roll each stat
    selectedStats.forEach(stat => {
        let baseVal = baseValues[stat];
        
        // Rarity modifiers
        let rarityMult = 1.0;
        if (rarity === 'uncommon') rarityMult = 1.2;
        else if (rarity === 'rare') rarityMult = 1.5;
        else if (rarity === 'epic') rarityMult = 2.0;
        else if (rarity === 'legendary') rarityMult = 2.8;
        else if (rarity === 'ethereal') rarityMult = 4.0;

        // Roll factor (randomness)
        let roll = 0.8 + Math.random() * 0.4; // 80% to 120%
        if (rarity === 'ethereal') roll = 1.2; // Ethereal is always max roll

        // Prefix modifier
        let prefixMult = 1.0;
        if (prefix) {
            if (prefix.stat === stat) {
                prefixMult = prefix.mult;
            } else if (prefix.stat === 'all') {
                prefixMult = 1.1;
            }
        }

        // Calculate final stat value
        let finalVal = baseVal * rarityMult * roll * prefixMult;
        
        // Round nicely
        if (['atk', 'def', 'hp'].includes(stat)) {
            stats[stat] = Math.max(1, Math.round(finalVal));
        } else {
            // Percent stats: cap them so they don't break the game early, but scale smoothly
            // e.g. Crit Rate adds between 1% to 15%
            let pctVal = finalVal;
            if (stat === 'speed') pctVal = Math.min(25, finalVal);
            if (stat === 'critRate') pctVal = Math.min(20, finalVal);
            if (stat === 'critDmg') pctVal = Math.min(80, finalVal);
            if (stat === 'lifesteal') pctVal = Math.min(15, finalVal);
            
            stats[stat] = parseFloat(pctVal.toFixed(1));
        }
    });

    // 6. Sell value (Ember shards/Gold)
    let scrapValue = 1;
    let goldValue = 10;
    const valueScale = Math.pow(1.15, stage - 1);

    if (rarity === 'common') { scrapValue = 1; goldValue = Math.round(5 * valueScale); }
    else if (rarity === 'uncommon') { scrapValue = 2; goldValue = Math.round(15 * valueScale); }
    else if (rarity === 'rare') { scrapValue = 5; goldValue = Math.round(40 * valueScale); }
    else if (rarity === 'epic') { scrapValue = 12; goldValue = Math.round(120 * valueScale); }
    else if (rarity === 'legendary') { scrapValue = 35; goldValue = Math.round(400 * valueScale); }
    else if (rarity === 'ethereal') { scrapValue = 100; goldValue = Math.round(1500 * valueScale); }

    return {
        id,
        name: fullName,
        type,
        rarity,
        level: itemLevel,
        baseStats: JSON.parse(JSON.stringify(stats)),
        stats,
        enhancement: 0, // +0 initially
        scrapValue,
        goldValue
    };
}

// Generate the HTML representation of a tooltip comparing two items
function getCompareTooltip(item, equippedItem) {
    let html = `<div class="item-tooltip rarity-${item.rarity}">`;
    html += `<div class="tooltip-header">`;
    html += `<span class="tooltip-name">${item.enhancement > 0 ? `+${item.enhancement} ` : ''}${item.name}</span>`;
    html += `<span class="tooltip-rarity" style="color: ${RARITIES[item.rarity].color}">${RARITIES[item.rarity].name}</span>`;
    html += `</div>`;
    
    html += `<div class="tooltip-subheader">`;
    html += `<span>Lv.${item.level} ${ITEM_TYPES[item.type].name}</span>`;
    html += `</div>`;

    html += `<div class="tooltip-stats">`;
    const allStats = ['atk', 'def', 'hp', 'speed', 'critRate', 'critDmg', 'lifesteal'];
    
    allStats.forEach(stat => {
        if (item.stats[stat] !== undefined) {
            const val = item.stats[stat];
            const isPct = !['atk', 'def', 'hp'].includes(stat);
            const valStr = isPct ? `+${val}%` : `+${val}`;
            
            let compareStr = '';
            if (equippedItem) {
                const eqVal = equippedItem.stats[stat] || 0;
                const diff = val - eqVal;
                if (diff > 0) {
                    compareStr = ` <span class="stat-better">(+${isPct ? diff.toFixed(1) + '%' : diff})</span>`;
                } else if (diff < 0) {
                    compareStr = ` <span class="stat-worse">(${isPct ? diff.toFixed(1) + '%' : diff})</span>`;
                }
            }
            
            html += `<div class="tooltip-stat-row">`;
            html += `<span class="stat-label">${STAT_NAMES[stat]}</span>`;
            html += `<span class="stat-value">${valStr}${compareStr}</span>`;
            html += `</div>`;
        }
    });
    html += `</div>`;

    html += `<div class="tooltip-footer">`;
    html += `<span>売却値: 🪙${item.goldValue.toLocaleString()} | 分解: 🔥${item.scrapValue}</span>`;
    html += `</div>`;
    html += `</div>`;
    
    return html;
}

// Translate stat key to Japanese
function getStatName(stat) {
    return STAT_NAMES[stat] || stat;
}

window.generateItem = generateItem;
window.getCompareTooltip = getCompareTooltip;
window.getStatName = getStatName;
