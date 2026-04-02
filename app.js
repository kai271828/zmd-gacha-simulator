const DEFAULT_CONFIG = {
    commonUnits: {
        6: ["艾爾戴拉", "俊衛", "別禮", "餘燼", "黎風"],
        5: ["佩麗卡", "弧光", "艾維文娜", "大潘", "陳千語", "狼衛", "賽希", "晝雪", "阿列什"],
        4: ["秋栗", "卡契爾", "埃特拉", "螢石", "安塔爾"]
    },
    pools: [
        {
            key: "standard",
            tabLabel: "常駐",
            title: "基礎尋訪",
            subtitle: "永久開放",
            subtitleColor: "#fbff00",
            panelGradient: "linear-gradient(to right, rgba(254, 221, 0, 0.22) 0%, rgba(254, 221, 0, 0.62) 100%)",
            featured6: null,
            infoHtml: "<br><br>"
        }
    ]
};

let COMMON_UNITS = {};
let POOL_CONFIG = {};
let currentPool = "";
let poolPityState = {};
let totalCost = 0;
let pendingDraws = 0;
let pendingResults = [];
let pendingHighestStar = 4;
let GLOBAL_UNIT_IMAGES = {};
let GLOBAL_UNIT_IMAGE_FOCUS = {};
let sixStarCounts = {};
const TOKEN_POTENTIAL_CAP = 6;
let sharedSixPityNonStandard = 0;

function isSharedSixPityPool(poolKey) {
    return poolKey !== 'standard';
}

function buildUnits(extraUnits = {}) {
    return {
        6: [...COMMON_UNITS[6], ...(extraUnits[6] || [])],
        5: [...COMMON_UNITS[5], ...(extraUnits[5] || [])],
        4: [...COMMON_UNITS[4], ...(extraUnits[4] || [])]
    };
}

function normalizeConfig(rawConfig) {
    const config = rawConfig || DEFAULT_CONFIG;
    COMMON_UNITS = config.commonUnits || DEFAULT_CONFIG.commonUnits;
    GLOBAL_UNIT_IMAGES = config.unitImages || {};
    GLOBAL_UNIT_IMAGE_FOCUS = config.unitImageFocus || {};

    POOL_CONFIG = {};
    (config.pools || []).forEach((pool, index) => {
        const key = pool.key || `pool_${index + 1}`;
        POOL_CONFIG[key] = {
            key,
            tabLabel: pool.tabLabel || pool.title || `卡池${index + 1}`,
            title: pool.title || pool.tabLabel || `卡池${index + 1}`,
            subtitle: pool.subtitle || "",
            subtitleColor: pool.subtitleColor || "var(--accent-red)",
            panelGradient: pool.panelGradient || "linear-gradient(to right, rgba(211, 47, 47, 0.08) 0%, rgba(211, 47, 47, 0.35) 100%)",
            featured6: pool.featured6 || null,
            infoHtml: pool.infoHtml || "",
            unitImages: pool.unitImages || {},
            unitImageFocus: pool.unitImageFocus || {},
            units: pool.units || buildUnits(pool.extraUnits || {})
        };
    });
}

function getImageCandidates(unitName, poolKey) {
    const pool = POOL_CONFIG[poolKey] || {};
    const explicitPath = (pool.unitImages && pool.unitImages[unitName]) || GLOBAL_UNIT_IMAGES[unitName];
    if (explicitPath) {
        return [explicitPath];
    }

    return [
        `images/${unitName}.png`,
        `images/${unitName}.webp`,
        `images/${unitName}.jpg`,
        `images/${unitName}.jpeg`
    ];
}

function getImageFocus(unitName, poolKey) {
    const pool = POOL_CONFIG[poolKey] || {};
    return (pool.unitImageFocus && pool.unitImageFocus[unitName])
        || GLOBAL_UNIT_IMAGE_FOCUS[unitName]
        || '50% 22%';
}

