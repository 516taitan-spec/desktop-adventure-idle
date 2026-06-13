// Forge Management Engine
// Handles item upgrading, salvaging, and shards-based crafting.

const MAX_ENHANCEMENT = 15;

const CRAFT_TIERS = {
    standard: {
        name: "見習いの鋳造",
        desc: "ランダムな装備を作成する。(通常確率)",
        scrapCost: 25,
        goldCost: 200,
        minRarity: null
    },
    expert: {
        name: "名工の鋳造",
        desc: "レア以上の強力な装備を作成する。",
        scrapCost: 120,
        goldCost: 1000,
        minRarity: "rare"
    },
    masterpiece: {
        name: "秘術の鋳造",
        desc: "エピック以上の極上装備を作成する。",
        scrapCost: 600,
        goldCost: 5000,
        minRarity: "epic"
    }
};

// Calculate costs to upgrade an item
function getUpgradeCost(item) {
    const e = item.enhancement;
    const lvl = item.level;

    // Exponential scaling based on level and current upgrade level
    const scrapCost = Math.round(5 * Math.pow(1.32, e) * Math.pow(1.04, lvl - 1));
    const goldCost = Math.round(50 * Math.pow(1.38, e) * Math.pow(1.05, lvl - 1));

    return { scrapCost, goldCost };
}

// Perform the upgrade
function upgradeItem(item, playerScrap, playerGold) {
    if (item.enhancement >= MAX_ENHANCEMENT) {
        return { success: false, reason: "最大強化値に達しています。" };
    }

    const { scrapCost, goldCost } = getUpgradeCost(item);
    if (playerScrap < scrapCost) {
        return { success: false, reason: "残り火の破片(Scrap)が不足しています。" };
    }
    if (playerGold < goldCost) {
        return { success: false, reason: "ゴールドが不足しています。" };
    }

    // Deduct and upgrade
    item.enhancement += 1;

    // Recalculate stats based on original baseStats: +15% per upgrade level
    const boostFactor = 1 + (0.15 * item.enhancement);
    const flatStats = ['atk', 'def', 'hp'];
    
    for (const stat of Object.keys(item.baseStats)) {
        const baseVal = item.baseStats[stat];
        if (flatStats.includes(stat)) {
            item.stats[stat] = Math.max(1, Math.round(baseVal * boostFactor));
        } else {
            // Percent stats: speed, crit, lifesteal, etc.
            item.stats[stat] = parseFloat((baseVal * boostFactor).toFixed(1));
        }
    }

    // Boost values
    item.scrapValue = Math.round(item.scrapValue * 1.12);
    item.goldValue = Math.round(item.goldValue * 1.18);

    return {
        success: true,
        scrapCost,
        goldCost,
        item
    };
}

// Salvage an item for Ember Shards
function salvageItem(item, scrapGainMult = 1.0) {
    const finalScrap = Math.round(item.scrapValue * scrapGainMult);
    const finalGold = Math.round(item.goldValue * 0.15); // Get 15% of sell value back as gold too!
    
    return {
        scrap: finalScrap,
        gold: finalGold
    };
}

// Craft an item
function craftItem(stage, tierKey, playerScrap, playerGold, magicFind = 0) {
    const tier = CRAFT_TIERS[tierKey];
    if (!tier) return { success: false, reason: "無効なクラフト段階です。" };

    if (playerScrap < tier.scrapCost) {
        return { success: false, reason: "残り火の破片(Scrap)が不足しています。" };
    }
    if (playerGold < tier.goldCost) {
        return { success: false, reason: "ゴールドが不足しています。" };
    }

    // Roll rarity under constraints
    let rolledItem;
    if (tier.minRarity) {
        // Roll until we get the min rarity or higher
        let attempts = 0;
        const rarityRanks = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, ethereal: 5 };
        const minRank = rarityRanks[tier.minRarity];
        
        do {
            rolledItem = generateItem(stage, magicFind);
            attempts++;
        } while (rarityRanks[rolledItem.rarity] < minRank && attempts < 100);

        // Fail-safe: if max attempts hit, force the min rarity
        if (rarityRanks[rolledItem.rarity] < minRank) {
            rolledItem = generateItem(stage, magicFind, tier.minRarity);
        }
    } else {
        rolledItem = generateItem(stage, magicFind);
    }

    return {
        success: true,
        scrapCost: tier.scrapCost,
        goldCost: tier.goldCost,
        item: rolledItem
    };
}

window.MAX_ENHANCEMENT = MAX_ENHANCEMENT;
window.CRAFT_TIERS = CRAFT_TIERS;
window.getUpgradeCost = getUpgradeCost;
window.upgradeItem = upgradeItem;
window.salvageItem = salvageItem;
window.craftItem = craftItem;
