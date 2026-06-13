// Skill Tree & Passive Upgrades Engine
// Manages skill allocations, dependencies, and stat multiplier calculations.

const SKILL_TREE = {
    // Tier 1 Skills (Basic stats)
    warrior_might: {
        id: "warrior_might",
        name: "戦士の剛力",
        desc: "攻撃力が恒久的に上昇する。",
        maxLevel: 10,
        effectPerLevel: 0.05, // +5% ATK
        effectType: "multiplier",
        stat: "atk",
        dependencies: [],
        x: 20, y: 20,
        icon: "⚔️"
    },
    iron_will: {
        id: "iron_will",
        name: "鉄の意志",
        desc: "最大HPが恒久的に上昇する。",
        maxLevel: 10,
        effectPerLevel: 0.06, // +6% HP
        effectType: "multiplier",
        stat: "hp",
        dependencies: [],
        x: 50, y: 20,
        icon: "❤️"
    },
    steel_skin: {
        id: "steel_skin",
        name: "鋼の皮膚",
        desc: "防御力が恒久的に上昇する。",
        maxLevel: 10,
        effectPerLevel: 0.05, // +5% DEF
        effectType: "multiplier",
        stat: "def",
        dependencies: [],
        x: 80, y: 20,
        icon: "🛡️"
    },

    // Tier 2 Skills (Speed & Crit - require Tier 1 skills)
    wind_runner: {
        id: "wind_runner",
        name: "疾風の歩み",
        desc: "攻撃速度が上昇する。",
        maxLevel: 10,
        effectPerLevel: 3, // +3% Speed (flat addition to Speed multiplier)
        effectType: "flat_pct",
        stat: "speed",
        dependencies: [{ id: "warrior_might", minLevel: 3 }],
        x: 20, y: 50,
        icon: "🍃"
    },
    assassin_eye: {
        id: "assassin_eye",
        name: "暗殺者の眼光",
        desc: "クリティカル率が上昇する。",
        maxLevel: 10,
        effectPerLevel: 1.5, // +1.5% Crit Rate
        effectType: "flat_pct",
        stat: "critRate",
        dependencies: [{ id: "iron_will", minLevel: 3 }],
        x: 50, y: 50,
        icon: "🎯"
    },
    blood_thirst: {
        id: "blood_thirst",
        name: "血への渇望",
        desc: "与えたダメージの一部をHPとして吸収する。",
        maxLevel: 10,
        effectPerLevel: 0.6, // +0.6% Lifesteal
        effectType: "flat_pct",
        stat: "lifesteal",
        dependencies: [{ id: "steel_skin", minLevel: 3 }],
        x: 80, y: 50,
        icon: "🩸"
    },

    // Tier 3 Skills (Advanced - Crit Damage, Utility, Magic Find)
    heavy_strike: {
        id: "heavy_strike",
        name: "重撃の極意",
        desc: "クリティカルダメージ倍率が大幅に上昇する。",
        maxLevel: 10,
        effectPerLevel: 12, // +12% Crit Damage
        effectType: "flat_pct",
        stat: "critDmg",
        dependencies: [{ id: "assassin_eye", minLevel: 3 }],
        x: 35, y: 80,
        icon: "💥"
    },
    golden_touch: {
        id: "golden_touch",
        name: "黄金の手触り",
        desc: "敵から獲得できるゴールドが上昇する。",
        maxLevel: 10,
        effectPerLevel: 0.10, // +10% Gold
        effectType: "multiplier",
        stat: "goldGain",
        dependencies: [{ id: "wind_runner", minLevel: 3 }],
        x: 10, y: 80,
        icon: "🪙"
    },
    scavenger: {
        id: "scavenger",
        name: "ジャンク回収屋",
        desc: "装備分解時に得られる「残り火の破片 (Ember Shards)」が増加する。",
        maxLevel: 10,
        effectPerLevel: 0.15, // +15% Scrap
        effectType: "multiplier",
        stat: "scrapGain",
        dependencies: [{ id: "blood_thirst", minLevel: 3 }],
        x: 90, y: 80,
        icon: "⚙️"
    },
    lucky_charm: {
        id: "lucky_charm",
        name: "幸運の守り",
        desc: "より高いレア度が出現する確率（魔法の発見力）が上昇する。",
        maxLevel: 10,
        effectPerLevel: 25, // +25% Magic Find
        effectType: "flat_pct",
        stat: "magicFind",
        dependencies: [{ id: "assassin_eye", minLevel: 5 }],
        x: 65, y: 80,
        icon: "🍀"
    }
};

// Calculate all skill stats based on allocated levels
function calculateSkillStats(allocatedLevels) {
    const stats = {
        atkMult: 1.0,
        defMult: 1.0,
        hpMult: 1.0,
        speedBonus: 0,
        critRateBonus: 0,
        critDmgBonus: 0,
        lifestealBonus: 0,
        goldGainMult: 1.0,
        scrapGainMult: 1.0,
        magicFindBonus: 0
    };

    for (const [skillId, info] of Object.entries(SKILL_TREE)) {
        const lvl = allocatedLevels[skillId] || 0;
        if (lvl <= 0) continue;

        const val = lvl * info.effectPerLevel;

        if (info.effectType === "multiplier") {
            if (info.stat === "atk") stats.atkMult += val;
            else if (info.stat === "def") stats.defMult += val;
            else if (info.stat === "hp") stats.hpMult += val;
            else if (info.stat === "goldGain") stats.goldGainMult += val;
            else if (info.stat === "scrapGain") stats.scrapGainMult += val;
        } else if (info.effectType === "flat_pct") {
            if (info.stat === "speed") stats.speedBonus += val;
            else if (info.stat === "critRate") stats.critRateBonus += val;
            else if (info.stat === "critDmg") stats.critDmgBonus += val;
            else if (info.stat === "lifesteal") stats.lifestealBonus += val;
            else if (info.stat === "magicFind") stats.magicFindBonus += val;
        }
    }

    return stats;
}

// Check if a skill can be unlocked
function isSkillUnlocked(skillId, allocatedLevels) {
    const skill = SKILL_TREE[skillId];
    if (!skill) return false;
    
    for (const dep of skill.dependencies) {
        const currentLvl = allocatedLevels[dep.id] || 0;
        if (currentLvl < dep.minLevel) {
            return false;
        }
    }
    return true;
}

window.SKILL_TREE = SKILL_TREE;
window.calculateSkillStats = calculateSkillStats;
window.isSkillUnlocked = isSkillUnlocked;