function renderSixStarStats() {
    const statsEl = document.getElementById('sixStarStats');
    if (!statsEl) return;

    const entries = Object.entries(sixStarCounts).sort((a, b) => {
        const totalA = (a[1].draws || 0) + (a[1].tokens || 0);
        const totalB = (b[1].draws || 0) + (b[1].tokens || 0);
        return totalB - totalA || a[0].localeCompare(b[0], 'zh-Hant');
    });
    if (entries.length === 0) {
        statsEl.innerHTML = '<div class="sixstar-title">六星統計</div><div class="sixstar-item" style="color:#888;">尚未抽到六星</div>';
        return;
    }

    const lines = entries.map(([name, stat]) => {
        const drawCount = stat.draws || 0;
        const tokenCount = stat.tokens || 0;
        const display = tokenCount > 0 ? `${drawCount}+${tokenCount}` : `${drawCount}`;
        const isMaxed = (drawCount + tokenCount) >= TOKEN_POTENTIAL_CAP;
        return `<div class="sixstar-item">${name} <span class="sixstar-mark${isMaxed ? ' maxed' : ''}">${display}</span>${isMaxed ? ' <span class="sixstar-full">已滿潛</span>' : ''}</div>`;
    }).join('');
    statsEl.innerHTML = `<div class="sixstar-title">六星統計</div>${lines}`;
}

function incrementSixStarCount(unitName) {
    if (!sixStarCounts[unitName]) {
        sixStarCounts[unitName] = { draws: 0, tokens: 0 };
    }
    sixStarCounts[unitName].draws += 1;
}

function incrementSixStarToken(unitName) {
    if (!unitName) return;
    if (!sixStarCounts[unitName]) {
        sixStarCounts[unitName] = { draws: 0, tokens: 0 };
    }
    sixStarCounts[unitName].tokens += 1;
}

function getTokenMarkMeta(tokenCount) {
    const display = `M+${tokenCount}`;
    const isMaxed = tokenCount >= TOKEN_POTENTIAL_CAP;
    return { display, isMaxed };
}

function setCharacterVisualGlow(star) {
    const visualEl = document.getElementById('characterVisual');
    if (!visualEl) return;

    visualEl.classList.remove('visual-glow-4', 'visual-glow-5', 'visual-glow-6');
    if (star >= 6) {
        visualEl.classList.add('visual-glow-6');
    } else if (star >= 5) {
        visualEl.classList.add('visual-glow-5');
    } else {
        visualEl.classList.add('visual-glow-4');
    }
}

function clearCharacterVisualGlow() {
    const visualEl = document.getElementById('characterVisual');
    if (!visualEl) return;
    visualEl.classList.remove('visual-glow-4', 'visual-glow-5', 'visual-glow-6');
}

function setImageWithFallback(imageEl, candidates, onLoaded, onExhausted) {
    let candidateIndex = 0;

    const tryNext = () => {
        if (candidateIndex >= candidates.length) {
            if (onExhausted) onExhausted();
            return;
        }

        const currentPath = candidates[candidateIndex];
        candidateIndex += 1;

        imageEl.onload = () => {
            imageEl.onload = null;
            imageEl.onerror = null;
            if (onLoaded) onLoaded(currentPath);
        };
        imageEl.onerror = tryNext;
        imageEl.src = currentPath;
    };

    tryNext();
}

function updateCharacterVisual(unitName, star, poolKey) {
    const imageEl = document.getElementById('characterImage');
    const stripEl = document.getElementById('characterStrip');
    const placeholderEl = document.getElementById('characterPlaceholder');
    const captionEl = document.getElementById('characterCaption');
    if (!imageEl || !stripEl || !placeholderEl || !captionEl) return;

    stripEl.hidden = true;
    stripEl.innerHTML = '';
    imageEl.style.objectPosition = getImageFocus(unitName, poolKey);
    setCharacterVisualGlow(star);

    const candidates = getImageCandidates(unitName, poolKey);

    const showFallback = () => {
        imageEl.hidden = true;
        imageEl.removeAttribute('src');
        placeholderEl.innerText = `${unitName}\n(尚未設定圖片)`;
        captionEl.innerText = `★${star} ${unitName}`;
        captionEl.style.display = 'inline-flex';
    };

    setImageWithFallback(
        imageEl,
        candidates,
        () => {
            imageEl.hidden = false;
            placeholderEl.innerText = '';
            captionEl.innerText = `★${star} ${unitName}`;
            captionEl.style.display = 'inline-flex';
        },
        showFallback
    );
}

function updateCharacterStrip(records, poolKey) {
    const imageEl = document.getElementById('characterImage');
    const stripEl = document.getElementById('characterStrip');
    const placeholderEl = document.getElementById('characterPlaceholder');
    const captionEl = document.getElementById('characterCaption');
    if (!imageEl || !stripEl || !placeholderEl || !captionEl) return;

    imageEl.hidden = true;
    imageEl.removeAttribute('src');
    captionEl.style.display = 'none';
    placeholderEl.innerText = '';
    stripEl.innerHTML = '';
    stripEl.hidden = false;
    clearCharacterVisualGlow();

    records.slice(0, 10).forEach((record) => {
        const tile = document.createElement('div');
        tile.className = `character-tile rarity-${record.star}`;

        const tileImage = document.createElement('img');
        tileImage.className = 'character-tile-image';
        tileImage.alt = `★${record.star} ${record.result}`;
        tileImage.style.objectPosition = getImageFocus(record.result, poolKey);

        const fallback = document.createElement('div');
        fallback.className = 'character-tile-fallback';
        fallback.innerText = `★${record.star}\n${record.result}`;

        const candidates = getImageCandidates(record.result, poolKey);
        setImageWithFallback(
            tileImage,
            candidates,
            () => {
                tileImage.hidden = false;
                fallback.style.display = 'none';
            },
            () => {
                tileImage.hidden = true;
                fallback.style.display = 'flex';
            }
        );

        tile.appendChild(tileImage);
        tile.appendChild(fallback);
        stripEl.appendChild(tile);
    });
}

function initPoolState() {
    sharedSixPityNonStandard = 0;
    poolPityState = Object.fromEntries(
        Object.entries(POOL_CONFIG).map(([poolKey, pool]) => [
            poolKey,
            {
                drawsWithoutFive: 0,
                drawsWithoutSix: 0,
                drawsWithoutFeatured6: 0,
                featured6CounterActive: Boolean(pool.featured6),
                drawsSinceTokenCounterStart: 0,
                tokensObtained: 0
            }
        ])
    );
}

function renderPoolTabs() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = "";

    Object.values(POOL_CONFIG).forEach((pool, index) => {
        const tab = document.createElement('div');
        tab.className = `pool-tab ${index === 0 ? 'active' : ''}`;
        tab.dataset.pool = pool.key;
        const label = document.createElement('div');
        label.className = 'pool-tab-label';
        label.innerText = pool.tabLabel;
        tab.appendChild(label);
        tab.addEventListener('click', () => switchPool(pool.key));
        sidebar.appendChild(tab);
    });
}

function updatePityIndicator() {
    const pityState = poolPityState[currentPool];
    const pool = POOL_CONFIG[currentPool];
    const baseSixRate = 0.8;
    const softPityBonus = pityState.drawsWithoutSix >= 65
        ? (pityState.drawsWithoutSix - 64) * 5
        : 0;
    const currentSixRate = Math.min(baseSixRate + softPityBonus, 100);
    const remainingFive = 10 - pityState.drawsWithoutFive;
    const hardPityCounter = isSharedSixPityPool(currentPool) ? sharedSixPityNonStandard : pityState.drawsWithoutSix;
    const remainingSix = 80 - hardPityCounter;
    const featuredText = pool.featured6
        ? (pityState.featured6CounterActive
            ? `<br>僅限一次 ${120 - pityState.drawsWithoutFeatured6}次內尋訪必得${pool.featured6}`
            : `<br>${240 - pityState.drawsSinceTokenCounterStart}次尋訪後可獲得信物`)
        : "";
    document.getElementById('pityIndicator').innerHTML = `當前六星率：${currentSixRate.toFixed(1)}%<br>剩餘${remainingFive}次內必得五星以上幹員<br>剩餘${remainingSix}次內必得六星幹員${featuredText}`;
}

function updateCostBadge() {
    const amount = totalCost.toLocaleString('zh-TW');
    const originite = (totalCost / 75).toFixed(2);
    const twd = ((totalCost / 75) * 10.3).toFixed(2);
    document.getElementById('costBadge').innerText = `使用的嵌晶玉：${amount}\n約 ${originite} 源石 | 約 NT$${twd}`;
}

function resetTracking() {
    totalCost = 0;
    sixStarCounts = {};

    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.innerHTML = '<div style="color: #666;">近期抽取紀錄...</div>';
    }

    updateCostBadge();
    renderSixStarStats();
}

function switchPool(poolKey) {
    const pool = POOL_CONFIG[poolKey];
    if (!pool) return;

    currentPool = poolKey;

    document.getElementById('infoTitle').innerText = pool.title;
    const subtitleElement = document.getElementById('infoSubtitle');
    subtitleElement.innerText = pool.subtitle;
    subtitleElement.style.color = pool.subtitleColor || 'var(--accent-red)';
    document.getElementById('infoText').innerHTML = pool.infoHtml;
    document.getElementById('infoPanel').style.background = pool.panelGradient;

    document.querySelectorAll('.pool-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.pool === poolKey);
    });

    updatePityIndicator();
}

function drawUnitByStar(star, pool) {
    const candidates = pool.units[star];

    if (star !== 6 || !pool.featured6 || !candidates.includes(pool.featured6)) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    if (candidates.length === 1) {
        return candidates[0];
    }

    // 抽到 6 星時，指定角色吃掉全部 6 星中的 50% 機率
    if (Math.random() < 0.5) {
        return pool.featured6;
    }

    const others = candidates.filter((name) => name !== pool.featured6);
    return others[Math.floor(Math.random() * others.length)];
}

function clonePityState(state) {
    return {
        drawsWithoutFive: state.drawsWithoutFive,
        drawsWithoutSix: state.drawsWithoutSix,
        drawsWithoutFeatured6: state.drawsWithoutFeatured6,
        featured6CounterActive: state.featured6CounterActive,
        drawsSinceTokenCounterStart: state.drawsSinceTokenCounterStart,
        tokensObtained: state.tokensObtained || 0
    };
}

function simulateBatchOutcomes(times, pool, originalPityState, poolKey, sharedSixPityBase) {
    const pityState = clonePityState(originalPityState);
    let sharedSixPity = sharedSixPityBase;
    const records = [];
    let maxStar = 4;

    for (let i = 0; i < times; i++) {
        const baseSixRate = 0.8;
        const fiveRate = 8.0;
        const softPityBonus = pityState.drawsWithoutSix >= 65
            ? (pityState.drawsWithoutSix - 64) * 5
            : 0;
        const sixRate = Math.min(baseSixRate + softPityBonus, 100);
        const fiveThreshold = Math.min(sixRate + fiveRate, 100);
        const rand = Math.random() * 100;
        let star = 4;
        if (rand < sixRate) star = 6;
        else if (rand < fiveThreshold) star = 5;

        const forceFeatured6 = Boolean(pool.featured6)
            && pityState.featured6CounterActive
            && pityState.drawsWithoutFeatured6 >= 119;
        if (forceFeatured6) {
            star = 6;
        }

        const hardPityCounter = isSharedSixPityPool(poolKey) ? sharedSixPity : pityState.drawsWithoutSix;
        if (hardPityCounter >= 79 && star < 6) {
            star = 6;
        }
        else if (pityState.drawsWithoutFive >= 9 && star < 5) {
            star = 5;
        }

        if (star === 6) {
            pityState.drawsWithoutFive = 0;
            pityState.drawsWithoutSix = 0;
            if (isSharedSixPityPool(poolKey)) {
                sharedSixPity = 0;
            }
        } else if (star === 5) {
            pityState.drawsWithoutFive = 0;
            pityState.drawsWithoutSix += 1;
            if (isSharedSixPityPool(poolKey)) {
                sharedSixPity += 1;
            }
        } else {
            pityState.drawsWithoutFive += 1;
            pityState.drawsWithoutSix += 1;
            if (isSharedSixPityPool(poolKey)) {
                sharedSixPity += 1;
            }
        }

        const result = forceFeatured6 ? pool.featured6 : drawUnitByStar(star, pool);

        let tokenObtainedThisDraw = false;
        if (pool.featured6 && pityState.featured6CounterActive) {
            if (result === pool.featured6) {
                pityState.featured6CounterActive = false;
            } else {
                pityState.drawsWithoutFeatured6 += 1;
            }
        }

        if (pool.featured6) {
            pityState.drawsSinceTokenCounterStart += 1;
            if (pityState.drawsSinceTokenCounterStart >= 240) {
                pityState.drawsSinceTokenCounterStart = 0;
                pityState.tokensObtained = (pityState.tokensObtained || 0) + 1;
                tokenObtainedThisDraw = true;
            }
        }

        records.push({ star, result, tokenObtained: tokenObtainedThisDraw, tokenIndex: pityState.tokensObtained || 0 });
        maxStar = Math.max(maxStar, star);
    }

    return { records, maxStar };
}

function applyLeverGlow(star, intensity = 'strong') {
    const lever = document.getElementById('lever');
    const container = document.querySelector('.lever-container');
    lever.classList.remove('glow-4', 'glow-5', 'glow-6', 'pre-glow-4', 'pre-glow-5', 'pre-glow-6');
    container.classList.remove('glow-4', 'glow-5', 'glow-6', 'pre-glow-4', 'pre-glow-5', 'pre-glow-6');

    const prefix = intensity === 'soft' ? 'pre-glow' : 'glow';
    if (star >= 6) {
        lever.classList.add(`${prefix}-6`);
        container.classList.add(`${prefix}-6`);
    }
    else if (star >= 5) {
        lever.classList.add(`${prefix}-5`);
        container.classList.add(`${prefix}-5`);
    }
    else {
        lever.classList.add(`${prefix}-4`);
        container.classList.add(`${prefix}-4`);
    }
}

function clearLeverGlow() {
    const lever = document.getElementById('lever');
    const container = document.querySelector('.lever-container');
    lever.classList.remove('glow-4', 'glow-5', 'glow-6', 'pre-glow-4', 'pre-glow-5', 'pre-glow-6');
    container.classList.remove('glow-4', 'glow-5', 'glow-6', 'pre-glow-4', 'pre-glow-5', 'pre-glow-6');
}

function updateLeverGlowByProgress(progress, star) {
    if (progress < 0.3) {
        clearLeverGlow();
        return;
    }

    if (progress < 0.58) {
        applyLeverGlow(star, 'soft');
        return;
    }

    applyLeverGlow(star, 'strong');
}

function computeLeverTravel(deltaY, maxTravel) {
    const clampedDelta = Math.max(0, deltaY);
    const stage1Limit = 96;
    const stage2Limit = 182;

    if (clampedDelta <= stage1Limit) {
        return Math.min(clampedDelta, maxTravel);
    }

    if (clampedDelta <= stage2Limit) {
        const stage1Travel = stage1Limit;
        const stage2Travel = (clampedDelta - stage1Limit) * 0.48;
        return Math.min(stage1Travel + stage2Travel, maxTravel);
    }

    const stage1Travel = stage1Limit;
    const stage2Travel = (stage2Limit - stage1Limit) * 0.48;
    const stage3Travel = (clampedDelta - stage2Limit) * 0.78;
    return Math.min(stage1Travel + stage2Travel + stage3Travel, maxTravel);
}

function shouldSkipLever() {
    const toggle = document.getElementById('skipLeverToggle');
    return Boolean(toggle && toggle.checked);
}

function gacha(times) {
    pendingDraws = times;
    const overlay = document.getElementById('pull-overlay');
    const lever = document.getElementById('lever');
    const pool = POOL_CONFIG[currentPool];
    const pityState = poolPityState[currentPool];

    const preview = simulateBatchOutcomes(times, pool, pityState, currentPool, sharedSixPityNonStandard);
    pendingResults = preview.records;
    pendingHighestStar = preview.maxStar;

    if (shouldSkipLever()) {
        performGachaLogic(times, pendingResults);
        pendingDraws = 0;
        pendingResults = [];
        pendingHighestStar = 4;
        return;
    }

    lever.style.transition = 'none';
    lever.style.top = '0px';
    clearLeverGlow();
    overlay.style.display = 'flex';
}

function performGachaLogic(times, precomputedResults = null) {
    const historyList = document.getElementById('historyList');
    const pool = POOL_CONFIG[currentPool];
    const pityState = poolPityState[currentPool];
    const costPerDraw = 500;
    totalCost += times * costPerDraw;
    let showcasedDraw = null;
    const drawnRecords = [];

    for (let i = 0; i < times; i++) {
        const hasPrecomputed = Array.isArray(precomputedResults) && precomputedResults[i];
        let star;
        let result;

        if (hasPrecomputed) {
            star = precomputedResults[i].star;
            result = precomputedResults[i].result;
        } else {
            const baseSixRate = 0.8;
            const fiveRate = 8.0;
            const softPityBonus = pityState.drawsWithoutSix >= 65
                ? (pityState.drawsWithoutSix - 64) * 5
                : 0;
            const sixRate = Math.min(baseSixRate + softPityBonus, 100);
            const fiveThreshold = Math.min(sixRate + fiveRate, 100);
            const rand = Math.random() * 100;
            star = 4;
            if (rand < sixRate) star = 6;
            else if (rand < fiveThreshold) star = 5;

            const forceFeatured6 = Boolean(pool.featured6)
                && pityState.featured6CounterActive
                && pityState.drawsWithoutFeatured6 >= 119;
            if (forceFeatured6) {
                star = 6;
            }

            const hardPityCounter = isSharedSixPityPool(currentPool) ? sharedSixPityNonStandard : pityState.drawsWithoutSix;
            if (hardPityCounter >= 79 && star < 6) {
                star = 6;
            }
            else if (pityState.drawsWithoutFive >= 9 && star < 5) {
                star = 5;
            }

            result = forceFeatured6 ? pool.featured6 : drawUnitByStar(star, pool);
        }

        if (star === 6) {
            pityState.drawsWithoutFive = 0;
            pityState.drawsWithoutSix = 0;
            if (isSharedSixPityPool(currentPool)) {
                sharedSixPityNonStandard = 0;
            }
        } else if (star === 5) {
            pityState.drawsWithoutFive = 0;
            pityState.drawsWithoutSix += 1;
            if (isSharedSixPityPool(currentPool)) {
                sharedSixPityNonStandard += 1;
            }
        } else {
            pityState.drawsWithoutFive += 1;
            pityState.drawsWithoutSix += 1;
            if (isSharedSixPityPool(currentPool)) {
                sharedSixPityNonStandard += 1;
            }
        }

        let tokenObtainedThisDraw = false;

        if (pool.featured6 && pityState.featured6CounterActive) {
            if (result === pool.featured6) {
                pityState.featured6CounterActive = false;
            } else {
                pityState.drawsWithoutFeatured6 += 1;
            }
        }

        // 信物計數器與機率無關，有 featured 的池從第一抽就開始計數，每 240 抽循環一次
        if (pool.featured6) {
            pityState.drawsSinceTokenCounterStart += 1;
            if (pityState.drawsSinceTokenCounterStart >= 240) {
                pityState.drawsSinceTokenCounterStart = 0;
                pityState.tokensObtained = (pityState.tokensObtained || 0) + 1;
                tokenObtainedThisDraw = true;
            }
        }

        // 建立歷史紀錄元素
        const entry = document.createElement('div');
        entry.className = `history-item rarity-${star}`;
        if (tokenObtainedThisDraw) {
            const tokenMeta = getTokenMarkMeta(pityState.tokensObtained);
            entry.innerHTML = `★${star} ${result} <span class="token-mark${tokenMeta.isMaxed ? ' maxed' : ''}">${tokenMeta.display}</span>${tokenMeta.isMaxed ? ' <span class="token-full">已滿潛</span>' : ''}`;
        } else {
            entry.innerText = `★${star} ${result}`;
        }

        // 插入到最前面
        if (historyList) {
            historyList.insertBefore(entry, historyList.firstChild);
        }

        if (star === 6) {
            incrementSixStarCount(result);
        }

        if (tokenObtainedThisDraw) {
            incrementSixStarToken(pool.featured6);
        }

        drawnRecords.push({ star, result });

        if (!showcasedDraw || star > showcasedDraw.star) {
            showcasedDraw = { star, result };
        }
    }

    if (times >= 10) {
        updateCharacterStrip(drawnRecords, currentPool);
    } else if (showcasedDraw) {
        updateCharacterVisual(showcasedDraw.result, showcasedDraw.star, currentPool);
    }

    renderSixStarStats();
    updatePityIndicator();
    updateCostBadge();
}

function executeDraw() {
    const overlay = document.getElementById('pull-overlay');
    overlay.style.display = 'none';
    clearLeverGlow();

    if (pendingDraws > 0) {
        performGachaLogic(pendingDraws, pendingResults);
    }

    pendingDraws = 0;
    pendingResults = [];
    pendingHighestStar = 4;
}

function setupLeverControls() {
    const lever = document.getElementById('lever');
    const maxTravel = 248;
    const triggerTravel = 228;
    let isDragging = false;
    let startY = 0;

    lever.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        clearLeverGlow();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaY = e.clientY - startY;
        const move = computeLeverTravel(deltaY, maxTravel);
        lever.style.top = `${move}px`;
        updateLeverGlowByProgress(move / maxTravel, pendingHighestStar);

        if (move > triggerTravel) {
            isDragging = false;
            executeDraw();
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        clearLeverGlow();
        lever.style.transition = 'top 0.3s';
        lever.style.top = '0px';
        setTimeout(() => {
            lever.style.transition = 'none';
        }, 300);
    });
}

async function initApp() {
    let jsonConfig = null;
    try {
        const response = await fetch('config.json');
        if (response.ok) {
            jsonConfig = await response.json();
        }
    } catch (error) {
        jsonConfig = null;
    }

    normalizeConfig(jsonConfig || DEFAULT_CONFIG);
    initPoolState();
    renderPoolTabs();

    const firstPoolKey = Object.keys(POOL_CONFIG)[0];
    if (firstPoolKey) {
        currentPool = firstPoolKey;
        switchPool(currentPool);
    }

    updateCostBadge();
    renderSixStarStats();
    setupLeverControls();
}

initApp();
