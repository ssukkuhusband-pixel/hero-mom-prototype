// ============================================================
// Hero Mom Prototype - Enhanced Version
// 1. 초반 흐름 + 토스트   2. 전리품 다양화
// 3. 가구 업그레이드      4. 모험 실황 뷰
// 5. 농사 시스템
// ============================================================

// --- Toast System (replaces all alert()) ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const MAX_TOASTS = 4;
    const DEDUPE_WINDOW_MS = 1200;
    const now = Date.now();
    const key = `${type}:${String(msg || '')}`;

    // If the newest toast is identical, coalesce to avoid spam covering the UI.
    const newest = container.firstElementChild;
    if (newest && newest.dataset && newest.dataset.key === key) {
        const lastAt = parseInt(newest.dataset.at || '0', 10) || 0;
        if ((now - lastAt) <= DEDUPE_WINDOW_MS) {
            const n = (parseInt(newest.dataset.count || '1', 10) || 1) + 1;
            newest.dataset.count = String(n);
            newest.dataset.at = String(now);
            newest.innerText = n >= 2 ? `${msg} ×${n}` : String(msg || '');
            return;
        }
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    toast.dataset.key = key;
    toast.dataset.count = '1';
    toast.dataset.at = String(now);

    // Newest on top
    container.prepend(toast);

    // Hard cap visible toasts
    while (container.children.length > MAX_TOASTS) {
        const last = container.lastElementChild;
        if (!last) break;
        last.remove();
    }
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2600);
}

// --- Pause / Time Freeze (used by important popups) ---
let isGamePaused = false;
let pauseStartedAtMs = 0;
let pauseReason = null;

function pauseGame(reason = '') {
    if (isGamePaused) return;
    isGamePaused = true;
    pauseStartedAtMs = Date.now();
    pauseReason = reason || null;
}

function resumeGame() {
    if (!isGamePaused) return;
    const now = Date.now();
    const dt = Math.max(0, now - (pauseStartedAtMs || now));
    isGamePaused = false;
    pauseStartedAtMs = 0;
    pauseReason = null;
    shiftRealtimeDeadlinesBy(dt);
}

function shiftRealtimeDeadlinesBy(dtMs) {
    const dt = Math.max(0, Math.floor(dtMs || 0));
    if (!dt) return;
    // Requests use Date.now() deadlines; pause should freeze them.
    try {
        ensureRequestState();
        for (const r of (gameState.son.requests || [])) {
            if (!r || r.status !== 'open') continue;
            if (Number.isFinite(r.dueAt)) r.dueAt += dt;
        }
    } catch (e) {
        console.warn('shiftRealtimeDeadlinesBy failed:', e);
    }
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// --- Game State ---
const SAVE_KEY = 'hero_mom_2_save_v1';
const DEFAULT_GAME_STATE = {
    worldTick: 0,
	    parent: {
	        gold: 500,
	        audio: { bgmEnabled: true, bgmVolume: 0.22 },
	        smithy: { level: 1, xp: 0 },
	        mailUnread: 0,
	        sonUiTab: 'summary', // 'summary' | 'gear' | 'world'
	        supportPin: null, // { type, ... }
	        uiLocks: { wardrobe: false },
        shop: { uiTab: 'grocery' },
        work: { level: 1, xp: 0, energy: 10, maxEnergy: 10, energyTimer: 20 },
        worldCodex: { zones: {} },
        bossSeals: {}, // { [zoneId]: true }
        furniture: {
            equipped: { bed: 'bed_basic', table: 'table_basic', desk: 'desk_basic', dummy: 'dummy_basic' },
            owned: { bed_basic: true, table_basic: true, desk_basic: true, dummy_basic: true }
        },
        upgrades: { bed: 1, table: 1, dummy: 1, desk: 1 },
        inventory: {
            'steak': { name: '🥩 최고급 스테이크', count: 0, type: 'kitchen' },
            'homemade_meal': { name: '🍲 집밥 정식', count: 0, type: 'kitchen' },
            'herb_potion': { name: '🧪 약초 물약', count: 0, type: 'kitchen' },
            'book_hero': { name: '📘 영웅학 개론', count: 0, type: 'study' },
            'sandbag': { name: '🏋️ 모래주머니', count: 0, type: 'training' }
        },
        gearInventory: {
            helmet: {
                leather_helmet: { id: 'leather_helmet', name: '가죽 투구', def: 2, count: 0, cost: 200 }
            },
            armor: {
                leather_armor: { id: 'leather_armor', name: '가죽 갑옷', def: 4, count: 0, cost: 350 }
            },
            boots: {
                leather_boots: { id: 'leather_boots', name: '가죽 신발', def: 1, count: 0, cost: 180 }
            }
        },
        weaponInventory: {
            'C': { name: '낡은 목검', atk: 2, count: 1 },
            'B': { name: '강철 단검', atk: 5, count: 0 },
            'A': { name: '기사의 장검', atk: 20, count: 0 },
            'S': { name: '🗡️ 드래곤 슬레이어', atk: 100, count: 0 }
        },
        specialWeaponInventory: {
            wolf_sword: { id: 'wolf_sword', name: '🐺 늑대의 보검', atk: 14, tier: 'B', count: 0 },
            relic_sword: { id: 'relic_sword', name: '🏛️ 유적의 보검', atk: 38, tier: 'A', count: 0 },
            dragon_sword: { id: 'dragon_sword', name: '🐉 드래곤 스워드', atk: 120, tier: 'S', count: 0 }
        },
        // Loot storage from adventures
        loot: {
            'herb': { name: '🌿 약초', count: 2 },
            'monster_bone': { name: '🦴 몬스터 뼈', count: 0 },
            'magic_crystal': { name: '💎 마법 결정', count: 0 },
            'rare_hide': { name: '🧶 희귀 가죽', count: 0 },
            'leather': { name: '🧵 가죽', count: 0 },
            'steel': { name: '🪨 강철', count: 0 },
            'iron_scrap': { name: '🧩 철 조각', count: 0 },
            'arcane_dust': { name: '✨ 마력 가루', count: 0 }
        },
        // Farm system
        farm: {
            plots: [
                { state: 'empty', timer: 0 },
                { state: 'empty', timer: 0 },
                { state: 'empty', timer: 0 }
            ],
            seed: 6,
            level: 1,
            xp: 0
        }
    },
    rooms: {
        'room-bed': { placedItem: null },
        'room-table': { placedItem: null },
        'room-desk': { placedItem: null },
        'room-dummy': { placedItem: null }
    },
    son: {
        level: 1, exp: 0, maxExp: 100,
        hp: 60, maxHp: 100,
        hunger: 50, maxHunger: 100,
        state: 'IDLE', currentRoom: 'room-desk',
        homeActionCount: 0, // counts completed home actions; used to force adventures after enough routines
        network: {
            contacts: [], // [{ id, kind, name, desc, metTick, tags: [] }]
            buddy: null,  // { id, name, desc, cpBonus, adventuresLeft }
            aspiration: null // 'strength' | 'magic' | 'archery' | null
        },
        stats: {
            physAtk: 0,
            magicAtk: 0,
            magicRes: 0,
            agility: 0,
            accuracy: 0
        },
        equipment: {
            weapon: { id: 'weapon_C', name: '몽둥이', atk: 1, def: 0, tier: 'C' },
            helmet: { id: 'none_helmet', name: '맨머리', atk: 0, def: 0, tier: 'C' },
            armor: { id: 'none_armor', name: '허름한 옷', atk: 0, def: 0, tier: 'C' },
            boots: { id: 'none_boots', name: '맨발', atk: 0, def: 0, tier: 'C' }
        },
        actionTimer: 0,
        affinity: { trust: 50, affection: 50, rebellion: 0 },
        personality: {
            bravery: 50,
            diligence: 50,
            morality: 50,     // 선함(0~100) ↔ 악함
            flexibility: 50,  // 완고(0~100) ↔ 유연
            endurance: 50,    // 인내
            intelligence: 50, // 지능
            calmness: 50,     // 차분함
            focus: 50         // 집중력
        }, // bravery: 대담(0~100), diligence: 성실(0~100)
        trainingMastery: { strength: 0, magic: 0, archery: 0 },
        injury: null, // { severity, label, remaining, cpMul, riskMul, healMul, hungerDrain }
        plannedGoal: null, // { zoneId, missionId, diffKey, cp }
        requests: [], // [{ id, kind, title, desc, help, createdAt, dueAt, status, data }]
        objective: null, // { id, type, zoneId, missionId, targetIntel, targetPct, createdTick, tries }
        adventure: null,
        adventureEncouraged: false,
        nextAdventureBuff: null // { id, name, desc, expMul, goldMul, lootMul, riskMul, fatigueAdd, source }
    },
    firstAdventureDone: false
};

let gameState = deepClone(DEFAULT_GAME_STATE);

function saveGame() {
    try {
        const payload = { v: 1, savedAt: Date.now(), state: gameState };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('saveGame failed', e);
    }
}

function mergeDeep(base, incoming) {
    if (!incoming || typeof incoming !== 'object') return base;
    if (Array.isArray(incoming)) return incoming.slice();
    if (!base || typeof base !== 'object' || Array.isArray(base)) base = {};
    for (const [k, v] of Object.entries(incoming)) {
        if (v && typeof v === 'object') {
            base[k] = mergeDeep(base[k], v);
        } else {
            base[k] = v;
        }
    }
    return base;
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || payload.v !== 1 || !payload.state) return false;
        const merged = deepClone(DEFAULT_GAME_STATE);
        mergeDeep(merged, payload.state);
        gameState = merged;
        // Ensure newly added systems exist
        ensureSmithy();
        ensureShopState();
        ensureLibraryState();
        ensureFarm();
        ensureWorkState();
        ensureAudioState();
        ensureWorldCodexState();
        ensureBossSealState();
        ensureSonUiState();
        ensureSupportPinState();
        ensureMaterialRequestState();
        ensureSonBehaviorState();
        ensureNetworkState();
        cleanupLegacyParentSettings();
        ensureRequestState();
        ensureObjectiveState();
        sanitizeMailboxLog();
        ensureMailPhotoHistory();
        return true;
    } catch (e) {
        console.warn('loadGame failed', e);
        return false;
    }
}

function resetGame() {
    const ok = window.confirm('정말 초기화할까요? (저장된 데이터가 모두 삭제됩니다)');
    if (!ok) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    window.location.reload();
}
window.resetGame = resetGame;

function ensureAudioState() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    if (!gameState.parent.audio || typeof gameState.parent.audio !== 'object') {
        gameState.parent.audio = { bgmEnabled: true, bgmVolume: 0.22 };
    }
    const a = gameState.parent.audio;
    if (typeof a.bgmEnabled !== 'boolean') a.bgmEnabled = true;
    if (!Number.isFinite(a.bgmVolume)) a.bgmVolume = 0.22;
    a.bgmVolume = Math.max(0, Math.min(1, a.bgmVolume));
}

// ============================================================
// BGM (assets/sound/bgm.mp3)
// NOTE: Most browsers require a user gesture to start audio.
// ============================================================
let bgmGestureHooked = false;

function applyBgmButtonUI() {
    if (!els.btnBgm) return;
    ensureAudioState();
    const on = !!gameState.parent.audio.bgmEnabled;
    els.btnBgm.innerHTML = `<span>${on ? '🔊' : '🔇'}</span>`;
    els.btnBgm.title = on ? '배경음: 켜짐' : '배경음: 꺼짐';
}

async function tryPlayBgm() {
    const audio = els.bgm;
    if (!audio) return false;
    ensureAudioState();
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, gameState.parent.audio.bgmVolume ?? 0.22));
    try {
        await audio.play();
        return true;
    } catch (e) {
        return false;
    }
}

function stopBgm() {
    const audio = els.bgm;
    if (!audio) return;
    try { audio.pause(); } catch (e) {}
}

function setBgmEnabled(enabled) {
    ensureAudioState();
    gameState.parent.audio.bgmEnabled = !!enabled;
    applyBgmButtonUI();
    if (!els.bgm) return;
    if (gameState.parent.audio.bgmEnabled) {
        // Start after a gesture if needed
        void tryPlayBgm();
    } else {
        stopBgm();
    }
    saveGame();
}

function toggleBgm() {
    ensureAudioState();
    setBgmEnabled(!gameState.parent.audio.bgmEnabled);
}
window.toggleBgm = toggleBgm;

function initBgm() {
    ensureAudioState();
    if (!els.btnBgm || !els.bgm) {
        if (els.btnBgm) els.btnBgm.style.display = 'none';
        return;
    }
    applyBgmButtonUI();

    // Attempt (may fail until user gesture)
    if (gameState.parent.audio.bgmEnabled) {
        void tryPlayBgm();
    }

    if (!bgmGestureHooked) {
        bgmGestureHooked = true;
        const unlock = async () => {
            if (!gameState.parent.audio.bgmEnabled) return;
            const ok = await tryPlayBgm();
            if (ok) {
                document.removeEventListener('pointerdown', unlock, true);
                document.removeEventListener('keydown', unlock, true);
            }
        };
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
    }

    document.addEventListener('visibilitychange', () => {
        const audio = els.bgm;
        if (!audio) return;
        if (document.hidden) {
            stopBgm();
        } else if (gameState.parent.audio.bgmEnabled) {
            void tryPlayBgm();
        }
    });
}

// --- Upgrade Costs & Effects ---
const upgradeData = {
    bed: {
        costs: [0, 200, 500, 1200, 3000],
        names: ['허름한 침대', '나무 침대', '푹신한 침대', '고급 침대', '왕실 침대'],
        effects: [40, 50, 65, 80, 100], // HP recovery amount
        emoji: '🛏️'
    },
    desk: {
        costs: [0, 250, 600, 1500, 3500],
        names: ['낡은 책상', '나무 책상', '학자의 책상', '마법 책상', '현자의 서재'],
        effects: [15, 20, 30, 45, 60], // EXP gain
        emoji: '📚'
    },
    table: {
        costs: [0, 200, 500, 1200, 3000],
        names: ['빈 식탁', '나무 식탁', '요리 식탁', '고급 식탁', '왕실 식탁'],
        effects: [30, 40, 55, 70, 90], // Hunger recovery
        emoji: '🍽️'
    },
    dummy: {
        costs: [0, 300, 700, 1800, 4000],
        names: ['허수아비', '나무 인형', '강철 인형', '마법 인형', '전설의 표적'],
        effects: [25, 30, 45, 60, 80], // EXP gain from training
        emoji: '🤺'
    }
};

function clampLevel(type, level) {
    const def = upgradeData[type];
    if (!def) return 1;
    const maxLv = Math.max(1, def.effects.length);
    return Math.max(1, Math.min(maxLv, Math.floor(level || 1)));
}

function getUpgradeEffectValue(type, level) {
    const def = upgradeData[type];
    if (!def) return 0;
    const lv = clampLevel(type, level);
    return def.effects[lv - 1] || 0;
}

function getUpgradeEffectLabel(type, value) {
    const v = Math.floor(value || 0);
    if (type === 'bed') return `수면 회복 +${v}HP`;
    if (type === 'table') return `기본 식사 허기 +${v}`;
    if (type === 'desk') return `공부 EXP +${v}`;
    if (type === 'dummy') return `기본 훈련 EXP +${v}`;
    return `효과 +${v}`;
}

function getUpgradeEffectPreview(type, currentLv, nextLv) {
    const cur = getUpgradeEffectValue(type, currentLv);
    const next = getUpgradeEffectValue(type, nextLv);
    return `${getUpgradeEffectLabel(type, cur)} → ${getUpgradeEffectLabel(type, next)}`;
}

function getSmithyXpToNext(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    return 10 + (lv - 1) * 7;
}

function getSmithyQualityBonus(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    return Math.min(0.25, (lv - 1) * 0.015); // up to +25%
}

const WORK_ENERGY_REGEN_SECONDS = 20;

function getWorkXpToNext(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    return 8 + (lv - 1) * 6;
}

function getWorkGoldReward(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    return 50 + (lv - 1) * 2;
}

function ensureWorkState() {
    if (!gameState.parent.work || typeof gameState.parent.work !== 'object') {
        gameState.parent.work = { level: 1, xp: 0, energy: 10, maxEnergy: 10, energyTimer: WORK_ENERGY_REGEN_SECONDS };
    }
    const w = gameState.parent.work;
    if (!Number.isFinite(w.level)) w.level = 1;
    if (!Number.isFinite(w.xp)) w.xp = 0;
    if (!Number.isFinite(w.energy)) w.energy = 10;
    if (!Number.isFinite(w.maxEnergy)) w.maxEnergy = 10;
    if (!Number.isFinite(w.energyTimer)) w.energyTimer = WORK_ENERGY_REGEN_SECONDS;
    w.level = Math.max(1, Math.floor(w.level));
    w.xp = Math.max(0, Math.floor(w.xp));
    w.maxEnergy = Math.max(10, Math.min(10, Math.floor(w.maxEnergy)));
    w.energy = Math.max(0, Math.min(w.maxEnergy, Math.floor(w.energy)));
    w.energyTimer = Math.max(0, Math.floor(w.energyTimer));
    if (w.energy >= w.maxEnergy) w.energyTimer = WORK_ENERGY_REGEN_SECONDS;
}

function addWorkXp(amount) {
    ensureWorkState();
    const w = gameState.parent.work;
    const gain = Math.max(0, Math.floor(amount || 0));
    if (!gain) return;
    w.xp += gain;
    let leveled = false;
    while (true) {
        const need = getWorkXpToNext(w.level);
        if (w.xp < need) break;
        w.xp -= need;
        w.level += 1;
        leveled = true;
    }
    if (leveled) {
        showToast(`🪡 부업 숙련 Lv.${w.level}!`, 'levelup');
        addMail("🪡 부업 숙련", `부업 숙련도가 올랐습니다. (Lv.${w.level})\n이제 한 번에 조금 더 벌 수 있어요.`);
    }
}

function workTick() {
    ensureWorkState();
    const w = gameState.parent.work;
    if (w.energy >= w.maxEnergy) return;
    w.energyTimer = Math.max(0, Math.floor((w.energyTimer || 0) - 1));
    if (w.energyTimer > 0) return;
    w.energy = Math.min(w.maxEnergy, w.energy + 1);
    w.energyTimer = WORK_ENERGY_REGEN_SECONDS;
}

function doSideJob() {
    ensureWorkState();
    const w = gameState.parent.work;
    if (w.energy <= 0) {
        showToast("💤 에너지가 부족해요. 잠깐 쉬면 회복됩니다.", 'warning');
        return;
    }
    w.energy -= 1;
    const reward = getWorkGoldReward(w.level);
    gameState.parent.gold += reward;
    addWorkXp(1);
    if (els.gold) {
        els.gold.classList.add('gold-pop');
        setTimeout(() => els.gold.classList.remove('gold-pop'), 500);
    }
    showToast(`🪡 부업 완료! (+${reward}G)`, 'success');
    updateUI();
}
window.doSideJob = doSideJob;

function ensureSmithy() {
    if (!gameState.parent.smithy) gameState.parent.smithy = { level: 1, xp: 0 };
    if (!Number.isFinite(gameState.parent.smithy.level)) gameState.parent.smithy.level = 1;
    if (!Number.isFinite(gameState.parent.smithy.xp)) gameState.parent.smithy.xp = 0;
    if (gameState.parent.smithy.buff && typeof gameState.parent.smithy.buff !== 'object') gameState.parent.smithy.buff = null;
    if (typeof gameState.parent.smithy.isBusy !== 'boolean') gameState.parent.smithy.isBusy = false;
    if (!gameState.parent.smithy.uiTab) gameState.parent.smithy.uiTab = 'gacha';
    gameState.parent.smithy.level = Math.max(1, Math.floor(gameState.parent.smithy.level));
    gameState.parent.smithy.xp = Math.max(0, Math.floor(gameState.parent.smithy.xp));
}

function getFarmXpToNext(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    return 6 + (lv - 1) * 5;
}

function ensureFarm() {
    if (!gameState.parent.farm || typeof gameState.parent.farm !== 'object') {
        gameState.parent.farm = {};
    }
    const f = gameState.parent.farm;

    // migrate legacy structure (seed types -> single seed)
    if (f.seeds && typeof f.seeds === 'object' && !Number.isFinite(f.seed)) {
        const sum = Object.values(f.seeds).reduce((acc, s) => acc + Math.max(0, Math.floor(s?.count || 0)), 0);
        f.seed = sum;
    }

    if (!Array.isArray(f.plots)) {
        f.plots = [
            { state: 'empty', timer: 0 },
            { state: 'empty', timer: 0 },
            { state: 'empty', timer: 0 }
        ];
    }
    // sanitize plots
    f.plots = f.plots.slice(0, 9).map(p => {
        const st = p?.state;
        const state = (st === 'growing' || st === 'ready') ? st : 'empty';
        return {
            state,
            timer: Math.max(0, Math.floor(p?.timer || 0))
        };
    });
    while (f.plots.length < 3) f.plots.push({ state: 'empty', timer: 0 });

    if (!Number.isFinite(f.seed)) f.seed = 6;
    if (!Number.isFinite(f.level)) f.level = 1;
    if (!Number.isFinite(f.xp)) f.xp = 0;
    f.seed = Math.max(0, Math.floor(f.seed));
    f.level = Math.max(1, Math.floor(f.level));
    f.xp = Math.max(0, Math.floor(f.xp));
}

function addFarmXp(amount) {
    ensureFarm();
    const gain = Math.max(0, Math.floor(amount || 0));
    if (!gain) return;
    const f = gameState.parent.farm;
    f.xp += gain;
    let leveled = false;
    while (true) {
        const need = getFarmXpToNext(f.level);
        if (f.xp < need) break;
        f.xp -= need;
        f.level += 1;
        leveled = true;
    }
    if (leveled) {
        showToast(`🌾 농사 레벨 Lv.${f.level}! 더 좋은 작물이 나올 거예요.`, 'levelup');
        addMail("🌾 농사 레벨업!", `텃밭이 익숙해졌습니다. (Lv.${f.level})`);
    }
}

function ensureShopState() {
    if (!gameState.parent.shop || typeof gameState.parent.shop !== 'object') gameState.parent.shop = {};
    if (!gameState.parent.shop.uiTab) gameState.parent.shop.uiTab = 'grocery';
    if (!gameState.parent.bookstore || typeof gameState.parent.bookstore !== 'object') {
        gameState.parent.bookstore = { nextRollTick: 300, stock: [], lastRollTick: 0 };
    }
    if (!Number.isFinite(gameState.parent.bookstore.nextRollTick)) gameState.parent.bookstore.nextRollTick = 300;
    if (!Array.isArray(gameState.parent.bookstore.stock)) gameState.parent.bookstore.stock = [];
    if (!Number.isFinite(gameState.parent.bookstore.lastRollTick)) gameState.parent.bookstore.lastRollTick = 0;
}

function ensureSonUiState() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    const t = gameState.parent.sonUiTab;
    if (t !== 'summary' && t !== 'gear' && t !== 'world') {
        gameState.parent.sonUiTab = 'summary';
    }
}

function ensureSupportPinState() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    if (!('supportPin' in gameState.parent)) gameState.parent.supportPin = null;
    const p = gameState.parent.supportPin;
    if (!p) return;
    if (typeof p !== 'object' || !p.type) gameState.parent.supportPin = null;
}

function ensureSonBehaviorState() {
    if (!gameState.son || typeof gameState.son !== 'object') gameState.son = {};
    if (!Number.isFinite(gameState.son.homeActionCount)) gameState.son.homeActionCount = 0;
    gameState.son.homeActionCount = Math.max(0, Math.floor(gameState.son.homeActionCount));
}

function ensureNetworkState() {
    if (!gameState.son || typeof gameState.son !== 'object') gameState.son = {};
    if (!gameState.son.network || typeof gameState.son.network !== 'object') {
        gameState.son.network = { contacts: [], buddy: null, aspiration: null };
    }
    const n = gameState.son.network;
    if (!Array.isArray(n.contacts)) n.contacts = [];
    n.contacts = n.contacts
        .filter(c => c && typeof c === 'object' && c.id && c.name)
        .slice(0, 20)
        .map(c => ({
            id: String(c.id),
            kind: String(c.kind || 'unknown'),
            name: String(c.name || ''),
            desc: String(c.desc || ''),
            metTick: Math.max(0, Math.floor(c.metTick || 0)),
            tags: Array.isArray(c.tags) ? c.tags.slice(0, 6).map(x => String(x)) : []
        }));

    if (n.buddy && typeof n.buddy === 'object') {
        n.buddy = {
            id: String(n.buddy.id || 'buddy'),
            name: String(n.buddy.name || '동료'),
            desc: String(n.buddy.desc || ''),
            cpBonus: Math.max(0, Math.floor(n.buddy.cpBonus || 0)),
            adventuresLeft: Math.max(0, Math.floor(n.buddy.adventuresLeft || 0))
        };
        if (n.buddy.adventuresLeft <= 0) n.buddy = null;
    } else {
        n.buddy = null;
    }

    const a = n.aspiration;
    n.aspiration = (a === 'strength' || a === 'magic' || a === 'archery') ? a : null;
}

function upsertNetworkContact(contact) {
    ensureNetworkState();
    const c = contact && typeof contact === 'object' ? contact : null;
    if (!c || !c.id || !c.name) return false;
    const n = gameState.son.network;
    const id = String(c.id);
    const idx = (n.contacts || []).findIndex(x => x && x.id === id);
    const next = {
        id,
        kind: String(c.kind || 'unknown'),
        name: String(c.name || ''),
        desc: String(c.desc || ''),
        metTick: Math.max(0, Math.floor(c.metTick || Math.floor(gameState.worldTick || 0))),
        tags: Array.isArray(c.tags) ? c.tags.slice(0, 6).map(x => String(x)) : []
    };
    if (idx >= 0) {
        const prev = n.contacts[idx];
        // Keep earliest met tick, but allow desc to update.
        next.metTick = Math.min(next.metTick, Math.max(0, Math.floor(prev?.metTick || next.metTick)));
        n.contacts[idx] = next;
    } else {
        n.contacts.unshift(next);
        if (n.contacts.length > 20) n.contacts = n.contacts.slice(0, 20);
    }
    return true;
}

function renderSonNetworkUI() {
    const root = document.getElementById('son-network');
    if (!root) return;
    ensureNetworkState();
    const n = gameState.son.network;
    const buddy = n.buddy;
    const contacts = (n.contacts || []).slice(0, 6);

    const aspirationLabel =
        n.aspiration === 'strength' ? '⚔️ 기사/수호자' :
            n.aspiration === 'magic' ? '🧙‍♂️ 마법/사제' :
                n.aspiration === 'archery' ? '🏹 궁수/사냥꾼' :
                    null;

    let html = '';
    if (aspirationLabel) {
        html += `<div style="font-size:0.8rem; color:#0f172a; font-weight:1000;">요즘 꿈: ${aspirationLabel}</div>`;
    } else {
        html += `<div style="font-size:0.78rem; color:#64748b;">아직은 어떤 사람이 될지 고민 중이에요.</div>`;
    }

    if (buddy) {
        html += `
          <div class="support-row" style="margin-top:10px;">
            <div style="flex:1; min-width:0;">
              <div class="support-title">🧑‍🤝‍🧑 동료: ${buddy.name}</div>
              <div class="support-sub">${buddy.desc || '함께 모험해요.'}<br>효과: CP +${buddy.cpBonus} · 남은 동행 ${buddy.adventuresLeft}회</div>
            </div>
          </div>
        `;
    }

    if (!contacts.length) {
        html += `<div style="margin-top:10px; font-size:0.78rem; color:#64748b;">아직 특별한 인연이 없어요. 모험 중에 새로운 사람을 만날 수도 있어요.</div>`;
        root.innerHTML = html;
        return;
    }

    html += `<div style="margin-top:10px; font-size:0.78rem; color:#64748b; font-weight:900;">최근 만난 인연</div>`;
    html += contacts.map(c => {
        const icon = c.kind === 'mentor' ? '🧑‍🏫' : c.kind === 'friend' ? '🧑‍🤝‍🧑' : c.kind === 'inspiration' ? '✨' : '👤';
        const desc = c.desc ? `<div style="margin-top:4px; font-size:0.78rem; color:#64748b; line-height:1.35;">${c.desc}</div>` : '';
        return `
          <div class="furn-row" style="align-items:flex-start;">
            <div style="min-width:0;">
              <div class="furn-row-title">${icon} ${c.name}</div>
              ${desc}
            </div>
          </div>
        `;
    }).join('');

    root.innerHTML = html;
}

function ensureMaterialRequestState() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    if (!('materialRequest' in gameState.parent)) gameState.parent.materialRequest = null;
    if (!Number.isFinite(gameState.parent.materialRequestTarget)) gameState.parent.materialRequestTarget = 5;
    gameState.parent.materialRequestTarget = clampInt(gameState.parent.materialRequestTarget, 1, 30);

    const r = gameState.parent.materialRequest;
    if (!r) return;
    if (typeof r !== 'object' || !r.key) {
        gameState.parent.materialRequest = null;
        return;
    }
    r.key = String(r.key);
    r.target = clampInt(r.target || 5, 1, 30);
    if (!Number.isFinite(r.createdTick)) r.createdTick = Math.floor(gameState.worldTick || 0);
}

function ensureBossSealState() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    if (!gameState.parent.bossSeals || typeof gameState.parent.bossSeals !== 'object') {
        gameState.parent.bossSeals = {};
    }
    // sanitize booleans
    for (const [k, v] of Object.entries(gameState.parent.bossSeals)) {
        gameState.parent.bossSeals[k] = !!v;
    }
}

function ensureMailPhotoHistory() {
    if (!gameState.parent || typeof gameState.parent !== 'object') gameState.parent = {};
    if (!Array.isArray(gameState.parent.mailPhotoHistory)) gameState.parent.mailPhotoHistory = [];
    gameState.parent.mailPhotoHistory = gameState.parent.mailPhotoHistory
        .filter(x => typeof x === 'string' && x.trim())
        .slice(0, 12);
}

function ensureRequestState() {
    if (!gameState.son || typeof gameState.son !== 'object') gameState.son = {};
    if (!Array.isArray(gameState.son.requests)) {
        // migrate legacy single quest
        if (gameState.son.quest && typeof gameState.son.quest === 'object') {
            gameState.son.requests = [];
        } else {
            gameState.son.requests = [];
        }
    }
    // cleanup legacy field if present
    if ('quest' in gameState.son) delete gameState.son.quest;
    // sanitize
    gameState.son.requests = gameState.son.requests
        .filter(r => r && typeof r === 'object' && r.id && r.kind && r.dueAt)
        .slice(0, 10);

    // Migrate old “need_book” requests: count-based completion was too strict for swaps.
    ensureLibraryState();
    const rev = gameState.parent.library?.shelfPlaceRevision || 0;
    for (const r of gameState.son.requests) {
        if (!r || r.status !== 'open') continue;
        if (r.kind !== 'need_book') continue;
        if (!r.data || typeof r.data !== 'object') r.data = {};
        if (!Number.isFinite(r.data.baselineShelfPlaceRevision)) r.data.baselineShelfPlaceRevision = rev;
    }
}

function cleanupLegacyParentSettings() {
    if (!gameState.parent || typeof gameState.parent !== 'object') return;
    if ('parentingPolicy' in gameState.parent) delete gameState.parent.parentingPolicy;
    if ('adventureDifficulty' in gameState.parent) delete gameState.parent.adventureDifficulty;
}

function addSmithyXp(amount) {
    ensureSmithy();
    const gain = Math.max(0, Math.floor(amount || 0));
    if (!gain) return;
    gameState.parent.smithy.xp += gain;
    let leveled = false;
    while (true) {
        const need = getSmithyXpToNext(gameState.parent.smithy.level);
        if (gameState.parent.smithy.xp < need) break;
        gameState.parent.smithy.xp -= need;
        gameState.parent.smithy.level += 1;
        leveled = true;
    }
    if (leveled) {
        const lv = gameState.parent.smithy.level;
        const bonus = Math.round(getSmithyQualityBonus(lv) * 100);
        showToast(`🔨 대장간 숙련도 Lv.${lv}! (고급 무기 확률 보정 +${bonus}%)`, 'levelup');
    }
}

function pickGachaWeapon(opts = {}) {
    ensureSmithy();
    const lv = gameState.parent.smithy.level;
    const mode = opts.mode || 'basic'; // 'basic' | 'premium'
    let bonus = getSmithyQualityBonus(lv);
    if (mode === 'premium') bonus += 0.08;
    if (gameState.parent.smithy.buff?.type === 'lucky' && (gameState.parent.smithy.buff.pulls || 0) > 0) {
        bonus += gameState.parent.smithy.buff.bonus || 0.08;
    }
    bonus = Math.min(0.45, bonus);
    const tierMult = (tier) => {
        const b = bonus;
        if (tier === 'C') return Math.max(0.35, 1 - b * 1.9);
        if (tier === 'B') return 1;
        if (tier === 'A') return 1 + b * 1.6;
        if (tier === 'S') return 1 + b * 2.4;
        return 1;
    };

    const weighted = weaponsList.map(w => ({ w, weight: Math.max(0.0001, w.prob * tierMult(w.tier)) }));
    const total = weighted.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of weighted) {
        r -= x.weight;
        if (r <= 0) return x.w;
    }
    return weighted[0].w;
}

const smithyUnlocks = {
    exchange_pro: { level: 3, label: '숙련 교환' },
    premium_gacha: { level: 5, label: '고급 뽑기' },
    temper: { level: 7, label: '정련(행운 부여)' },
    special_order: { level: 10, label: '특별 주문' }
};

function isSmithyUnlocked(id) {
    ensureSmithy();
    const def = smithyUnlocks[id];
    if (!def) return false;
    return gameState.parent.smithy.level >= def.level;
}

function setSmithyBusy(isBusy) {
    ensureSmithy();
    const busy = !!isBusy;
    gameState.parent.smithy.isBusy = busy;
    if (els.btnGacha) els.btnGacha.disabled = busy;
    if (els.btnGachaPremium) els.btnGachaPremium.disabled = busy || !isSmithyUnlocked('premium_gacha');
    if (els.btnTemper) els.btnTemper.disabled = busy || !isSmithyUnlocked('temper');
    if (els.btnSpecialOrder) els.btnSpecialOrder.disabled = busy || !isSmithyUnlocked('special_order');
    if (els.btnExchangeSteelPro) els.btnExchangeSteelPro.disabled = busy || !isSmithyUnlocked('exchange_pro');
    if (els.btnExchangeCrystalPro) els.btnExchangeCrystalPro.disabled = busy || !isSmithyUnlocked('exchange_pro');
}

function smithyConsumeLuckyPull() {
    ensureSmithy();
    const buff = gameState.parent.smithy.buff;
    if (!buff || buff.type !== 'lucky') return;
    if ((buff.pulls || 0) <= 0) return;
    buff.pulls -= 1;
    if (buff.pulls <= 0) {
        gameState.parent.smithy.buff = null;
        showToast("✨ 정련의 기운이 사라졌습니다.", 'info');
    }
}

function performGacha(mode = 'basic') {
    const m = mode === 'premium' ? 'premium' : 'basic';
    ensureSmithy();
    // Balance: weapon gacha costs reduced by half
    const cost = m === 'premium' ? 1250 : 500;
    const xpGain = m === 'premium' ? 6 : 3;
    if (m === 'premium' && !isSmithyUnlocked('premium_gacha')) {
        showToast("🎲 고급 뽑기는 대장간 숙련도 Lv.5부터 해금됩니다.", 'warning');
        return;
    }
    if (gameState.parent.gold < cost) {
        showToast(`골드 부족! (${cost}G 필요)`, 'error');
        return;
    }

    gameState.parent.gold -= cost;
    addSmithyXp(xpGain);

    const picked = pickGachaWeapon({ mode: m });
    gameState.parent.weaponInventory[picked.tier].count++;
    smithyConsumeLuckyPull();

    if (els.gachaResult) {
        els.gachaResult.style.display = 'block';
        els.gachaResult.innerHTML = `망치질을 하는 중... 🔨 <span style="font-size:0.78rem; color:#94a3b8;">(숙련도 +${xpGain})</span>`;
    }
    setSmithyBusy(true);
    setTimeout(() => {
        if (els.gachaResult) {
            const iconId = `weapon_${picked.tier}`;
            const icon = `<img src="assets/items/${iconId}.png" alt="" style="width:28px; height:28px; vertical-align:middle; margin-right:6px; image-rendering:pixelated; border-radius:8px; border:1px solid rgba(226,232,240,0.9); background:#fff;" onerror="this.style.display='none'">`;
            els.gachaResult.innerHTML = `${icon}[${picked.tier}급] ${picked.name} 획득! → 옷장에 보관됨`;
            els.gachaResult.className = `gacha-result tier-${picked.tier}`;
        }
        setSmithyBusy(false);
        showToast(`[${picked.tier}급] ${picked.name} 획득!`, picked.tier === 'S' ? 'gold' : picked.tier === 'A' ? 'levelup' : 'info');
        updateUI();
    }, 1500);
}

function temperSmithy() {
    if (!isSmithyUnlocked('temper')) {
        showToast("✨ 정련은 대장간 숙련도 Lv.7부터 해금됩니다.", 'warning');
        return;
    }
    ensureLootKey('iron_scrap');
    ensureLootKey('arcane_dust');
    if ((gameState.parent.loot.iron_scrap.count || 0) < 8 || (gameState.parent.loot.arcane_dust.count || 0) < 2) {
        showToast("재료가 부족합니다! (철 조각 8 + 마력 가루 2)", 'error');
        return;
    }
    gameState.parent.loot.iron_scrap.count -= 8;
    gameState.parent.loot.arcane_dust.count -= 2;
    ensureSmithy();
    gameState.parent.smithy.buff = { type: 'lucky', pulls: 3, bonus: 0.08 };
    addSmithyXp(4);
    showToast("✨ 정련 완료! 다음 뽑기 3회 동안 행운이 깃듭니다.", 'success');
    updateUI();
}
window.temperSmithy = temperSmithy;

function specialOrderSmithy() {
    if (!isSmithyUnlocked('special_order')) {
        showToast("📜 특별 주문은 대장간 숙련도 Lv.10부터 해금됩니다.", 'warning');
        return;
    }
    ensureLootKey('arcane_dust');
    const cost = 6000;
    const needDust = 6;
    if (gameState.parent.gold < cost) {
        showToast(`골드 부족! (${cost}G 필요)`, 'error');
        return;
    }
    if ((gameState.parent.loot.arcane_dust.count || 0) < needDust) {
        showToast(`마력 가루 부족! (${needDust}개 필요)`, 'error');
        return;
    }
    gameState.parent.gold -= cost;
    gameState.parent.loot.arcane_dust.count -= needDust;
    addSmithyXp(10);

    const r = Math.random();
    const tier = r < 0.1 ? 'S' : 'A';
    gameState.parent.weaponInventory[tier].count++;
    showToast(`📜 특별 주문 성공! [${tier}급] ${gameState.parent.weaponInventory[tier].name} 획득!`, tier === 'S' ? 'gold' : 'levelup');
    updateUI();
}
window.specialOrderSmithy = specialOrderSmithy;

// --- Recipe System (cook in kitchen) ---
const recipes = [
    { id: 'steak', name: '🥩 최고급 스테이크', desc: '허기 MAX · EXP +30', needs: { meat: 1, salt: 1 }, type: 'kitchen' },
    { id: 'homemade_meal', name: '🍲 집밥 정식', desc: '허기 +80 · 애정 +3', needs: { carrot: 2, tomato: 1, salt: 1 }, type: 'kitchen' },
    { id: 'herb_potion', name: '🧪 약초 물약', desc: 'HP +60 · 허기 +20', needs: { herb: 2 }, type: 'kitchen' },
    // Seal-unlocked meals (growth tree)
    { id: 'herb_tea', name: '🍵 허브티', desc: '다음 모험: 부상위험↓ · 컨디션↑', needs: { herb: 1, salt: 1 }, type: 'kitchen', requiresSeal: 'meadow' },
    { id: 'wolf_jerky', name: '🥓 늑대 육포', desc: '다음 모험: 전리품↑', needs: { meat: 1, salt: 1 }, type: 'kitchen', requiresSeal: 'forest' },
    { id: 'rune_cookie', name: '🍪 룬 쿠키', desc: '다음 모험: EXP↑', needs: { tomato: 1, salt: 1 }, type: 'kitchen', requiresSeal: 'ruins' },
    { id: 'wind_stew', name: '🍲 바람 스튜', desc: '다음 모험: 부상위험↓', needs: { carrot: 1, tomato: 1, salt: 1 }, type: 'kitchen', requiresSeal: 'mountain' },
    { id: 'dragon_broth', name: '🍜 고룡 육수', desc: '다음 모험: 골드/전리품/EXP↑', needs: { meat: 1, herb: 1, salt: 1 }, type: 'kitchen', requiresSeal: 'dragon_lair' }
];

const ingredientNames = {
    meat: '🥩 고기',
    salt: '🧂 소금',
    carrot: '🥕 당근',
    tomato: '🍅 토마토',
    herb: '🌿 약초'
};

// Grocery prices (should match shop buttons in index.html)
const ingredientPrices = {
    meat: 60,
    salt: 15,
    carrot: 20,
    tomato: 25,
    herb: 35
};

// --- Bookstore & Bookshelf ---
const bookGradeInfo = {
    C: { label: 'C', color: '#64748b' },
    B: { label: 'B', color: '#0ea5e9' },
    A: { label: 'A', color: '#8b5cf6' },
    S: { label: 'S', color: '#f59e0b' }
};

const bookCatalog = [
    { id: 'book_hero', grade: 'C', name: '📘 영웅학 개론', cost: 150, topics: ['adventure', 'discipline'], effects: { exp: 60, diligence: 2, bravery: 1 }, desc: '기초 체계 · 독서 후 EXP 보너스' },
    { id: 'book_cook', grade: 'C', name: '🍲 따뜻한 집밥 레시피', cost: 120, topics: ['life'], effects: { affection: 2, calmness: 1 }, desc: '포근한 마음 · 관계/차분함' },
    { id: 'book_focus', grade: 'C', name: '🧠 집중력 훈련법', cost: 140, topics: ['archery', 'discipline'], effects: { focus: 2, accuracy: 1 }, desc: '집중/명중' },
    { id: 'book_sword', grade: 'B', name: '🗡️ 검술 입문', cost: 260, topics: ['strength', 'adventure'], effects: { physAtk: 1, bravery: 1, exp: 25 }, desc: '물리 공격/대담' },
    { id: 'book_shield', grade: 'B', name: '🛡️ 튼튼한 마음과 몸', cost: 280, topics: ['strength', 'discipline'], effects: { endurance: 2, maxHp: 10 }, desc: '인내/최대체력' },
    { id: 'book_magic', grade: 'B', name: '✨ 마법의 기초', cost: 310, topics: ['magic'], effects: { magicAtk: 1, intelligence: 2 }, desc: '마공/지능' },
    { id: 'book_calm', grade: 'B', name: '🍃 숨 고르기', cost: 240, topics: ['life', 'magic'], effects: { calmness: 2, magicRes: 1 }, desc: '차분/마저' },
    { id: 'book_archery', grade: 'A', name: '🏹 사격 교본', cost: 520, topics: ['archery'], effects: { agility: 1, accuracy: 2, focus: 2 }, desc: '민첩/명중/집중' },
    { id: 'book_spell', grade: 'A', name: '📗 정령문법', cost: 560, topics: ['magic', 'discipline'], effects: { intelligence: 2, magicAtk: 2, magicRes: 1 }, desc: '지능/마공/마저' },
    { id: 'book_knight', grade: 'A', name: '📕 기사도 수련', cost: 490, topics: ['strength', 'discipline'], effects: { physAtk: 2, endurance: 2, diligence: 1 }, desc: '물공/인내/성실' },
    { id: 'book_legend', grade: 'S', name: '📜 전설의 기록: 빛의 수호자', cost: 980, topics: ['adventure', 'magic'], effects: { magicAtk: 2, magicRes: 2, trust: 2, exp: 50 }, desc: '희귀 · 성장 큰 폭' },
    { id: 'book_hunter', grade: 'S', name: '🦌 명사수의 이야기', cost: 920, topics: ['archery', 'adventure'], effects: { accuracy: 2, agility: 2, bravery: 2 }, desc: '희귀 · 사격/대담' },
    // Seal-unlocked books (growth tree)
    { id: 'book_meadow', grade: 'B', name: '🌼 포근한 낮잠 노트', cost: 260, topics: ['life', 'discipline'], effects: { calmness: 2, affection: 2 }, desc: '인장 해금 · 차분/애정', requiresSeal: 'meadow' },
    { id: 'book_forest', grade: 'B', name: '🌲 숲의 발자국', cost: 300, topics: ['adventure', 'archery'], effects: { focus: 2, agility: 1, bravery: 1 }, desc: '인장 해금 · 집중/민첩/대담', requiresSeal: 'forest' },
    { id: 'book_ruins', grade: 'A', name: '🏛️ 룬 문자 해독', cost: 620, topics: ['magic', 'discipline'], effects: { intelligence: 2, magicAtk: 1, exp: 35 }, desc: '인장 해금 · 지능/마공/EXP', requiresSeal: 'ruins' },
    { id: 'book_mountain', grade: 'A', name: '🏔️ 바람을 버티는 법', cost: 580, topics: ['strength', 'discipline'], effects: { endurance: 2, maxHp: 12, diligence: 1 }, desc: '인장 해금 · 인내/체력/성실', requiresSeal: 'mountain' },
    { id: 'book_dragon', grade: 'S', name: '🐉 고룡 관찰 일지', cost: 1100, topics: ['adventure', 'discipline'], effects: { bravery: 2, trust: 2, exp: 80 }, desc: '인장 해금 · 대담/신뢰/EXP', requiresSeal: 'dragon_lair', requiresStage: 1 }
];

const bookById = (() => {
    const m = {};
    for (const b of bookCatalog) m[b.id] = b;
    return m;
})();

function isBookUnlocked(book) {
    if (!book) return false;
    const seal = book.requiresSeal;
    if (seal && !isBossSealCrafted(seal)) return false;
    const stage = Number.isFinite(book.requiresStage) ? book.requiresStage : 0;
    if (stage > 0 && getJobStage() < stage) return false;
    return true;
}

function ensureLibraryState() {
    if (!gameState.parent.library || typeof gameState.parent.library !== 'object') {
        gameState.parent.library = { shelfLevel: 1, owned: {}, read: {}, shelf: [], shelfBias: [], shelfPlaceRevision: 0 };
    }
    const lib = gameState.parent.library;
    if (!Number.isFinite(lib.shelfLevel)) lib.shelfLevel = 1;
    lib.shelfLevel = Math.max(1, Math.min(5, Math.floor(lib.shelfLevel)));
    if (!lib.owned || typeof lib.owned !== 'object') lib.owned = {};
    if (!lib.read || typeof lib.read !== 'object') lib.read = {};
    if (!Array.isArray(lib.shelf)) lib.shelf = [];
    if (!Array.isArray(lib.shelfBias)) lib.shelfBias = [];
    if (!Number.isFinite(lib.shelfPlaceRevision)) lib.shelfPlaceRevision = 0;
    lib.shelfPlaceRevision = Math.max(0, Math.floor(lib.shelfPlaceRevision));

    const slots = getBookshelfSlots(lib.shelfLevel);
    while (lib.shelf.length < slots) lib.shelf.push(null);
    lib.shelf = lib.shelf.slice(0, slots);
    while (lib.shelfBias.length < slots) lib.shelfBias.push(Math.random());
    lib.shelfBias = lib.shelfBias.slice(0, slots);

    // migrate legacy "inventory book_hero" into library owned
    if (gameState.parent.inventory?.book_hero?.count > 0) {
        lib.owned.book_hero = true;
        if (typeof lib.read.book_hero !== 'boolean') lib.read.book_hero = false;
        gameState.parent.inventory.book_hero.count = 0;
    }
    // ensure initial ownership: none by default
}

function getBookshelfSlots(level) {
    const lv = Math.max(1, Math.min(5, Math.floor(level || 1)));
    return lv; // 1~5
}

function getBookEffectSummary(book) {
    if (!book) return '';
    const e = book.effects || {};
    const parts = [];
    if (e.exp) parts.push(`EXP +${e.exp}`);
    if (e.maxHp) parts.push(`최대HP +${e.maxHp}`);
    if (e.physAtk) parts.push(`물공 +${e.physAtk}`);
    if (e.magicAtk) parts.push(`마공 +${e.magicAtk}`);
    if (e.magicRes) parts.push(`마저 +${e.magicRes}`);
    if (e.agility) parts.push(`민첩 +${e.agility}`);
    if (e.accuracy) parts.push(`명중 +${e.accuracy}`);
    if (e.bravery) parts.push(`대담 +${e.bravery}`);
    if (e.diligence) parts.push(`성실 +${e.diligence}`);
    if (e.endurance) parts.push(`인내 +${e.endurance}`);
    if (e.intelligence) parts.push(`지능 +${e.intelligence}`);
    if (e.calmness) parts.push(`차분 +${e.calmness}`);
    if (e.focus) parts.push(`집중 +${e.focus}`);
    if (e.trust) parts.push(`신뢰 +${e.trust}`);
    if (e.affection) parts.push(`애정 +${e.affection}`);
    if (e.rebellion) parts.push(`반항 ${e.rebellion > 0 ? '+' : ''}${e.rebellion}`);
    return parts.join(' · ');
}

function rollFromWeights(items) {
    const total = items.reduce((acc, it) => acc + (it.w || 0), 0);
    if (total <= 0) return items[0];
    let r = Math.random() * total;
    for (const it of items) {
        r -= (it.w || 0);
        if (r <= 0) return it;
    }
    return items[items.length - 1];
}

function rollBookstoreStock() {
    ensureShopState();
    ensureLibraryState();
    const lib = gameState.parent.library;
    const pool = bookCatalog.filter(b => !lib.owned[b.id] && isBookUnlocked(b));
    const pickUnique = (arr, n) => {
        const copy = [...arr];
        const out = [];
        while (copy.length && out.length < n) {
            const idx = Math.floor(Math.random() * copy.length);
            out.push(copy.splice(idx, 1)[0]);
        }
        return out;
    };

    const commons = pool.filter(b => b.grade === 'C' || b.grade === 'B');
    const rares = pool.filter(b => b.grade === 'A' || b.grade === 'S');
    const stock = [];

    // Slight bias: if the son has a clear training path, include a relevant book more often.
    const { topKey, margin } = getTrainingMasteryTop();
    const stage = getJobStage();
    const prefers = (b) => (b?.topics || []).includes(topKey);
    const hasClearPath = stage >= 1 || margin >= 3;
    if (hasClearPath) {
        const preferPool = commons.filter(prefers);
        if (preferPool.length) stock.push(pickUnique(preferPool, 1)[0]);
    }
    stock.push(...pickUnique(commons.filter(b => !stock.includes(b)), 3 - stock.length));
    if (rares.length) {
        const r = rollFromWeights([
            { grade: 'A', w: 85 },
            { grade: 'S', w: 15 }
        ]);
        const candidates = pool.filter(b => b.grade === r.grade);
        // Prefer rare book aligned with the path, if any.
        const preferRare = candidates.filter(prefers);
        if (hasClearPath && preferRare.length) stock.push(pickUnique(preferRare, 1)[0]);
        else if (candidates.length) stock.push(pickUnique(candidates, 1)[0]);
        else stock.push(pickUnique(rares, 1)[0]);
    } else if (commons.length) {
        stock.push(pickUnique(commons, 1)[0]);
    }

    gameState.parent.bookstore.stock = stock.filter(Boolean).map(b => b.id);
    gameState.parent.bookstore.lastRollTick = gameState.worldTick || 0;
}

function updateBookstoreRotation() {
    ensureShopState();
    ensureLibraryState();
    const bs = gameState.parent.bookstore;
    const now = Math.max(0, Math.floor(gameState.worldTick || 0));
    if (!Number.isFinite(bs.nextRollTick) || bs.nextRollTick <= 0) bs.nextRollTick = now + 300;

    if (!bs.stock || !bs.stock.length) {
        rollBookstoreStock();
        bs.nextRollTick = now + 300;
        return;
    }

    if (now >= bs.nextRollTick) {
        rollBookstoreStock();
        bs.nextRollTick = now + 300;
    }
}

function renderBookstoreUI() {
    const root = document.getElementById('bookstore-stock');
    if (!root) return;
    ensureShopState();
    ensureLibraryState();
    updateBookstoreRotation();

    const bs = gameState.parent.bookstore;
    const lib = gameState.parent.library;
    const now = Math.max(0, Math.floor(gameState.worldTick || 0));
    const remain = Math.max(0, Math.floor((bs.nextRollTick || 0) - now));
    const timerEl = document.getElementById('bookstore-timer');
    if (timerEl) timerEl.innerText = formatMmSs(remain);

    const upDesc = document.getElementById('bookshelf-upgrade-desc');
    if (upDesc) {
        const slots = getBookshelfSlots(lib.shelfLevel);
        const costs = getBookshelfUpgradeCost(lib.shelfLevel + 1);
        upDesc.innerText = lib.shelfLevel >= 5
            ? `현재 슬롯: ${slots}/5 · 최고 단계입니다.`
            : `현재 슬롯: ${slots}/5 · 다음 업그레이드: ${getBookshelfSlots(lib.shelfLevel + 1)}슬롯 (비용 ${costs}G)`;
    }
    const upBtn = document.getElementById('btn-bookshelf-upgrade');
    if (upBtn) upBtn.disabled = lib.shelfLevel >= 5;

    const stock = (bs.stock || []).map(id => bookById[id]).filter(Boolean);
    if (!stock.length) {
        root.innerHTML = `<div class="hint-card" style="margin-top:10px;"><b>오늘은 품절…</b><div style="margin-top:6px; font-size:0.82rem; color:#64748b;">이미 모든 책을 소장한 것 같아요.</div></div>`;
        return;
    }

    let html = '';
    const hint = getSonBookTasteHint();
    if (hint) {
        html += `<div class="hint-card" style="margin-top:10px;"><b>💡 아들의 취향</b><div style="margin-top:6px; font-size:0.78rem; color:#475569; line-height:1.4;">${hint}</div></div>`;
    }
    for (const b of stock) {
        const g = bookGradeInfo[b.grade] || bookGradeInfo.C;
        const owned = !!lib.owned[b.id];
        html += `
          <div class="hint-card" style="margin-top:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
              <div style="font-weight:1000; color:#0f172a;">
                <span style="display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:20px; padding:0 8px; border-radius:999px; background:${g.color}; color:#fff; font-size:0.72rem; font-weight:1000;">${g.label}</span>
                <span style="margin-left:6px;">${b.name}</span>
                <div style="margin-top:4px; font-size:0.78rem; color:#64748b;">${b.desc || ''}</div>
                <div style="margin-top:6px; font-size:0.78rem; color:#475569;">효과: <b>${getBookEffectSummary(b) || '-'}</b></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                <div style="font-weight:1000; color:#0f172a;">${b.cost}G</div>
                <button class="action-btn" style="margin-top:0; width:auto; padding:6px 12px; background:${owned ? '#94a3b8' : '#0f172a'};" ${owned ? 'disabled' : ''} onclick="buyBook('${b.id}')">${owned ? '구매 완료' : '구매'}</button>
              </div>
            </div>
          </div>
        `;
    }
    root.innerHTML = html;
}

function buyBook(bookId) {
    ensureShopState();
    ensureLibraryState();
    updateBookstoreRotation();
    const b = bookById[bookId];
    if (!b) return;
    const lib = gameState.parent.library;
    if (lib.owned[bookId]) {
        showToast("이미 소장한 책입니다.", 'warning');
        return;
    }
    const bs = gameState.parent.bookstore;
    if (!bs.stock?.includes(bookId)) {
        showToast("지금은 입고되지 않은 책입니다.", 'warning');
        return;
    }
    if (gameState.parent.gold < b.cost) {
        showToast(`골드 부족! (${b.cost}G 필요)`, 'error');
        return;
    }
    gameState.parent.gold -= b.cost;
    lib.owned[bookId] = true;
    if (typeof lib.read[bookId] !== 'boolean') lib.read[bookId] = false;
    showToast(`${b.name} 구매! (서재로 가져갑니다)`, 'success');
    addMail("📚 서점", `${b.name}을(를) 구매했습니다. 책장에 꽂아두면 아들이 읽을지도 몰라요.`);
    updateUI();
}
window.buyBook = buyBook;

function getBookshelfUpgradeCost(nextLevel) {
    const lv = Math.max(1, Math.min(5, Math.floor(nextLevel || 1)));
    const costs = { 2: 400, 3: 900, 4: 1800, 5: 3400 };
    return costs[lv] || 0;
}

function buyBookshelfUpgrade() {
    ensureLibraryState();
    const lib = gameState.parent.library;
    if (lib.shelfLevel >= 5) {
        showToast("이미 최고 단계 책장입니다.", 'warning');
        return;
    }
    const nextLv = lib.shelfLevel + 1;
    const cost = getBookshelfUpgradeCost(nextLv);
    if (gameState.parent.gold < cost) {
        showToast(`골드 부족! (${cost}G 필요)`, 'error');
        return;
    }
    gameState.parent.gold -= cost;
    lib.shelfLevel = nextLv;
    ensureLibraryState();
    showToast(`📚 책장 업그레이드! (슬롯 ${getBookshelfSlots(nextLv)}개)`, 'levelup');
    updateUI();
}
window.buyBookshelfUpgrade = buyBookshelfUpgrade;

function updateDeskSlotUI() {
    const slotEl = els.slots?.['room-desk'];
    if (!slotEl) return;
    ensureLibraryState();
    const lib = gameState.parent.library;
    const slots = getBookshelfSlots(lib.shelfLevel);
    const placed = lib.shelf.filter(Boolean).length;
    slotEl.classList.toggle('filled', placed > 0);
    slotEl.innerHTML = `<span class="slot-label">📚 책장 ${placed}/${slots}</span>${placed > 0 ? '📚' : '➕'}`;
}

function openBookshelfManager() {
    ensureLibraryState();
    const lib = gameState.parent.library;
    const slots = getBookshelfSlots(lib.shelfLevel);
    const placed = lib.shelf.filter(Boolean).length;

    currentInventoryMode = 'bookshelf';
    currentTargetRoom = 'room-desk';
    if (els.invDesc) els.invDesc.innerText = `책장 슬롯 ${placed}/${slots} · 배치한 책은 아들이 마음이 갈 때 읽을지도 몰라요.`;
    els.invList.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; font-size:0.82rem; color:#475569; line-height:1.35;';
    header.innerHTML = `<b>📚 책장</b><br>슬롯: <b>${placed}/${slots}</b> · 미독서 책을 배치해둘 수 있어요.`;
    els.invList.appendChild(header);

    // Slots
    lib.shelf.forEach((bookId, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:8px;';
        if (bookId) {
            const b = bookById[bookId];
            const g = bookGradeInfo[b?.grade] || bookGradeInfo.C;
            row.innerHTML = `
              <div style="min-width:0;">
                <div style="font-weight:1000; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  <span style="display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:20px; padding:0 8px; border-radius:999px; background:${g.color}; color:#fff; font-size:0.72rem; font-weight:1000;">${g.label}</span>
                  <span style="margin-left:6px;">${b?.name || bookId}</span>
                </div>
                <div style="margin-top:4px; font-size:0.78rem; color:#64748b;">${getBookEffectSummary(b) || '-'}</div>
              </div>
            `;
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.style.cssText = 'width:auto; padding:6px 12px; margin:0; background:#ef4444;';
            btn.innerText = '빼기';
            btn.onclick = () => removeBookFromShelf(idx);
            row.appendChild(btn);
        } else {
            row.innerHTML = `<div style="font-weight:900; color:#64748b;">슬롯 ${idx + 1} · 빈 칸</div>`;
        }
        els.invList.appendChild(row);
    });

    const divider = document.createElement('div');
    divider.style.cssText = 'margin:12px 0 8px; border-top:1px solid #e2e8f0;';
    els.invList.appendChild(divider);

    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-weight:1000; color:#475569; margin-bottom:8px; font-size:0.85rem;';
    listTitle.innerText = '배치 가능한 책 (소장 · 미독서)';
    els.invList.appendChild(listTitle);

    const placeable = bookCatalog.filter(b => lib.owned[b.id] && !lib.read[b.id] && !lib.shelf.includes(b.id));
    if (!placeable.length) {
        const p = document.createElement('div');
        p.style.cssText = 'color:#94a3b8; font-size:0.82rem;';
        p.innerText = '배치할 수 있는 책이 없습니다. (서점에서 책을 구매하세요)';
        els.invList.appendChild(p);
    } else {
        placeable.forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.innerText = `${b.name} [${b.grade}] - ${getBookEffectSummary(b)}`;
            btn.disabled = placed >= slots;
            btn.onclick = () => placeBookToShelf(b.id);
            els.invList.appendChild(btn);
        });
    }

    els.invModal.style.display = 'flex';
}
window.openBookshelfManager = openBookshelfManager;

function placeBookToShelf(bookId) {
    ensureLibraryState();
    const lib = gameState.parent.library;
    if (!lib.owned[bookId] || lib.read[bookId]) {
        showToast("배치할 수 없는 책입니다.", 'warning');
        return;
    }
    if (lib.shelf.includes(bookId)) {
        showToast("이미 책장에 배치된 책입니다.", 'warning');
        return;
    }
    const idx = lib.shelf.findIndex(x => !x);
    if (idx < 0) {
        showToast("책장에 빈 칸이 없습니다.", 'warning');
        return;
    }
    lib.shelf[idx] = bookId;
    lib.shelfBias[idx] = Math.random();
    lib.shelfPlaceRevision = Math.max(0, Math.floor(lib.shelfPlaceRevision || 0) + 1);
    showToast("📚 책장에 배치했습니다.", 'success');
    openBookshelfManager();
    updateDeskSlotUI();
    updateUI();
}

function removeBookFromShelf(slotIndex) {
    ensureLibraryState();
    const lib = gameState.parent.library;
    if (slotIndex < 0 || slotIndex >= lib.shelf.length) return;
    lib.shelf[slotIndex] = null;
    showToast("📚 책장에서 뺐습니다.", 'info');
    openBookshelfManager();
    updateDeskSlotUI();
    updateUI();
}

function computeBookInterest(book, slotBias = 0) {
    if (!book) return 0;
    const p = gameState.son.personality || {};
    const m = gameState.son.trainingMastery || {};
    const norm = (v) => Math.max(0, Math.min(1, (v || 0) / 100));
    const mastery = (v) => Math.max(0, Math.min(1, (v || 0) / 80));
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    // Growth-tree bias: objective / seals / job stage gently nudge what the son "wants" to read.
    const topicBoost = { strength: 0, magic: 0, archery: 0, discipline: 0, life: 0, adventure: 0 };
    const o = gameState.son.objective;
    if (o?.type === 'boss') {
        topicBoost.adventure += 0.07;
        topicBoost.discipline += 0.05;
        topicBoost.strength += 0.04;
    } else if (o?.type === 'intel') {
        topicBoost.life += 0.07;
        topicBoost.discipline += 0.04;
        topicBoost.magic += 0.02;
    } else if (o) {
        topicBoost.adventure += 0.04;
        topicBoost.discipline += 0.02;
    }

    const stage = getJobStage();
    const { topKey, margin } = getTrainingMasteryTop();
    const hasClearPath = stage >= 1 || margin >= 3;
    if (hasClearPath && topKey) topicBoost[topKey] += (stage >= 2 ? 0.10 : 0.07);

    if (isBossSealCrafted('meadow')) { topicBoost.life += 0.04; topicBoost.discipline += 0.02; }
    if (isBossSealCrafted('forest')) { topicBoost.archery += 0.04; topicBoost.adventure += 0.02; }
    if (isBossSealCrafted('ruins')) { topicBoost.magic += 0.04; topicBoost.discipline += 0.02; }
    if (isBossSealCrafted('mountain')) { topicBoost.strength += 0.04; topicBoost.discipline += 0.02; }
    if (isBossSealCrafted('dragon_lair')) { topicBoost.adventure += 0.04; topicBoost.discipline += 0.04; }
    const desire = {
        strength: 0.55 * norm(p.endurance) + 0.45 * mastery(m.strength),
        magic: 0.55 * norm(p.intelligence) + 0.45 * mastery(m.magic),
        archery: 0.55 * norm(p.focus) + 0.45 * mastery(m.archery),
        discipline: 0.6 * norm(p.diligence) + 0.4 * norm(gameState.son.affinity?.trust),
        life: 0.55 * norm(p.calmness) + 0.45 * norm(gameState.son.affinity?.affection),
        adventure: 0.7 * norm(p.bravery) + 0.3 * norm(p.diligence)
    };
    const topics = book.topics || [];
    if (!topics.length) return 0;
    const base = topics.reduce((acc, t) => acc + clamp01((desire[t] ?? 0) + (topicBoost[t] ?? 0)), 0) / topics.length;
    const score = (base * 0.82) + (Math.max(0, Math.min(1, slotBias)) * 0.18);
    return Math.max(0, Math.min(1, score));
}

function getSonBookTasteHint() {
    const labels = {
        strength: '근력/기사',
        magic: '마법/지식',
        archery: '사격/집중',
        discipline: '규율/성실',
        life: '생활/마음',
        adventure: '모험/용기'
    };
    const { topKey, margin } = getTrainingMasteryTop();
    const stage = getJobStage();
    const o = gameState.son.objective;
    const parts = [];

    if (stage >= 1 || margin >= 3) parts.push(`${labels[topKey] || topKey} 책`);
    if (o?.type === 'boss') parts.push(`${labels.adventure} 책`);
    if (o?.type === 'intel') parts.push(`${labels.life} 책`);

    if (!parts.length) return '';
    const uniq = [...new Set(parts)].slice(0, 2);
    return `요즘 아들은 <b>${uniq.join('</b> / <b>')}</b>에 더 관심이 있을지도 몰라요.`;
}

function applyBookEffects(book) {
    if (!book) return [];
    const e = book.effects || {};
    const gained = [];
    const addStat = (k, label) => {
        if (!e[k]) return;
        gameState.son.stats[k] = (gameState.son.stats[k] || 0) + e[k];
        gained.push(`${label} +${e[k]}`);
    };
    const addTrait = (k, label) => {
        if (!e[k]) return;
        gameState.son.personality[k] = clampInt((gameState.son.personality[k] || 0) + e[k], 0, 100);
        gained.push(`${label} +${e[k]}`);
    };
    if (e.maxHp) {
        gameState.son.maxHp += e.maxHp;
        gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + Math.floor(e.maxHp * 0.6));
        gained.push(`최대HP +${e.maxHp}`);
    }
    addStat('physAtk', '물공');
    addStat('magicAtk', '마공');
    addStat('magicRes', '마저');
    addStat('agility', '민첩');
    addStat('accuracy', '명중');
    addTrait('bravery', '대담');
    addTrait('diligence', '성실');
    addTrait('endurance', '인내');
    addTrait('intelligence', '지능');
    addTrait('calmness', '차분');
    addTrait('focus', '집중');
    if (e.trust) {
        gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + e.trust, 0, 100);
        gained.push(`신뢰 +${e.trust}`);
    }
    if (e.affection) {
        gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + e.affection, 0, 100);
        gained.push(`애정 +${e.affection}`);
    }
    if (Number.isFinite(e.rebellion) && e.rebellion !== 0) {
        gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) + e.rebellion, 0, 100);
        gained.push(`반항 ${e.rebellion > 0 ? '+' : ''}${e.rebellion}`);
    }
    if (e.exp) {
        gameState.son.exp += e.exp;
        gained.push(`EXP +${e.exp}`);
    }
    return gained;
}

function tryReadFromBookshelf() {
    ensureLibraryState();
    const lib = gameState.parent.library;
    const entries = lib.shelf
        .map((id, idx) => ({ id, idx, bias: lib.shelfBias[idx] }))
        .filter(x => !!x.id)
        .map(x => ({ ...x, book: bookById[x.id], interest: computeBookInterest(bookById[x.id], x.bias) }))
        .filter(x => !!x.book);

    if (!entries.length) return null;

    entries.sort((a, b) => b.interest - a.interest);
    const best = entries[0];

    // Below threshold -> likely to ignore forever (unless personality changes later)
    if (best.interest < 0.42) return { read: false, reason: 'no_interest' };

    const chance = best.interest >= 0.62 ? Math.min(0.92, best.interest) : Math.min(0.55, best.interest - 0.12);
    if (Math.random() > chance) return { read: false, reason: 'skip' };

    const bookId = best.id;
    const b = best.book;
    const gained = applyBookEffects(b);
    lib.read[bookId] = true;
    lib.shelf[best.idx] = null;
    showToast(`📚 ${b.name} 완독! ${gained.length ? `(+${gained.join(', ')})` : ''}`, 'levelup');
    addMail("📚 독서 완료", `아들이 ${b.name}을(를) 읽었습니다.\n${gained.length ? `성장: ${gained.join(' · ')}` : ''}`);
    return { read: true, book: b, gained };
}

// --- Loot Table (by adventure tier) ---
const lootTable = [
    { name: '🌿 약초', key: 'herb', prob: 40, minLv: 1 },
    { name: '🦴 몬스터 뼈', key: 'monster_bone', prob: 30, minLv: 1 },
    { name: '💎 마법 결정', key: 'magic_crystal', prob: 15, minLv: 2 },
    { name: '🧶 희귀 가죽', key: 'rare_hide', prob: 15, minLv: 3 },
    // Seeds (single currency)
    { name: '🌱 씨앗', key: 'seed', prob: 32, minLv: 1 }
];

// --- DOM Elements ---
const els = {
    gold: document.getElementById('res-gold'),
    sonLevel: document.getElementById('son-level'),
    sonWeapon: document.getElementById('son-weapon'),
    barHp: document.getElementById('bar-hp'),
    barHunger: document.getElementById('bar-hunger'),
    barExp: document.getElementById('bar-exp'),
    affTrust: document.getElementById('aff-trust'),
    affAffection: document.getElementById('aff-affection'),
    affRebellion: document.getElementById('aff-rebellion'),
    sprite: document.getElementById('son-sprite'),
    speech: document.getElementById('son-speech'),
    mainTabs: document.querySelectorAll('.main-tab'),
    views: {
        home: document.getElementById('view-home'),
        son: document.getElementById('view-son'),
        town: document.getElementById('view-town')
    },
    roomTabs: document.querySelectorAll('#view-home .room-tab'),
    roomViews: {
        'room-bed': document.getElementById('view-room-bed'),
        'room-wardrobe': document.getElementById('view-room-wardrobe'),
        'room-desk': document.getElementById('view-room-desk'),
        'room-table': document.getElementById('view-room-table'),
        'room-dummy': document.getElementById('view-room-dummy'),
        'room-farm': document.getElementById('view-room-farm')
    },
    slots: {
        'room-table': document.getElementById('slot-kitchen'),
        'room-desk': document.getElementById('slot-study'),
        'room-dummy': document.getElementById('slot-training')
    },
    invModal: document.getElementById('inv-modal'),
    invList: document.getElementById('inv-list'),
    invDesc: document.getElementById('inv-desc'),
    furnShop: document.getElementById('furn-shop'),
    furnModal: document.getElementById('furn-modal'),
    furnModalTitle: document.getElementById('furn-modal-title'),
    furnModalSub: document.getElementById('furn-modal-sub'),
    furnModalList: document.getElementById('furn-modal-list'),
    weaponInventoryList: document.getElementById('weapon-inventory-list'),
    townHub: document.getElementById('town-hub'),
    townDetail: document.getElementById('town-detail'),
    townCards: document.querySelectorAll('#town-hub .town-card'),
    townBack: document.getElementById('btn-town-back'),
    townTitle: document.getElementById('town-title'),
    townSubtabs: document.getElementById('town-subtabs'),
    sysContents: document.querySelectorAll('#view-town .sys-content'),
    btnWork: document.getElementById('btn-work'),
    btnGacha: document.getElementById('btn-gacha'),
    btnGachaPremium: document.getElementById('btn-gacha-premium'),
    btnTemper: document.getElementById('btn-temper'),
    btnSpecialOrder: document.getElementById('btn-special-order'),
    btnExchangeSteelPro: document.getElementById('btn-exchange-steel-pro'),
    btnExchangeCrystalPro: document.getElementById('btn-exchange-crystal-pro'),
    gachaResult: document.getElementById('gacha-result'),
    mailList: document.getElementById('mailbox-list'),
    mailboxModal: document.getElementById('mailbox-modal'),
    mailBadge: document.getElementById('mail-badge'),
    btnBgm: document.getElementById('btn-bgm'),
    bgm: document.getElementById('bgm'),
    questAlert: document.getElementById('quest-alert'),
    questTimer: document.getElementById('quest-timer'),
    questModal: document.getElementById('quest-modal'),
    requestList: document.getElementById('request-list'),
    debugModal: document.getElementById('debug-modal'),
    debugContent: document.getElementById('debug-content'),
    sonStateLabel: document.getElementById('son-state-label'),
    btnEncourage: document.getElementById('btn-encourage'),
    farmGrid: document.getElementById('farm-grid'),
    cookList: document.getElementById('cook-list'),
    buffInfo: document.getElementById('buff-info'),
    travelModal: document.getElementById('travel-modal'),
    travelTitle: document.getElementById('travel-title'),
    travelSub: document.getElementById('travel-sub'),
    travelImg: document.getElementById('travel-img'),
    travelDialogue: document.getElementById('travel-dialogue'),
    travelSummary: document.getElementById('travel-summary'),
    travelActions: document.getElementById('travel-actions'),
    matReqUi: document.getElementById('material-request-ui'),
    matReqModal: document.getElementById('matreq-modal'),
    matReqList: document.getElementById('matreq-list'),
    matReqCurrent: document.getElementById('matreq-current')
};

const weaponsList = [
    { name: '낡은 목검', atk: 2, tier: 'C', prob: 50 },
    { name: '강철 단검', atk: 5, tier: 'B', prob: 30 },
    { name: '기사의 장검', atk: 20, tier: 'A', prob: 15 },
    { name: '🗡️ 드래곤 슬레이어', atk: 100, tier: 'S', prob: 5 }
];

// ============================================================
// Furniture Models (buy in town -> swap at home, slot 강화 유지)
// ============================================================
const furnitureModels = {
    bed: [
        { id: 'bed_basic', name: '기본 침대', desc: '평범하지만 든든해요.', effect: '특수효과 없음', cost: 0 },
        { id: 'bed_wool', name: '양모 침대', desc: '포근한 감촉이 좋아요.', effect: '수면 후 35%: 다음 모험 골드 x1.08', cost: 900 },
        { id: 'bed_canopy', name: '캐노피 침대', desc: '아늑한 꿈을 꾸게 해줘요.', effect: '수면 후 50%: 다음 모험 EXP x1.20', cost: 1600 },
        { id: 'bed_herbal', name: '약초 향 침대', desc: '은은한 향이 퍼져요.', effect: '수면 후 45%: 다음 모험 부상위험 x0.85 · 피로완화 +5%', cost: 2400 },
        { id: 'bed_star', name: '별빛 침대', desc: '밤마다 반짝이는 이불.', effect: '수면 후 55%: 다음 모험 전리품 x1.12 · EXP x1.08', cost: 4200 }
    ],
    table: [
        { id: 'table_basic', name: '기본 식탁', desc: '정갈한 한 끼의 시작.', effect: '특수효과 없음', cost: 0 },
        { id: 'table_picnic', name: '피크닉 식탁', desc: '햇살 같은 분위기.', effect: '식사 후 30%: 애정 +2', cost: 700 },
        { id: 'table_wood', name: '원목 식탁', desc: '오래 쓸수록 멋이 나요.', effect: '식사 후 25%: 성실 +1', cost: 1400 },
        { id: 'table_chef', name: '셰프 식탁', desc: '요리가 더 즐거워져요.', effect: '식사 후 30%: 다음 모험 피로완화 +4%', cost: 2300 },
        { id: 'table_royal', name: '왕실 식탁', desc: '특별한 날의 식사.', effect: '식사 후 25%: 신뢰 +2 · 반항 -1', cost: 3800 }
    ],
    desk: [
        { id: 'desk_basic', name: '기본 책상', desc: '차분히 앉을 수 있어요.', effect: '특수효과 없음', cost: 0 },
        { id: 'desk_pine', name: '소나무 책상', desc: '나무 결이 따뜻해요.', effect: '공부 후 20%: 성실 +1', cost: 800 },
        { id: 'desk_lamp', name: '램프 책상', desc: '밤에도 집중이 잘돼요.', effect: '공부 후 18%: 신뢰 +2', cost: 1500 },
        { id: 'desk_scholar', name: '학자 책상', desc: '책 읽는 맛이 나요.', effect: '공부 후 15%: 성실 +1 · 대담 -1(신중)', cost: 2600 },
        { id: 'desk_arcane', name: '마법 책상', desc: '신기한 잉크가 마르지 않아요.', effect: '공부 후 12%: 다음 모험 EXP x1.12 · 부상위험 x0.92', cost: 4300 }
    ],
    dummy: [
        { id: 'dummy_basic', name: '기본 훈련장', desc: '몸을 움직이기 좋아요.', effect: '훈련 타입이 랜덤(근력/마법/사격)', cost: 0 },
        { id: 'dummy_strength', name: '근력 훈련장', desc: '기초 체력을 다져요.', effect: '훈련 시: 최대HP +2 · 물공 +1 · 인내 +1', cost: 1000 },
        { id: 'dummy_magic', name: '마법 훈련장', desc: '기운이 몽글몽글해요.', effect: '훈련 시: 마공 +1 · 마저 +1 · 지능 +1 · 차분 +1', cost: 1700 },
        { id: 'dummy_archery', name: '사격 훈련장', desc: '집중력이 좋아져요.', effect: '훈련 시: 물공 +1 · 민첩 +1 · 명중 +1 · 집중 +1', cost: 2600 },
        { id: 'dummy_legend', name: '전설 훈련장', desc: '땀방울이 빛나요.', effect: '훈련 타입이 아들의 성향/숙련에 맞춰 선택', cost: 5200 }
    ]
};

function ensureFurnitureState() {
    if (!gameState.parent.furniture || typeof gameState.parent.furniture !== 'object') {
        gameState.parent.furniture = { equipped: {}, owned: {} };
    }
    if (!gameState.parent.furniture.equipped) gameState.parent.furniture.equipped = {};
    if (!gameState.parent.furniture.owned) gameState.parent.furniture.owned = {};
    const defaults = { bed: 'bed_basic', table: 'table_basic', desk: 'desk_basic', dummy: 'dummy_basic' };
    Object.entries(defaults).forEach(([slot, id]) => {
        if (!gameState.parent.furniture.equipped[slot]) gameState.parent.furniture.equipped[slot] = id;
        gameState.parent.furniture.owned[id] = true;
    });
}

function ensureSonGrowthState() {
    if (!gameState.son.stats || typeof gameState.son.stats !== 'object') {
        gameState.son.stats = { physAtk: 0, magicAtk: 0, magicRes: 0, agility: 0, accuracy: 0 };
    }
    const s = gameState.son.stats;
    if (!Number.isFinite(s.physAtk)) s.physAtk = 0;
    if (!Number.isFinite(s.magicAtk)) s.magicAtk = 0;
    if (!Number.isFinite(s.magicRes)) s.magicRes = 0;
    if (!Number.isFinite(s.agility)) s.agility = 0;
    if (!Number.isFinite(s.accuracy)) s.accuracy = 0;

    if (!gameState.son.personality || typeof gameState.son.personality !== 'object') {
        gameState.son.personality = { bravery: 50, diligence: 50 };
    }
    const p = gameState.son.personality;
    if (!Number.isFinite(p.bravery)) p.bravery = 50;
    if (!Number.isFinite(p.diligence)) p.diligence = 50;
    if (!Number.isFinite(p.morality)) p.morality = 50;
    if (!Number.isFinite(p.flexibility)) p.flexibility = 50;
    if (!Number.isFinite(p.endurance)) p.endurance = 50;
    if (!Number.isFinite(p.intelligence)) p.intelligence = 50;
    if (!Number.isFinite(p.calmness)) p.calmness = 50;
    if (!Number.isFinite(p.focus)) p.focus = 50;

    p.bravery = clampInt(p.bravery, 0, 100);
    p.diligence = clampInt(p.diligence, 0, 100);
    p.morality = clampInt(p.morality, 0, 100);
    p.flexibility = clampInt(p.flexibility, 0, 100);
    p.endurance = clampInt(p.endurance, 0, 100);
    p.intelligence = clampInt(p.intelligence, 0, 100);
    p.calmness = clampInt(p.calmness, 0, 100);
    p.focus = clampInt(p.focus, 0, 100);

    if (!gameState.son.trainingMastery || typeof gameState.son.trainingMastery !== 'object') {
        gameState.son.trainingMastery = { strength: 0, magic: 0, archery: 0 };
    }
    const tm = gameState.son.trainingMastery;
    if (!Number.isFinite(tm.strength)) tm.strength = 0;
    if (!Number.isFinite(tm.magic)) tm.magic = 0;
    if (!Number.isFinite(tm.archery)) tm.archery = 0;
}

function getFurnitureModel(slot) {
    ensureFurnitureState();
    const id = gameState.parent.furniture.equipped[slot];
    const list = furnitureModels[slot] || [];
    return list.find(m => m.id === id) || list[0] || { id: `${slot}_basic`, name: '기본', desc: '', cost: 0 };
}

// ============================================================
// Next adventure buff (from bed/table/desk special effects)
// ============================================================
function normalizeNextAdventureBuff(buff) {
    if (!buff) return null;
    return {
        id: buff.id || 'buff',
        name: buff.name || '따뜻한 기운',
        desc: buff.desc || '',
        expMul: Number.isFinite(buff.expMul) ? buff.expMul : 1.0,
        goldMul: Number.isFinite(buff.goldMul) ? buff.goldMul : 1.0,
        lootMul: Number.isFinite(buff.lootMul) ? buff.lootMul : 1.0,
        riskMul: Number.isFinite(buff.riskMul) ? buff.riskMul : 1.0,
        fatigueAdd: Number.isFinite(buff.fatigueAdd) ? buff.fatigueAdd : 0.0,
        source: buff.source || 'home'
    };
}

function describeNextAdventureBuff(buff) {
    if (!buff) return '';
    const parts = [];
    if (buff.expMul && Math.abs(buff.expMul - 1) > 0.001) parts.push(`EXP x${buff.expMul.toFixed(2)}`);
    if (buff.goldMul && Math.abs(buff.goldMul - 1) > 0.001) parts.push(`골드 x${buff.goldMul.toFixed(2)}`);
    if (buff.lootMul && Math.abs(buff.lootMul - 1) > 0.001) parts.push(`전리품 x${buff.lootMul.toFixed(2)}`);
    if (buff.riskMul && Math.abs(buff.riskMul - 1) > 0.001) parts.push(`부상위험 x${buff.riskMul.toFixed(2)}`);
    if (buff.fatigueAdd && Math.abs(buff.fatigueAdd) > 0.0001) parts.push(`피로완화 +${Math.round(buff.fatigueAdd * 100)}%`);
    const detail = parts.join(' · ');
    return detail ? `${buff.name} (${detail})` : buff.name;
}

function setNextAdventureBuff(buff) {
    const b = normalizeNextAdventureBuff(buff);
    const prev = gameState.son.nextAdventureBuff;
    gameState.son.nextAdventureBuff = b;
    if (b) {
        if (prev) showToast("✨ 다음 모험 버프가 갱신되었습니다.", 'info');
        showToast(`✨ ${describeNextAdventureBuff(b)}`, 'info');
    }
    updateUI();
}

function clearNextAdventureBuff() {
    gameState.son.nextAdventureBuff = null;
    updateUI();
}

function maybeProcFromBedAfterSleep() {
    const m = getFurnitureModel('bed');
    const roll = Math.random();
    if (m.id === 'bed_wool') {
        if (roll < 0.35) setNextAdventureBuff({ id: 'cozy_blanket', name: '포근한 이불', desc: '다음 모험 골드가 늘어납니다.', goldMul: 1.08, source: 'bed' });
    } else if (m.id === 'bed_canopy') {
        if (roll < 0.50) setNextAdventureBuff({ id: 'good_dream', name: '좋은 꿈', desc: '다음 모험 EXP가 늘어납니다.', expMul: 1.2, source: 'bed' });
    } else if (m.id === 'bed_herbal') {
        if (roll < 0.45) setNextAdventureBuff({ id: 'fresh_morning', name: '상쾌한 아침', desc: '다음 모험 부상 위험이 줄고 덜 지칩니다.', riskMul: 0.85, fatigueAdd: 0.05, source: 'bed' });
    } else if (m.id === 'bed_star') {
        if (roll < 0.55) setNextAdventureBuff({ id: 'starlight', name: '별빛 가호', desc: '다음 모험 전리품과 EXP가 늘어납니다.', lootMul: 1.12, expMul: 1.08, source: 'bed' });
    }
}

function maybeProcFromTableAfterMeal() {
    const m = getFurnitureModel('table');
    const roll = Math.random();
    if (m.id === 'table_picnic') {
        if (roll < 0.30) {
            gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 2);
            showToast("🌿 피크닉 식탁: 애정 +2", 'success');
        }
    } else if (m.id === 'table_wood') {
        if (roll < 0.25) {
            gameState.son.personality.diligence = clampInt(gameState.son.personality.diligence + 1, 0, 100);
            showToast("🪵 원목 식탁: 성실 +1", 'success');
        }
    } else if (m.id === 'table_chef') {
        if (roll < 0.30) setNextAdventureBuff({ id: 'well_fed', name: '든든한 한 끼', desc: '다음 모험에서 덜 지칩니다.', fatigueAdd: 0.04, source: 'table' });
    } else if (m.id === 'table_royal') {
        if (roll < 0.25) {
            gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 2);
            gameState.son.affinity.rebellion = Math.max(0, gameState.son.affinity.rebellion - 1);
            showToast("👑 왕실 식탁: 신뢰 +2 · 반항 -1", 'success');
        }
    }
}

function maybeProcFromDeskAfterStudy() {
    const m = getFurnitureModel('desk');
    const roll = Math.random();
    if (m.id === 'desk_pine') {
        if (roll < 0.20) {
            gameState.son.personality.diligence = clampInt(gameState.son.personality.diligence + 1, 0, 100);
            showToast("🌲 소나무 책상: 성실 +1", 'success');
        }
    } else if (m.id === 'desk_lamp') {
        if (roll < 0.18) {
            gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 2);
            showToast("💡 램프 책상: 신뢰 +2", 'success');
        }
    } else if (m.id === 'desk_scholar') {
        if (roll < 0.15) {
            gameState.son.personality.diligence = clampInt(gameState.son.personality.diligence + 1, 0, 100);
            gameState.son.personality.bravery = clampInt(gameState.son.personality.bravery - 1, 0, 100);
            showToast("📜 학자 책상: 성실 +1 · 신중 +1", 'success');
        }
    } else if (m.id === 'desk_arcane') {
        if (roll < 0.12) setNextAdventureBuff({ id: 'spark', name: '번뜩임', desc: '다음 모험 EXP가 늘고 부상 위험이 조금 줄어듭니다.', expMul: 1.12, riskMul: 0.92, source: 'desk' });
    }
}

function isFurnitureOwned(modelId) {
    ensureFurnitureState();
    return !!gameState.parent.furniture.owned[modelId];
}

function buyFurnitureModel(slot, modelId) {
    ensureFurnitureState();
    const list = furnitureModels[slot] || [];
    const m = list.find(x => x.id === modelId);
    if (!m) return;
    if (isFurnitureOwned(modelId)) {
        showToast("이미 보유한 모델입니다.", 'info');
        return;
    }
    const cost = Math.max(0, Math.floor(m.cost || 0));
    if (gameState.parent.gold < cost) {
        showToast(`골드 부족! (필요: ${cost}G)`, 'error');
        return;
    }
    gameState.parent.gold -= cost;
    gameState.parent.furniture.owned[modelId] = true;
    showToast(`🏠 ${m.name} 구매 완료! (집에서 교체 가능)`, 'success');
    updateUI();
}
window.buyFurnitureModel = buyFurnitureModel;

let currentSwapSlot = null;
function openFurnitureSwap(slot) {
    if (!slot) return;
    ensureFurnitureState();
    currentSwapSlot = slot;
    if (els.furnModalTitle) els.furnModalTitle.innerText = `🏠 ${slot === 'bed' ? '침대' : slot === 'table' ? '식탁' : slot === 'desk' ? '책상' : '훈련장'} 교체`;
    if (els.furnModalSub) {
        const note = (gameState.son.state === 'ADVENTURING')
            ? '지금 미리 바꿔두면, 아들이 돌아온 뒤 사용할 때부터 적용돼요.'
            : '보유한 모델을 골라 설치하세요.';
        els.furnModalSub.innerText = `${note} 강화는 슬롯 강화라 교체해도 유지됩니다.`;
    }
    if (els.furnModal) els.furnModal.style.display = 'flex';
    updateFurnitureSwapList();
}
window.openFurnitureSwap = openFurnitureSwap;

function closeFurnitureSwap() {
    if (els.furnModal) els.furnModal.style.display = 'none';
    currentSwapSlot = null;
}
window.closeFurnitureSwap = closeFurnitureSwap;

if (els.furnModal) {
    els.furnModal.addEventListener('click', (e) => {
        if (e.target === els.furnModal) closeFurnitureSwap();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.furnModal && els.furnModal.style.display === 'flex') closeFurnitureSwap();
});

function equipFurnitureModel(slot, modelId) {
    ensureFurnitureState();
    if (!isFurnitureOwned(modelId)) {
        showToast("먼저 마을에서 구매해야 해요.", 'warning');
        return;
    }
    gameState.parent.furniture.equipped[slot] = modelId;
    const m = (furnitureModels[slot] || []).find(x => x.id === modelId);
    showToast(`🏠 ${m?.name || '가구'}로 교체했습니다.`, 'info');
    updateUI();
    updateFurnitureSwapList();
}
window.equipFurnitureModel = equipFurnitureModel;

function updateFurnitureSwapList() {
    if (!els.furnModalList || !currentSwapSlot) return;
    ensureFurnitureState();
    const slot = currentSwapSlot;
    const equippedId = gameState.parent.furniture.equipped[slot];
    const list = furnitureModels[slot] || [];
    const lv = gameState.parent.upgrades?.[slot] || 1;
    const eff = getUpgradeEffectLabel(slot, getUpgradeEffectValue(slot, lv));
    let html = `<div style="margin-bottom:10px; font-size:0.8rem; color:#64748b; font-weight:900;">현재 강화 Lv.${lv} · ${eff}</div>`;
    html += `<div class="furn-shop-grid">`;
    for (const m of list) {
        const owned = isFurnitureOwned(m.id);
        const equipped = m.id === equippedId;
        html += `
	          <div class="furn-row ${owned ? '' : 'locked'}">
	            <div style="flex:1;">
	              <div class="furn-row-title">${m.name}</div>
	              <div class="furn-row-desc">${m.desc}</div>
	              ${m.effect ? `<div class="furn-row-effect">✨ ${m.effect}</div>` : ''}
	              <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
	                <span class="furn-chip ${owned ? 'owned' : ''}">${owned ? '보유' : `미보유 · ${m.cost}G`}</span>
	                ${equipped ? `<span class="furn-chip equipped">설치중</span>` : ''}
	              </div>
	            </div>
	            <button class="furn-btn secondary" ${owned && !equipped ? '' : 'disabled'} onclick="equipFurnitureModel('${slot}', '${m.id}')">${equipped ? '설치중' : owned ? '설치' : '구매 필요'}</button>
	          </div>
	        `;
    }
    html += `</div>`;
    els.furnModalList.innerHTML = html;
}

function renderFurnitureShop() {
    if (!els.furnShop) return;
    ensureFurnitureState();
    if (els.furnShop.dataset.ready === '1') return;
    const slots = [
        { key: 'bed', title: '🛏️ 침대' },
        { key: 'table', title: '🍽️ 식탁' },
        { key: 'desk', title: '📚 책상' },
        { key: 'dummy', title: '🤺 훈련장' }
    ];
    let html = '';
    for (const s of slots) {
        html += `<div class="hint-card" style="margin-top:10px;"><b>${s.title}</b><div style="margin-top:8px;" class="furn-shop-grid">`;
        for (const m of (furnitureModels[s.key] || [])) {
            html += `
	              <div class="furn-row" id="furn-row-${s.key}-${m.id}">
	                <div style="flex:1;">
	                  <div class="furn-row-title">${m.name}</div>
	                  <div class="furn-row-desc">${m.desc}</div>
	                  ${m.effect ? `<div class="furn-row-effect">✨ ${m.effect}</div>` : ''}
	                  <div style="margin-top:6px;"><span class="furn-chip" id="furn-chip-${s.key}-${m.id}">-</span></div>
	                </div>
	                <button class="furn-btn" id="furn-buy-${s.key}-${m.id}" onclick="buyFurnitureModel('${s.key}','${m.id}')">구매</button>
	              </div>
	            `;
        }
        html += `</div></div>`;
    }
    els.furnShop.innerHTML = html;
    els.furnShop.dataset.ready = '1';
    updateFurnitureShopUI();
}

function updateFurnitureShopUI() {
    if (!els.furnShop) return;
    ensureFurnitureState();
    const slots = ['bed', 'table', 'desk', 'dummy'];
    for (const slot of slots) {
        const equippedId = gameState.parent.furniture.equipped[slot];
        for (const m of (furnitureModels[slot] || [])) {
            const row = document.getElementById(`furn-row-${slot}-${m.id}`);
            const chip = document.getElementById(`furn-chip-${slot}-${m.id}`);
            const btn = document.getElementById(`furn-buy-${slot}-${m.id}`);
            if (!chip || !btn) continue;
            const owned = isFurnitureOwned(m.id);
            const equipped = m.id === equippedId;
            if (row) row.classList.toggle('locked', !owned);
            chip.className = `furn-chip ${owned ? (equipped ? 'equipped' : 'owned') : ''}`.trim();
            chip.innerText = owned ? (equipped ? '설치중' : '보유중') : `가격 ${m.cost}G`;
            btn.disabled = owned || m.cost === 0;
            btn.innerText = owned ? '보유' : '구매';
        }
    }
}

// --- Son Dialogues ---
const sonDialogues = {
    'SLEEPING': ["zzZ...", "음냐음냐...", "5분만 더..."],
    'EATING': ["냠냠!", "맛있다~", "엄마 요리 최고!"],
    'TRAINING': ["하앗!", "이얍!", "더 강해져야 해!"],
    'STUDYING': ["음... 이건 뭐지?", "머리가 아파...", "아 재밌다!"],
    'RESTING': ["잠깐 쉬는 중...", "후우~", "조금만 있다가 할게요."],
    'IDLE': ["심심해~", "뭐 할 거 없나...", "엄마 뭐해?", "모험 가고 싶다!"],
    'ADVENTURING': ["모험 중!", "몬스터다!", "앞으로!"]
};

// ============================================================
// Adventure difficulty (son decides by personality)
// ============================================================
const difficultyData = {
    safe: { name: '🟢 안전', duration: [240, 330], goldMul: 0.9, lootMul: 0.9, expMul: 0.95, fatigueFloor: 0.25, contactChance: 0.45, maverickChance: 0.03 },
    normal: { name: '🟡 보통', duration: [210, 300], goldMul: 1.0, lootMul: 1.0, expMul: 1.0, fatigueFloor: 0.2, contactChance: 0.7, maverickChance: 0.05 },
    risky: { name: '🔴 무리', duration: [180, 270], goldMul: 1.18, lootMul: 1.12, expMul: 1.1, fatigueFloor: 0.18, contactChance: 0.85, maverickChance: 0.09 }
};

function getAdventureDifficultyDecision() {
    ensureSonGrowthState();
    const p = gameState.son.personality || {};
    const a = gameState.son.affinity || {};
    const bravery = Number.isFinite(p.bravery) ? p.bravery : 50;
    const diligence = Number.isFinite(p.diligence) ? p.diligence : 50;
    const calmness = Number.isFinite(p.calmness) ? p.calmness : 50;
    const rebellion = Number.isFinite(a.rebellion) ? a.rebellion : 0;
    const injured = !!gameState.son.injury;

    // -1 (very safe) ~ +1 (very risky)
    let riskScore = 0;
    riskScore += (bravery - 50) / 50 * 0.85;          // 대담할수록 무리
    riskScore += (50 - diligence) / 50 * 0.55;        // 즉흥할수록 무리
    riskScore += (rebellion - 50) / 50 * 0.25;        // 반항이 높으면 더 밀어붙임
    riskScore -= (calmness - 50) / 50 * 0.35;         // 차분하면 안전
    if (injured) riskScore -= 0.9;                    // 부상이 있으면 보수적으로

    const reasons = [];
    if (injured) reasons.push("부상이 있어서 안전하게 가려 해요.");
    if (bravery >= 62) reasons.push("대담해서 더 어려운 곳도 노려요.");
    if (bravery <= 38) reasons.push("신중해서 안전을 선호해요.");
    if (diligence <= 40) reasons.push("즉흥적인 편이라 무리할 수도 있어요.");
    if (calmness >= 62) reasons.push("차분해서 리스크를 줄이려 해요.");
    if (rebellion >= 70) reasons.push("고집이 세져서 위험한 선택을 할 때도 있어요.");

    let diffKey = 'normal';
    if (riskScore >= 0.55) diffKey = 'risky';
    else if (riskScore <= -0.35) diffKey = 'safe';
    return { diffKey, riskScore, reasons: reasons.slice(0, 3) };
}

function decideAdventureDifficulty() {
    return getAdventureDifficultyDecision().diffKey;
}

// ============================================================
// Zones & Missions (RPG adventure structure)
// ============================================================
const zones = [
    // Act 1 (starter)
    { id: 'meadow', name: '햇살 초원', emoji: '🌼', recCP: 25, baseGold: 60, injuryRisk: 0.05, drops: [{ key: 'herb', prob: 35, min: 1, max: 2 }, { key: 'seed', prob: 22, min: 1, max: 2 }, { key: 'leather', prob: 18, min: 1, max: 2 }] },
    { id: 'creek', name: '맑은 시냇가', emoji: '💧', recCP: 35, baseGold: 72, injuryRisk: 0.06, drops: [{ key: 'herb', prob: 32, min: 1, max: 2 }, { key: 'seed', prob: 20, min: 1, max: 2 }, { key: 'leather', prob: 22, min: 1, max: 2 }, { key: 'monster_bone', prob: 14, min: 1, max: 1 }] },
    { id: 'burrow', name: '토끼굴 언덕', emoji: '🐾', recCP: 45, baseGold: 82, injuryRisk: 0.07, drops: [{ key: 'leather', prob: 26, min: 1, max: 2 }, { key: 'herb', prob: 26, min: 1, max: 2 }, { key: 'seed', prob: 18, min: 1, max: 2 }, { key: 'monster_bone', prob: 18, min: 1, max: 2 }] },

    // Act 2 (wolf & early combat)
    { id: 'forest', name: '속삭이는 숲', emoji: '🌲', recCP: 55, baseGold: 90, injuryRisk: 0.10, drops: [{ key: 'monster_bone', prob: 30, min: 1, max: 2 }, { key: 'wolf_fang', prob: 28, min: 1, max: 2 }, { key: 'seed', prob: 16, min: 1, max: 2 }, { key: 'leather', prob: 30, min: 1, max: 2 }] },
    { id: 'grove', name: '그늘진 숲길', emoji: '🌳', recCP: 70, baseGold: 105, injuryRisk: 0.11, drops: [{ key: 'monster_bone', prob: 26, min: 1, max: 2 }, { key: 'wolf_fang', prob: 22, min: 1, max: 2 }, { key: 'seed', prob: 12, min: 1, max: 2 }, { key: 'leather', prob: 26, min: 1, max: 2 }, { key: 'herb', prob: 16, min: 1, max: 2 }] },
    { id: 'den', name: '늑대의 굴', emoji: '🐺', recCP: 90, baseGold: 125, injuryRisk: 0.12, drops: [{ key: 'wolf_fang', prob: 34, min: 1, max: 2 }, { key: 'monster_bone', prob: 24, min: 1, max: 2 }, { key: 'leather', prob: 22, min: 1, max: 2 }, { key: 'herb', prob: 10, min: 1, max: 1 }] },

    // Act 3 (relic)
    { id: 'ruins', name: '부서진 유적', emoji: '🏛️', recCP: 110, baseGold: 140, injuryRisk: 0.14, drops: [{ key: 'magic_crystal', prob: 20, min: 1, max: 1 }, { key: 'relic_fragment', prob: 26, min: 1, max: 2 }, { key: 'monster_bone', prob: 22, min: 1, max: 2 }, { key: 'steel', prob: 26, min: 1, max: 2 }] },
    { id: 'crypt', name: '고요한 납골당', emoji: '🕯️', recCP: 135, baseGold: 165, injuryRisk: 0.15, drops: [{ key: 'relic_fragment', prob: 28, min: 1, max: 2 }, { key: 'steel', prob: 24, min: 1, max: 2 }, { key: 'magic_crystal', prob: 18, min: 1, max: 1 }, { key: 'monster_bone', prob: 18, min: 1, max: 2 }] },
    { id: 'library', name: '잊힌 서고', emoji: '📚', recCP: 160, baseGold: 185, injuryRisk: 0.16, drops: [{ key: 'relic_fragment', prob: 22, min: 1, max: 2 }, { key: 'magic_crystal', prob: 22, min: 1, max: 2 }, { key: 'steel', prob: 26, min: 1, max: 2 }, { key: 'monster_bone', prob: 14, min: 1, max: 2 }] },
    { id: 'forge', name: '잠든 제련소', emoji: '🔥', recCP: 190, baseGold: 205, injuryRisk: 0.17, drops: [{ key: 'steel', prob: 34, min: 1, max: 2 }, { key: 'magic_crystal', prob: 18, min: 1, max: 2 }, { key: 'relic_fragment', prob: 20, min: 1, max: 2 }, { key: 'monster_bone', prob: 12, min: 1, max: 2 }] },

    // Act 4 (wyvern)
    { id: 'mountain', name: '바람 산맥', emoji: '🏔️', recCP: 210, baseGold: 220, injuryRisk: 0.18, drops: [{ key: 'rare_hide', prob: 22, min: 1, max: 1 }, { key: 'wyvern_scale', prob: 20, min: 1, max: 2 }, { key: 'magic_crystal', prob: 16, min: 1, max: 1 }, { key: 'steel', prob: 18, min: 1, max: 2 }] },
    { id: 'pass', name: '빙풍 고개', emoji: '❄️', recCP: 250, baseGold: 255, injuryRisk: 0.19, drops: [{ key: 'wyvern_scale', prob: 22, min: 1, max: 2 }, { key: 'rare_hide', prob: 18, min: 1, max: 1 }, { key: 'steel', prob: 22, min: 1, max: 2 }, { key: 'magic_crystal', prob: 14, min: 1, max: 1 }] },
    { id: 'cliff', name: '폭풍 절벽', emoji: '🌩️', recCP: 290, baseGold: 285, injuryRisk: 0.21, drops: [{ key: 'wyvern_scale', prob: 24, min: 1, max: 2 }, { key: 'rare_hide', prob: 20, min: 1, max: 1 }, { key: 'steel', prob: 22, min: 1, max: 2 }, { key: 'magic_crystal', prob: 12, min: 1, max: 2 }] },
    { id: 'aerie', name: '그리핀 둥지길', emoji: '🦅', recCP: 330, baseGold: 315, injuryRisk: 0.23, drops: [{ key: 'rare_hide', prob: 24, min: 1, max: 1 }, { key: 'wyvern_scale', prob: 22, min: 1, max: 2 }, { key: 'steel', prob: 18, min: 1, max: 2 }, { key: 'magic_crystal', prob: 14, min: 1, max: 2 }] },

    // Act 5 (dragon)
    { id: 'dragon_lair', name: '드래곤 둥지', emoji: '🐉', recCP: 380, baseGold: 380, injuryRisk: 0.26, drops: [{ key: 'dragon_heart', prob: 12, min: 1, max: 1 }, { key: 'wyvern_scale', prob: 20, min: 1, max: 2 }, { key: 'magic_crystal', prob: 22, min: 1, max: 2 }, { key: 'steel', prob: 22, min: 1, max: 2 }] }
];

const missions = [
    { id: 'gather', name: '재료 수집', emoji: '🧺', rewardMul: 0.9, goldMul: 0.86, lootMul: 1.28, expMul: 0.9, riskMul: 0.8 },
    { id: 'hunt', name: '정예 처치', emoji: '🎯', rewardMul: 1.05, goldMul: 1.02, lootMul: 1.05, expMul: 1.05, riskMul: 1.1 },
    { id: 'boss', name: '보스 도전', emoji: '👑', rewardMul: 1.25, goldMul: 1.12, lootMul: 1.10, expMul: 1.15, riskMul: 1.35 }
];

function getZoneById(id) {
    return zones.find(z => z.id === id) || zones[0];
}
function getMissionById(id) {
    return missions.find(m => m.id === id) || missions[0];
}

const zoneBosses = {
    meadow: { emoji: '🐗', name: '풀숲의 멧돼지 왕' },
    creek: { emoji: '🐸', name: '시냇가의 거대 개구리' },
    burrow: { emoji: '🐰', name: '언덕의 토끼왕' },
    forest: { emoji: '🧌', name: '숲의 고블린 대장' },
    grove: { emoji: '🐍', name: '그늘숲의 뱀왕' },
    den: { emoji: '🐺', name: '늑대 우두머리' },
    ruins: { emoji: '🗿', name: '유적의 수호자' },
    crypt: { emoji: '🕯️', name: '납골당의 수호 기사' },
    library: { emoji: '📚', name: '금서의 수호자' },
    forge: { emoji: '🔥', name: '잿빛 골렘' },
    mountain: { emoji: '🦅', name: '바람의 그리핀' },
    pass: { emoji: '🐻‍❄️', name: '설산의 거대 곰' },
    cliff: { emoji: '🌩️', name: '폭풍 와이번' },
    aerie: { emoji: '🦅', name: '둥지의 그리핀' },
    dragon_lair: { emoji: '🐉', name: '고룡 아우르네스' }
};

const bossTrophiesByZone = {
    meadow: { key: 'boar_tusk', emoji: '🐗', name: '멧돼지 왕의 엄니' },
    creek: { key: 'boar_tusk', emoji: '🐗', name: '멧돼지 왕의 엄니' },
    burrow: { key: 'boar_tusk', emoji: '🐗', name: '멧돼지 왕의 엄니' },
    forest: { key: 'goblin_crown', emoji: '🧌', name: '고블린 대장 왕관' },
    grove: { key: 'goblin_crown', emoji: '🧌', name: '고블린 대장 왕관' },
    den: { key: 'goblin_crown', emoji: '🧌', name: '고블린 대장 왕관' },
    ruins: { key: 'guardian_core', emoji: '🗿', name: '수호자의 핵' },
    crypt: { key: 'guardian_core', emoji: '🗿', name: '수호자의 핵' },
    library: { key: 'guardian_core', emoji: '🗿', name: '수호자의 핵' },
    forge: { key: 'guardian_core', emoji: '🗿', name: '수호자의 핵' },
    mountain: { key: 'griffin_feather', emoji: '🦅', name: '그리핀 깃털' },
    pass: { key: 'griffin_feather', emoji: '🦅', name: '그리핀 깃털' },
    cliff: { key: 'griffin_feather', emoji: '🦅', name: '그리핀 깃털' },
    aerie: { key: 'griffin_feather', emoji: '🦅', name: '그리핀 깃털' },
    dragon_lair: { key: 'ancient_scale', emoji: '🐉', name: '고룡 비늘' }
};

const bossSealDefs = {
    meadow: {
        id: 'seal_meadow',
        name: '🌼 초원의 인장',
        desc: '집에 작은 평온이 찾아옵니다.',
        needs: { boar_tusk: 1, herb: 4, leather: 2 },
        effects: { fatigueAdd: 0.02, riskMul: 0.98 }
    },
    forest: {
        id: 'seal_forest',
        name: '🌲 숲의 인장',
        desc: '전리품을 더 잘 챙기게 됩니다.',
        needs: { goblin_crown: 1, wolf_fang: 2, leather: 3 },
        effects: { lootMul: 1.04 }
    },
    ruins: {
        id: 'seal_ruins',
        name: '🏛️ 유적의 인장',
        desc: '경험이 더 빨리 쌓입니다.',
        needs: { guardian_core: 1, steel: 4, magic_crystal: 2 },
        effects: { expMul: 1.04 }
    },
    mountain: {
        id: 'seal_mountain',
        name: '🏔️ 산맥의 인장',
        desc: '부상 위험이 조금 줄어듭니다.',
        needs: { griffin_feather: 1, rare_hide: 1, steel: 4 },
        effects: { riskMul: 0.95 }
    },
    dragon_lair: {
        id: 'seal_dragon',
        name: '🐉 고룡의 인장',
        desc: '모험의 모든 보상이 조금씩 좋아집니다.',
        needs: { ancient_scale: 1, dragon_heart: 1, steel: 8, magic_crystal: 4 },
        effects: { goldMul: 1.05, lootMul: 1.05, expMul: 1.05, riskMul: 0.96, fatigueAdd: 0.03 }
    }
};

function isBossSealCrafted(zoneId) {
    ensureBossSealState();
    return !!gameState.parent.bossSeals?.[zoneId];
}

function getBossSealPerks() {
    ensureBossSealState();
    const perks = { goldMul: 1.0, expMul: 1.0, lootMul: 1.0, riskMul: 1.0, fatigueAdd: 0.0 };
    for (const [zoneId, crafted] of Object.entries(gameState.parent.bossSeals || {})) {
        if (!crafted) continue;
        const def = bossSealDefs[zoneId];
        if (!def || !def.effects) continue;
        const e = def.effects;
        if (Number.isFinite(e.goldMul)) perks.goldMul *= e.goldMul;
        if (Number.isFinite(e.expMul)) perks.expMul *= e.expMul;
        if (Number.isFinite(e.lootMul)) perks.lootMul *= e.lootMul;
        if (Number.isFinite(e.riskMul)) perks.riskMul *= e.riskMul;
        if (Number.isFinite(e.fatigueAdd)) perks.fatigueAdd += e.fatigueAdd;
    }
    return perks;
}

function describeBossSealsShort() {
    ensureBossSealState();
    const crafted = Object.entries(gameState.parent.bossSeals || {}).filter(([, v]) => !!v).map(([k]) => bossSealDefs[k]?.name).filter(Boolean);
    if (crafted.length === 0) return '';
    return crafted.slice(0, 2).join(', ') + (crafted.length > 2 ? ` 외 ${crafted.length - 2}개` : '');
}

function craftBossSeal(zoneId) {
    ensureBossSealState();
    const def = bossSealDefs[zoneId];
    if (!def) return;
    if (isBossSealCrafted(zoneId)) {
        showToast("이미 제작한 인장입니다.", 'warning');
        return;
    }
    if (!canCraftNeeds(def.needs)) {
        showToast("재료가 부족합니다!", 'error');
        return;
    }
    consumeNeeds(def.needs);
    gameState.parent.bossSeals[zoneId] = true;
    showToast(`${def.name} 제작 완료!`, 'gold');
    updateUI();
}
window.craftBossSeal = craftBossSeal;

function describeSealEffects(e) {
    if (!e) return '';
    const parts = [];
    if (Number.isFinite(e.goldMul) && Math.abs(e.goldMul - 1) > 0.001) parts.push(`골드 x${e.goldMul.toFixed(2)}`);
    if (Number.isFinite(e.expMul) && Math.abs(e.expMul - 1) > 0.001) parts.push(`EXP x${e.expMul.toFixed(2)}`);
    if (Number.isFinite(e.lootMul) && Math.abs(e.lootMul - 1) > 0.001) parts.push(`전리품 x${e.lootMul.toFixed(2)}`);
    if (Number.isFinite(e.riskMul) && Math.abs(e.riskMul - 1) > 0.001) parts.push(`부상위험 x${e.riskMul.toFixed(2)}`);
    if (Number.isFinite(e.fatigueAdd) && Math.abs(e.fatigueAdd) > 0.0001) parts.push(`귀환 컨디션 +${Math.round(e.fatigueAdd * 100)}%p`);
    return parts.join(' · ');
}

function ensureWorldCodexState() {
    if (!gameState.parent.worldCodex || typeof gameState.parent.worldCodex !== 'object') {
        gameState.parent.worldCodex = { zones: {} };
    }
    if (!gameState.parent.worldCodex.zones || typeof gameState.parent.worldCodex.zones !== 'object') {
        gameState.parent.worldCodex.zones = {};
    }
    const zmap = gameState.parent.worldCodex.zones;
    for (const z of zones) {
        if (!zmap[z.id] || typeof zmap[z.id] !== 'object') {
            zmap[z.id] = {
                discovered: false,
                intel: 0, // 0~100
                visits: 0,
                bestOutcome: null,
                bestPartialPct: 0,
                bossDefeated: false,
                bossKills: 0,
                last: null // { missionId, outcome, pct, tick }
            };
        }
        const e = zmap[z.id];
        e.discovered = !!e.discovered;
        e.intel = Math.max(0, Math.min(100, Math.floor(e.intel || 0)));
        e.visits = Math.max(0, Math.floor(e.visits || 0));
        if (typeof e.bestOutcome !== 'string') e.bestOutcome = null;
        e.bestPartialPct = Math.max(0, Math.min(99, Math.floor(e.bestPartialPct || 0)));
        e.bossDefeated = !!e.bossDefeated;
        e.bossKills = Math.max(0, Math.floor(e.bossKills || 0));
        if (e.last && typeof e.last !== 'object') e.last = null;
    }
}

function outcomeRank(outcome) {
    const r = { fail: 0, partial: 1, success: 2, great: 3 };
    return r[outcome] ?? 0;
}

function outcomeLabel(outcome, pct) {
    if (outcome === 'great') return '대성공';
    if (outcome === 'success') return '성공';
    if (outcome === 'partial') return `부분 성공 (${Math.min(99, Math.max(0, Math.floor(pct || 0)))}%)`;
    return '실패(부분 보상)';
}

function recordWorldRun(zoneId, missionId, outcome, scoreRatio) {
    ensureWorldCodexState();
    const entry = gameState.parent.worldCodex.zones[zoneId];
    if (!entry) return { firstDiscovery: false, firstBoss: false };

    const beforeDiscovery = !!entry.discovered;
    const beforeBoss = !!entry.bossDefeated;

    entry.discovered = true;
    entry.visits += 1;

    const pct = Math.max(0, Math.min(150, Math.round((scoreRatio || 0) * 100)));
    const intelGain =
        outcome === 'great' ? 18 :
            outcome === 'success' ? 15 :
                outcome === 'partial' ? 10 :
                    5;
    const missionBonus = missionId === 'boss' ? 10 : missionId === 'hunt' ? 4 : 0;
    entry.intel = Math.min(100, entry.intel + intelGain + missionBonus);

    if (!entry.bestOutcome || outcomeRank(outcome) > outcomeRank(entry.bestOutcome)) {
        entry.bestOutcome = outcome;
    }
    if (outcome === 'partial') {
        entry.bestPartialPct = Math.max(entry.bestPartialPct || 0, Math.min(99, pct));
    }

    if (missionId === 'boss' && (outcome === 'success' || outcome === 'great')) {
        entry.bossDefeated = true;
        entry.bossKills += 1;
    }

    entry.last = { missionId, outcome, pct: Math.min(99, pct), tick: Math.floor(gameState.worldTick || 0) };
    return { firstDiscovery: !beforeDiscovery, firstBoss: !beforeBoss && entry.bossDefeated };
}

function getDropDisplayName(key) {
    if (key === 'seed') return '🌱 씨앗';
    ensureLootKey(key);
    return gameState.parent.loot[key]?.name || key;
}

function renderWorldCodexUI(currentGoalZoneId) {
    const root = document.getElementById('world-codex-list');
    if (!root) return;
    ensureWorldCodexState();

    const zmap = gameState.parent.worldCodex.zones;
    let html = '';
    for (const z of zones) {
        const e = zmap[z.id];
        const intel = e?.intel || 0;
        const highlight = (currentGoalZoneId && z.id === currentGoalZoneId);
        const boss = zoneBosses[z.id];
        const bossName =
            e?.bossDefeated
                ? `${boss?.emoji || '👑'} ${boss?.name || '보스'}`
                : `${boss?.emoji || '👑'} 소문: ${boss?.name || '이름 없는 보스'}`;
        const best = e?.bestOutcome ? (e.bestOutcome === 'partial' ? `부분 ${e.bestPartialPct || 0}%` : outcomeLabel(e.bestOutcome)) : '-';
        const last = e?.last ? (e.last.outcome === 'partial' ? `부분 ${e.last.pct}%` : outcomeLabel(e.last.outcome)) : '-';
        const recLine = intel >= 10 ? `권장CP ${z.recCP} · 부상위험 ${Math.round(z.injuryRisk * 100)}%` : '아직 정보가 부족해요.';
        const dropsLine = intel >= 30 && z.drops?.length
            ? `주요 전리품: ${z.drops.slice(0, 3).map(d => getDropDisplayName(d.key)).join(', ')}`
            : '전리품 정보: ???';

        html += `
          <div class="hint-card" style="margin-top:10px; border:${highlight ? '2px solid #0f172a' : '1px solid #e2e8f0'};">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
              <div style="min-width:0;">
                <div style="font-weight:1000; color:#0f172a;">${z.emoji} ${z.name} ${highlight ? '<span style=\"color:#0f172a; font-weight:1000;\">(목표)</span>' : ''}</div>
                <div style="margin-top:6px; font-size:0.78rem; color:#64748b;">탐험도 <b>${intel}%</b> · 방문 <b>${e?.visits || 0}</b>회 · 최고 <b>${best}</b> · 마지막 <b>${last}</b></div>
                <div style="margin-top:6px; font-size:0.78rem; color:#475569;">${recLine}</div>
                <div style="margin-top:4px; font-size:0.78rem; color:#475569;">${dropsLine}</div>
                <div style="margin-top:6px; font-size:0.78rem; color:${e?.bossDefeated ? '#f59e0b' : '#64748b'}; font-weight:900;">${bossName}${e?.bossDefeated ? ` · 격파 ${e.bossKills || 1}회` : ''}</div>
              </div>
            </div>
          </div>
        `;
    }
    root.innerHTML = html;
}

function ensureLootKey(key) {
    if (!gameState.parent.loot[key]) {
        const nameMap = {
            herb: '🌿 약초',
            monster_bone: '🦴 몬스터 뼈',
            magic_crystal: '💎 마법 결정',
            rare_hide: '🧶 희귀 가죽',
            wolf_fang: '🐺 늑대 송곳니',
            relic_fragment: '🧩 유물 파편',
            wyvern_scale: '🪶 와이번 비늘',
            dragon_heart: '❤️‍🔥 드래곤의 심장',
            boar_tusk: '🐗 멧돼지 왕의 엄니',
            goblin_crown: '🧌 고블린 대장 왕관',
            guardian_core: '🗿 수호자의 핵',
            griffin_feather: '🦅 그리핀 깃털',
            ancient_scale: '🐉 고룡 비늘',
            pretty_flower: '🌸 예쁜 꽃',
            leather: '🧵 가죽',
            steel: '🪨 강철',
            iron_scrap: '🧩 철 조각',
            arcane_dust: '✨ 마력 가루'
        };
        gameState.parent.loot[key] = { name: nameMap[key] || key, count: 0 };
    }
}

function parseTierFromGearId(id) {
    if (!id || typeof id !== 'string') return 0;
    const m = /_t(\d+)/.exec(id);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : 0;
}

function getHighestOwnedGearTier(slot) {
    const inv = gameState.parent.gearInventory?.[slot] || {};
    let best = 0;
    for (const [id, item] of Object.entries(inv)) {
        if (!item || (item.count || 0) <= 0) continue;
        best = Math.max(best, parseTierFromGearId(id));
    }
    return best;
}

function getEquippedGearTier(slot) {
    const id = gameState.son.equipment?.[slot]?.id;
    return parseTierFromGearId(id);
}

function getNextGearCraftStep(slot) {
    if (!craftConfig?.slots?.includes(slot)) return null;
    const ownedTier = getHighestOwnedGearTier(slot);
    const equippedTier = getEquippedGearTier(slot);
    const cur = Math.max(ownedTier, equippedTier);
    if (cur >= craftConfig.tierCount) return null;
    const next = cur <= 0 ? 1 : Math.min(craftConfig.tierCount, cur + 1);
    const recipe = buildGearRecipe(slot, next);
    return { slot, tier: next, recipe, curTier: cur, ownedTier, equippedTier };
}

function describePlanReasons(plan) {
    if (!plan) return '';
    const reasons = [];
    const d = plan.diffDecision;
    if (d?.reasons?.length) reasons.push(...d.reasons);
    if (Array.isArray(plan.networkReasons) && plan.networkReasons.length) reasons.push(...plan.networkReasons);

    const bravery = gameState.son.personality?.bravery ?? 50;
    const diligence = gameState.son.personality?.diligence ?? 50;
    if (plan.mission?.id === 'boss') {
        if (bravery >= 60) reasons.push("대담해서 보스에 끌려요.");
        if (diligence <= 45) reasons.push("즉흥이 있어 ‘한 번 가보자!’가 나오기도 해요.");
    } else if (plan.mission?.id === 'gather') {
        if (bravery <= 45) reasons.push("신중해서 안정적인 수집을 택했어요.");
        if (diligence >= 60) reasons.push("성실해서 ‘꾸준히’ 쌓는 걸 좋아해요.");
    } else if (plan.mission?.id === 'hunt') {
        reasons.push("너무 무리하진 않되, 성과를 내고 싶어 해요.");
    }

    return reasons.slice(0, 4).map(x => `- ${x}`).join('<br>');
}

function getLongTermGoalsMeta() {
    ensureWorldCodexState();
    const zmap = gameState.parent.worldCodex?.zones || {};
    const total = zones.length;
    const killed = zones.reduce((acc, z) => acc + (zmap[z.id]?.bossDefeated ? 1 : 0), 0);
    return `${killed}/${total} 보스 격파`;
}

function renderLongTermGoals(planZoneId) {
    ensureWorldCodexState();
    const zmap = gameState.parent.worldCodex?.zones || {};
    const remaining = zones.filter(z => !(zmap[z.id]?.bossDefeated));
    const top = remaining.slice(0, 3);
    if (top.length === 0) {
        return `<div style="font-size:0.8rem; color:#10b981; font-weight:1000;">✅ 모든 보스를 격파했습니다!</div>`;
    }
    return top.map(z => {
        const e = zmap[z.id];
        const intel = e?.intel || 0;
        const boss = zoneBosses[z.id];
        const highlight = planZoneId && z.id === planZoneId;
        const label = e ? `${intel}%` : '???';
        const bossLabel = e?.bossDefeated ? '격파 완료' : (e ? '도전 가능' : '소문만');
        return `
          <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:12px; background:${highlight ? '#0b1220' : '#ffffff'}; color:${highlight ? '#ffffff' : '#0f172a'};">
            <div style="min-width:0; font-weight:1000;">${z.emoji} ${z.name}</div>
            <div style="flex:0 0 auto; font-size:0.78rem; color:${highlight ? '#cbd5e1' : '#64748b'}; font-weight:900;">탐험 ${label} · ${boss?.emoji || '👑'} ${bossLabel}</div>
          </div>
        `;
    }).join('');
}

function isSupportPinDone(pin) {
    if (!pin || typeof pin !== 'object') return false;
    if (pin.type === 'treat') return !gameState.son.injury;
    if (pin.type === 'craftSeal') {
        const zoneId = pin.zoneId;
        if (!zoneId) return false;
        return isBossSealCrafted(zoneId);
    }
    if (pin.type === 'craftGear') {
        const slot = pin.slot;
        const tier = Math.max(1, Math.min(10, Math.floor(pin.tier || 1)));
        const id = `${slot}_t${tier}`;
        const inv = gameState.parent.gearInventory?.[slot] || {};
        const owned = (inv[id]?.count || 0) > 0;
        const equipped = gameState.son.equipment?.[slot]?.id === id;
        return owned || equipped;
    }
    if (pin.type === 'craftMilestone') {
        const w = gameState.parent.specialWeaponInventory?.[pin.weaponId];
        const owned = (w?.count || 0) > 0;
        const equipped = gameState.son.equipment?.weapon?.id === pin.weaponId;
        return owned || equipped;
    }
    if (pin.type === 'cook') {
        ensureKitchenState();
        const cooking = gameState.parent.kitchen?.cooking;
        if (cooking?.recipeId === pin.recipeId) return false;
        const inv = gameState.parent.inventory?.[pin.recipeId];
        if ((inv?.count || 0) > 0) return true;
        const placed = gameState.rooms?.['room-table']?.placedItem;
        return placed === pin.recipeId;
    }
    if (pin.type === 'bookshelf') {
        ensureLibraryState();
        const shelf = gameState.parent.library?.shelf || [];
        return shelf.some(Boolean);
    }
    if (pin.type === 'buySandbag') {
        const inv = gameState.parent.inventory?.sandbag;
        return (inv?.count || 0) > 0;
    }
    return false;
}

function renderSupportPinUI(plan) {
    const root = document.getElementById('support-pin');
    if (!root) return;
    ensureSupportPinState();
    const pin = gameState.parent.supportPin;
    if (!pin) {
        root.innerHTML = `<div style="font-size:0.78rem; color:#64748b;">아직 핀한 서포트가 없어요.</div>`;
        return;
    }

    const done = isSupportPinDone(pin);
    let title = '📌 핀';
    let sub = '';
    if (pin.type === 'treat') {
        const cost = gameState.son.injury?.hospitalCost || 0;
        title = `🏥 치료하기`;
        sub = gameState.son.injury ? `부상: ${gameState.son.injury.label || '부상'} · 비용 ${cost}G` : `부상이 없어요.`;
    } else if (pin.type === 'craftSeal') {
        const def = bossSealDefs?.[pin.zoneId];
        const z = getZoneById(pin.zoneId);
        title = `🏆 인장 제작: ${def?.name || '인장'}`;
        const effect = def ? describeSealEffects(def.effects) : '';
        sub = def
            ? `${z.emoji} ${z.name}${effect ? ` · ${effect}` : ''}<br>${needsText(def.needs)}`
            : '';
    } else if (pin.type === 'craftGear') {
        const step = buildGearRecipe(pin.slot, Math.max(1, Math.min(10, Math.floor(pin.tier || 1))));
        title = `🧵 제작: ${step.name}`;
        let extra = '';
        if (step.needsGear) {
            const equippedId = gameState.son.equipment?.[pin.slot]?.id;
            if (equippedId === step.needsGear.id) {
                extra = `<br><span style="color:#64748b;">※ 이전 장비가 현재 착용중이에요. (옷장에서 잠깐 해제/교체하면 승급 가능)</span>`;
            }
        }
        sub = `${gearNeedText(pin.slot, step.needsGear)}${step.needsGear ? '<br>' : ''}${needsText(step.needs)}${extra}`;
    } else if (pin.type === 'craftMilestone') {
        const def = craftConfig.milestoneWeapons.find(m => m.id === pin.weaponId);
        title = `🗡️ 제작: ${def?.name || pin.weaponId}`;
        sub = def ? needsText(def.needs) : '';
    } else if (pin.type === 'cook') {
        const r = recipes.find(x => x.id === pin.recipeId);
        title = `🍳 요리: ${r?.name || pin.recipeId}`;
        sub = r ? needsTextFromRecipe(r) : '';
    } else if (pin.type === 'bookshelf') {
        title = `📚 책장 배치`;
        sub = `아들이 마음에 드는 책만 읽을지도 몰라요.`;
    } else if (pin.type === 'buySandbag') {
        title = `🏋️ 모래주머니 구매`;
        sub = `훈련 효율을 올려줘요.`;
    }

    root.innerHTML = `
      <div class="support-row pinned ${done ? 'done' : ''}">
        <div style="flex:1; min-width:0;">
          <div class="support-title">${done ? '✅ ' : ''}${title}</div>
          <div class="support-sub">${sub}</div>
        </div>
        <div class="support-actions">
          <button class="mini-btn secondary" type="button" onclick="goToSupportPin()">바로가기</button>
          <button class="mini-btn" type="button" onclick="clearSupportPin()">해제</button>
        </div>
      </div>
    `;
}

function renderSupportSuggestionsUI(plan) {
    const root = document.getElementById('support-suggestions');
    if (!root) return;
    ensureSupportPinState();

    const suggestions = [];
    if (gameState.son.injury) suggestions.push({ type: 'treat' });

    // If craftable: suggest boss seal crafting (unlocks growth-tree content)
    const craftableSeals = zones
        .map(z => z.id)
        .filter(id => bossSealDefs?.[id] && !isBossSealCrafted(id) && canCraftNeeds(bossSealDefs[id].needs));
    if (craftableSeals.length) {
        const prefer = plan?.zone?.id;
        const pick = (prefer && craftableSeals.includes(prefer)) ? prefer : craftableSeals[0];
        suggestions.push({ type: 'craftSeal', zoneId: pick });
    }

    // If struggling: prioritize armor upgrades
    const score = plan ? (plan.cp / Math.max(1, plan.zone.recCP)) : 1;
    if (plan && score < 1.0) {
        const armorStep = getNextGearCraftStep('armor');
        const helmStep = getNextGearCraftStep('helmet');
        const bootsStep = getNextGearCraftStep('boots');
        [armorStep, helmStep, bootsStep].filter(Boolean).slice(0, 2).forEach(s => {
            suggestions.push({ type: 'craftGear', slot: s.slot, tier: s.tier });
        });
    }

    // Boss or risky -> survivability meal
    if (plan && (plan.mission?.id === 'boss' || plan.diffKey === 'risky')) {
        suggestions.push({ type: 'cook', recipeId: 'herb_potion' });
    }

    // If bookshelf empty -> suggest placing/buying books
    ensureLibraryState();
    const shelfHasAny = (gameState.parent.library?.shelf || []).some(Boolean);
    if (!shelfHasAny) suggestions.push({ type: 'bookshelf' });

    // Training tool suggestion (if none)
    const sandbagCount = gameState.parent.inventory?.sandbag?.count || 0;
    if (sandbagCount <= 0) suggestions.push({ type: 'buySandbag' });

    const uniq = [];
    const keyOf = (s) => `${s.type}:${s.zoneId || ''}:${s.slot || ''}:${s.tier || ''}:${s.recipeId || ''}:${s.weaponId || ''}`;
    const seen = new Set();
    for (const s of suggestions) {
        const k = keyOf(s);
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(s);
        if (uniq.length >= 4) break;
    }

    if (uniq.length === 0) {
        root.innerHTML = `<div style="font-size:0.78rem; color:#64748b;">지금은 큰 준비 없이도 괜찮아 보여요.</div>`;
        return;
    }

    root.innerHTML = uniq.map(s => {
        let title = '서포트';
        let sub = '';
        if (s.type === 'treat') {
            const cost = gameState.son.injury?.hospitalCost || 0;
            title = `🏥 치료하기`;
            sub = `부상 회복 (비용 ${cost}G)`;
        } else if (s.type === 'craftSeal') {
            const def = bossSealDefs?.[s.zoneId];
            const z = getZoneById(s.zoneId);
            const effect = def ? describeSealEffects(def.effects) : '';
            title = `🏆 인장: ${def?.name || '인장'}`;
            sub = def ? `${z.emoji} ${z.name}${effect ? ` · ${effect}` : ''}<br>${needsText(def.needs)}` : '';
        } else if (s.type === 'craftGear') {
            const step = buildGearRecipe(s.slot, s.tier);
            title = `🧵 제작: ${step.name}`;
            let extra = '';
            if (step.needsGear) {
                const equippedId = gameState.son.equipment?.[s.slot]?.id;
                if (equippedId === step.needsGear.id) {
                    extra = `<br><span style="color:#64748b;">※ 이전 장비가 착용중이에요.</span>`;
                }
            }
            sub = `${needsText(step.needs)}${step.needsGear ? `<br>${gearNeedText(s.slot, step.needsGear)}` : ''}${extra}`;
        } else if (s.type === 'cook') {
            const r = recipes.find(x => x.id === s.recipeId);
            title = `🍳 요리: ${r?.name || s.recipeId}`;
            sub = r ? needsTextFromRecipe(r) : '';
        } else if (s.type === 'bookshelf') {
            title = `📚 책장 준비`;
            sub = `서점에서 책을 사고, 책장에 배치해요.`;
        } else if (s.type === 'buySandbag') {
            title = `🏋️ 모래주머니`;
            sub = `잡화점에서 구매 → 훈련장에 배치하면 효율이 올라요.`;
        }
        const task = JSON.stringify(s).replace(/"/g, '&quot;');
        return `
          <div class="support-row">
            <div style="flex:1; min-width:0;">
              <div class="support-title">${title}</div>
              <div class="support-sub">${sub}</div>
            </div>
            <div class="support-actions">
              <button class="mini-btn" type="button" onclick="pinSupportTask(${task})">📌 핀</button>
            </div>
          </div>
        `;
    }).join('');
}

// ============================================================
// Objective system (son's current goal that persists)
// ============================================================
function newObjectiveId() {
    return `obj_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function ensureObjectiveState() {
    if (!gameState.son || typeof gameState.son !== 'object') gameState.son = {};
    const o = gameState.son.objective;
    if (!o) return;
    if (typeof o !== 'object' || !o.id || !o.zoneId || !o.missionId || !o.type) {
        gameState.son.objective = null;
        return;
    }
}

function getObjectiveProgress(o) {
    ensureWorldCodexState();
    const zmap = gameState.parent.worldCodex?.zones || {};
    const entry = zmap[o.zoneId] || null;
    const zone = getZoneById(o.zoneId);
    const mission = getMissionById(o.missionId);
    const last = entry?.last || null;

    if (o.type === 'boss') {
        const done = !!entry?.bossDefeated;
        const lastText = last
            ? (last.outcome === 'partial' ? `마지막: 부분 ${last.pct}%` : `마지막: ${outcomeLabel(last.outcome)}`)
            : '마지막: -';
        return { done, label: `보스 격파`, sub: `${zoneBosses[o.zoneId]?.emoji || '👑'} ${zoneBosses[o.zoneId]?.name || '보스'} · ${lastText}` };
    }
    if (o.type === 'intel') {
        const cur = entry?.intel || 0;
        const target = clampInt(o.targetIntel || 60, 10, 100);
        const done = cur >= target;
        return { done, label: `탐험도 ${cur}/${target}%`, sub: `던전 정보를 모아두면 더 안전해져요.` };
    }
    // hunt / success objective
    const targetPct = clampInt(o.targetPct || 100, 60, 150);
    const lastPct = (last && last.missionId === o.missionId) ? (last.pct || 0) : 0;
    const done = (last && last.missionId === o.missionId) && (lastPct >= targetPct);
    const lastText = (last && last.missionId === o.missionId)
        ? (last.outcome === 'partial' ? `부분 ${last.pct}%` : outcomeLabel(last.outcome))
        : '-';
    return { done, label: `성공 ${lastPct}/${targetPct}%`, sub: `목표 미션: ${mission.emoji} ${mission.name} · 최근: ${lastText}` };
}

function deriveObjectiveFromPlan(plan) {
    const zoneId = plan?.zone?.id;
    const missionId = plan?.mission?.id;
    if (!zoneId || !missionId) return null;
    ensureWorldCodexState();
    const entry = gameState.parent.worldCodex?.zones?.[zoneId];
    const intelNow = entry?.intel || 0;

    let type = 'hunt';
    let targetIntel = null;
    let targetPct = 100;
    if (missionId === 'boss') type = 'boss';
    else if (missionId === 'gather') {
        type = 'intel';
        targetIntel = clampInt(Math.max(40, intelNow + 25), 10, 100);
    } else {
        type = 'hunt';
        targetPct = 100;
    }

    return {
        id: newObjectiveId(),
        type,
        zoneId,
        missionId,
        targetIntel,
        targetPct,
        createdTick: Math.floor(gameState.worldTick || 0),
        tries: 0
    };
}

function ensureObjectiveFromPlan(plan) {
    ensureObjectiveState();
    const o = gameState.son.objective;
    if (o) {
        const p = getObjectiveProgress(o);
        if (!p.done) return;
        gameState.son.objective = null;
    }
    const next = deriveObjectiveFromPlan(plan);
    if (next) gameState.son.objective = next;
}

function renderObjectiveChecklistHtml(plan, objective) {
    // Lightweight “support checklist” that makes next actions obvious.
    const items = [];

    if (gameState.son.injury) {
        const cost = gameState.son.injury?.hospitalCost || 0;
        items.push({
            done: false,
            title: `🏥 치료 (${cost}G)`,
            action: `<button class="mini-btn" type="button" onclick="treatInjuryAtHospital()">치료</button>`
        });
    }

    const oType = objective?.type || (plan?.mission?.id === 'boss' ? 'boss' : plan?.mission?.id === 'gather' ? 'intel' : 'hunt');
    if (oType === 'boss' || plan?.diffKey === 'risky') {
        items.push({
            done: isSupportPinDone({ type: 'cook', recipeId: 'herb_potion' }),
            title: `🍵 약초 물약 준비`,
            action: `<button class="mini-btn secondary" type="button" onclick="setMainView('home'); setHomeRoomView('room-table'); openKitchenCookMenu();">주방</button>`
        });
    }

    const armorStep = getNextGearCraftStep('armor');
    if (armorStep) {
        items.push({
            done: isSupportPinDone({ type: 'craftGear', slot: 'armor', tier: armorStep.tier }),
            title: `🧵 다음 갑옷 T${armorStep.tier} 준비`,
            action: `<button class="mini-btn secondary" type="button" onclick="setMainView('town'); openTownSection('smith'); setSmithyTab('craft');">대장간</button>`
        });
    }

    ensureLibraryState();
    const shelfHasAny = (gameState.parent.library?.shelf || []).some(Boolean);
    items.push({
        done: !!shelfHasAny,
        title: `📚 책장에 책 두기`,
        action: `<button class="mini-btn secondary" type="button" onclick="setMainView('home'); setHomeRoomView('room-desk'); openBookshelfManager();">책장</button>`
    });

    const uniq = [];
    for (const it of items) {
        if (uniq.length >= 4) break;
        uniq.push(it);
    }
    return uniq.map(it => {
        const mark = it.done ? '✅' : '☐';
        const color = it.done ? '#10b981' : '#0f172a';
        return `
          <div class="support-row ${it.done ? 'done' : ''}" style="align-items:center;">
            <div style="flex:1; min-width:0;">
              <div class="support-title" style="color:${color};">${mark} ${it.title}</div>
            </div>
            <div class="support-actions">${it.action || ''}</div>
          </div>
        `;
    }).join('');
}

function getNetworkPlanSig() {
    ensureNetworkState();
    const n = gameState.son.network || {};
    const buddyId = n.buddy?.id ? String(n.buddy.id) : '';
    const contacts = Array.isArray(n.contacts) ? n.contacts : [];
    const friendCount = contacts.filter(c => c?.kind === 'friend').length;
    const mentorCount = contacts.filter(c => c?.kind === 'mentor').length;
    const inspirationZones = contacts
        .filter(c => c?.kind === 'inspiration' && typeof c.id === 'string' && c.id.startsWith('inspiration_'))
        .map(c => c.id.replace('inspiration_', ''))
        .filter(Boolean)
        .sort()
        .slice(0, 6)
        .join(',');
    return `${buddyId}|f${friendCount}|m${mentorCount}|z:${inspirationZones}`;
}

function planAdventureGoal(options = {}) {
    const { refresh = false } = options;
    const cp = getSonCombatPower();
    const job = getAdventureJobPerks();
    const bravery = gameState.son.personality.bravery;
    const diligence = gameState.son.personality.diligence;
    const diffDecision = getAdventureDifficultyDecision();
    const diffKey = diffDecision.diffKey;
    const diff = difficultyData[diffKey] || difficultyData.normal;
    ensureNetworkState();
    ensureWorldCodexState();
    const networkReasons = [];
    const netSig = getNetworkPlanSig();
    const n = gameState.son.network || {};
    const contacts = Array.isArray(n.contacts) ? n.contacts : [];
    const buddy = n.buddy || null;
    const hasBuddy = !!buddy;
    const friendCount = contacts.filter(c => c?.kind === 'friend').length;
    const mentorCount = contacts.filter(c => c?.kind === 'mentor').length;
    const inspirationZones = new Set(
        contacts
            .filter(c => c?.kind === 'inspiration' && typeof c.id === 'string' && c.id.startsWith('inspiration_'))
            .map(c => c.id.replace('inspiration_', ''))
            .filter(Boolean)
    );

    ensureObjectiveState();
    if (!refresh && gameState.son.objective) {
        const o = gameState.son.objective;
        const prog = getObjectiveProgress(o);
        if (!prog.done) {
            return { zone: getZoneById(o.zoneId), mission: getMissionById(o.missionId), diffKey, diff, cp, diffDecision, objective: o };
        }
        gameState.son.objective = null;
    }

    if (!refresh && gameState.son.plannedGoal && gameState.son.plannedGoal.diffKey === diffKey) {
        const cached = gameState.son.plannedGoal;
        const cpDrift = Math.abs((cached.cp || cp) - cp);
        if (cpDrift <= 12 && String(cached.netSig || '') === String(netSig)) {
            return { zone: getZoneById(cached.zoneId), mission: getMissionById(cached.missionId), diffKey, diff, cp, diffDecision };
        }
    }

    const braveryFactor = (bravery - 50) / 50; // -1..1
    const desiredRec = cp * (1 + braveryFactor * 0.45) * (job.planRecMul || 1.0);

    // Difficulty acts as a soft cap: safe -> avoid overshoot, risky -> allow more overshoot
    const overshootCap = diffKey === 'safe' ? 1.15 : diffKey === 'risky' ? 1.55 : 1.30;
    let extraCap = 0;
    if (hasBuddy) extraCap += 0.14;
    extraCap += Math.min(0.12, friendCount * 0.03);
    extraCap += Math.min(0.06, mentorCount * 0.02);
    const extraCapMax = diffKey === 'safe' ? 0.08 : diffKey === 'risky' ? 0.22 : 0.16;
    extraCap = Math.max(0, Math.min(extraCapMax, extraCap));
    const maxRec = cp * overshootCap * (1 + extraCap);
    if (hasBuddy) networkReasons.push(`동료 ${buddy.name}와(과) 함께라 조금 더 멀리도 생각해요.`);
    else if (friendCount >= 2) networkReasons.push("친구가 생겨서, 조금 더 멀리도 도전해볼 용기가 나요.");
    else if (mentorCount >= 1) networkReasons.push("선생님의 조언 덕분에, 준비가 더 단단해졌어요.");

    let chosen = zones[0];
    let bestScore = -99999;
    for (const z of zones) {
        const entry = gameState.parent.worldCodex?.zones?.[z.id] || null;
        const hinted = inspirationZones.has(z.id);
        const capPenalty = z.recCP > maxRec ? -9999 : 0;
        const closeness = -Math.abs(z.recCP - desiredRec) / Math.max(1, cp);
        const progression = Math.min(1, z.recCP / Math.max(1, cp));
        const braveBonus = bravery >= 60 ? progression * 0.08 : 0;
        const safePenaltyFactor = hasBuddy ? 0.65 : 1.0;
        const safeBonus = bravery <= 40 ? (z.recCP <= cp ? 0.06 : -0.12 * safePenaltyFactor) : 0;
        const hintBonus = hinted ? 0.11 : 0;
        const exploreBonus = (!entry?.discovered && friendCount > 0) ? (0.03 + Math.min(0.04, friendCount * 0.01)) : 0;
        const score = capPenalty + closeness + braveBonus + safeBonus + hintBonus + exploreBonus;
        if (score > bestScore) { bestScore = score; chosen = z; }
    }
    if (inspirationZones.has(chosen.id)) networkReasons.push(`인연에게서 ${chosen.name} 소문을 들었어요.`);

    // Mission choice: brave+impulsive => boss/hunt more often, cautious/diligent => gather
    const impulsive = clamp01((50 - diligence) / 50);
    const cautious = clamp01((50 - bravery) / 50);
    let wGather = 0.45 + cautious * 0.35 + (diligence >= 60 ? 0.08 : 0) - impulsive * 0.12;
    let wHunt = 0.35 + clamp01((bravery - 50) / 50) * 0.25;
    let wBoss = 0.20 + clamp01((bravery - 50) / 50) * 0.35 + impulsive * 0.18;
    wGather += (job.wGatherAdd || 0);
    wHunt += (job.wHuntAdd || 0);
    wBoss += (job.wBossAdd || 0);
    // Network influence: friends/mentors make harder missions feel more plausible.
    if (mentorCount > 0) wBoss += Math.min(0.06, mentorCount * 0.02);
    if (friendCount > 0) {
        wBoss += Math.min(0.06, friendCount * 0.015);
        wHunt += Math.min(0.04, friendCount * 0.01);
    }
    if (hasBuddy) {
        wBoss += 0.09;
        wHunt += 0.04;
        wGather -= 0.02;
    }
    // Rumors about a zone: either gather intel first, or go for the big challenge if intel is enough.
    if (inspirationZones.has(chosen.id)) {
        const intel = gameState.parent.worldCodex?.zones?.[chosen.id]?.intel || 0;
        if (intel < 30) wGather += 0.06;
        else wBoss += 0.06;
        wHunt += 0.02;
    }
    wGather = Math.max(0.05, wGather);
    wHunt = Math.max(0.05, wHunt);
    wBoss = Math.max(0.05, wBoss);
    const total = Math.max(0.01, wGather + wHunt + wBoss);
    const r = Math.random() * total;
    const mission = r < wGather ? getMissionById('gather') : r < wGather + wHunt ? getMissionById('hunt') : getMissionById('boss');

    gameState.son.plannedGoal = { zoneId: chosen.id, missionId: mission.id, diffKey, cp, netSig };
    const plan = { zone: chosen, mission, diffKey, diff, cp, diffDecision, networkReasons: networkReasons.slice(0, 3) };
    ensureObjectiveFromPlan(plan);
    return { ...plan, objective: gameState.son.objective };
}

// ============================================================
// Pixel Art (optional assets with emoji fallback)
// ============================================================
const pixelArt = {
    srcStatus: new Map(), // src -> 'pending' | 'loaded' | 'failed'
    sonSrcByState: {
        'IDLE': 'assets/pixel/son_idle.png',
        'SLEEPING': 'assets/pixel/son_sleeping.png',
        'EATING': 'assets/pixel/son_eating.png',
        'TRAINING': 'assets/pixel/son_training.png',
        'STUDYING': 'assets/pixel/son_studying.png',
        'RESTING': 'assets/pixel/son_sleeping.png',
        'ADVENTURING': 'assets/pixel/son_adventuring.png'
    },
    preload(src) {
        if (!src) return;
        const status = this.srcStatus.get(src);
        if (status) return;
        this.srcStatus.set(src, 'pending');
        const img = new Image();
        img.onload = () => this.srcStatus.set(src, 'loaded');
        img.onerror = () => this.srcStatus.set(src, 'failed');
        img.src = src;
    },
    isLoaded(src) { return this.srcStatus.get(src) === 'loaded'; },
    isFailed(src) { return this.srcStatus.get(src) === 'failed'; }
};

function initPixelAssets() {
    // 1) Attach load/error listeners to toggle emoji fallback per object
    document.querySelectorAll('img[data-pixel]').forEach(img => {
        const container = img.closest('.son-emoji') || img.closest('.furniture');
        if (!container) return;

        const markLoaded = () => container.classList.add('pixel-loaded');
        const markError = () => container.classList.remove('pixel-loaded');

        img.addEventListener('load', markLoaded);
        img.addEventListener('error', markError);
        if (img.complete && img.naturalWidth > 0) markLoaded();
    });

    // 2) Preload son state sprites so swapping doesn't flicker
    Object.values(pixelArt.sonSrcByState).forEach(src => pixelArt.preload(src));
}

function updateSonPixelSprite() {
    const img = document.querySelector('img[data-pixel="son"]');
    if (!img) return;

    const desired = pixelArt.sonSrcByState[gameState.son.state] || pixelArt.sonSrcByState.IDLE;
    const fallback = pixelArt.sonSrcByState.IDLE;

    pixelArt.preload(desired);
    pixelArt.preload(fallback);

    const srcToUse =
        pixelArt.isLoaded(desired) ? desired :
        pixelArt.isFailed(desired) && pixelArt.isLoaded(fallback) ? fallback :
        desired;

    if (img.getAttribute('src') !== srcToUse) {
        img.setAttribute('src', srcToUse);
    }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clampInt(v, min, max) { return Math.max(min, Math.min(max, Math.floor(v))); }

function formatMmSs(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

function etaRangeFromRemaining(remainingSeconds) {
    const rem = Math.max(0, remainingSeconds);
    const diligence = gameState.son.personality?.diligence ?? 50;
    const predict = clamp01(diligence / 100); // 성실할수록 예측 가능
    const spread = 0.25 - (predict * 0.15); // 0.10~0.25
    const min = rem * (1 - spread);
    const max = rem * (1 + spread * 1.4);
    return { min: Math.max(0, Math.floor(min)), max: Math.max(0, Math.floor(max)) };
}

function formatLastContact(secondsAgo) {
    const s = Math.max(0, Math.floor(secondsAgo));
    if (s < 10) return '방금 전';
    if (s < 60) return `${s}초 전`;
    const m = Math.floor(s / 60);
    return `${m}분 전`;
}

function getSonAtk() {
    ensureSonGrowthState();
    const eq = gameState.son.equipment;
    const base = (eq.weapon?.atk || 0) + (eq.helmet?.atk || 0) + (eq.armor?.atk || 0) + (eq.boots?.atk || 0);
    const s = gameState.son.stats;
    const phys = Number.isFinite(s.physAtk) ? s.physAtk : 0;
    const accBonus = Number.isFinite(s.accuracy) ? Math.floor(s.accuracy / 25) : 0;
    return base + phys + accBonus;
}
function getSonDef() {
    ensureSonGrowthState();
    const eq = gameState.son.equipment;
    const base = (eq.weapon?.def || 0) + (eq.helmet?.def || 0) + (eq.armor?.def || 0) + (eq.boots?.def || 0);
    const s = gameState.son.stats;
    const resBonus = Number.isFinite(s.magicRes) ? Math.floor(s.magicRes * 0.6) : 0;
    const agiBonus = Number.isFinite(s.agility) ? Math.floor(s.agility / 30) : 0;
    return base + resBonus + agiBonus;
}
function getEquipAtkSum() {
    const eq = gameState.son.equipment;
    return (eq.weapon?.atk || 0) + (eq.helmet?.atk || 0) + (eq.armor?.atk || 0) + (eq.boots?.atk || 0);
}
function getEquipDefSum() {
    const eq = gameState.son.equipment;
    return (eq.weapon?.def || 0) + (eq.helmet?.def || 0) + (eq.armor?.def || 0) + (eq.boots?.def || 0);
}
function getConditionMultiplier() {
    const hpPct = gameState.son.maxHp > 0 ? gameState.son.hp / gameState.son.maxHp : 0;
    const hungerPct = gameState.son.maxHunger > 0 ? gameState.son.hunger / gameState.son.maxHunger : 0;
    const avg = clamp01((hpPct + hungerPct) / 2);
    return 0.85 + (avg * 0.35); // 0.85 ~ 1.2
}
function getLevelMultiplier() {
    return 1 + Math.max(0, gameState.son.level - 1) * 0.08;
}
function getSonCombatPower() {
    ensureSonGrowthState();
    const atk = getSonAtk();
    const def = getSonDef();
    const s = gameState.son.stats;
    const magicAtk = Number.isFinite(s.magicAtk) ? s.magicAtk : 0;
    const accuracy = Number.isFinite(s.accuracy) ? s.accuracy : 0;
    const agility = Number.isFinite(s.agility) ? s.agility : 0;
    const magicRes = Number.isFinite(s.magicRes) ? s.magicRes : 0;
    const atkTotal = atk + Math.floor(magicAtk * 0.8) + Math.floor(accuracy * 0.15);
    const defTotal = def + Math.floor(magicRes * 0.35) + Math.floor(agility * 0.2);
    const base = (atkTotal + 1) * (1 + defTotal * 0.06) + Math.floor(gameState.son.maxHp / 40);
    ensureNetworkState();
    const buddyBonus = Math.max(0, Math.floor(gameState.son.network?.buddy?.cpBonus || 0));
    const injuryMul = gameState.son.injury?.cpMul ?? 1.0;
    const total = Math.floor(base * getLevelMultiplier() * getConditionMultiplier() * injuryMul) + buddyBonus;
    return Math.max(1, total);
}

function getTrainingTypeFromDummyModel() {
    const m = getFurnitureModel('dummy');
    if (m.id === 'dummy_strength') return 'strength';
    if (m.id === 'dummy_magic') return 'magic';
    if (m.id === 'dummy_archery') return 'archery';
    if (m.id === 'dummy_basic') return 'random';
    if (m.id === 'dummy_legend') return 'legend';
    return 'random';
}

function pickLegendTrainingType() {
    ensureSonGrowthState();
    const tm = gameState.son.trainingMastery;
    const entries = [
        ['strength', tm.strength || 0],
        ['magic', tm.magic || 0],
        ['archery', tm.archery || 0]
    ];
    entries.sort((a, b) => a[1] - b[1]);
    const lowest = entries[0][0];
    const second = entries[1][0];
    return Math.random() < 0.7 ? lowest : second;
}

function resolveTrainingType() {
    const t = getTrainingTypeFromDummyModel();
    if (t === 'strength' || t === 'magic' || t === 'archery') return t;
    if (t === 'legend') return pickLegendTrainingType();
    // random
    const r = Math.random();
    return r < 0.34 ? 'strength' : r < 0.67 ? 'magic' : 'archery';
}

function applyTrainingGrowth(type, toolBonus = false) {
    ensureSonGrowthState();
    const s = gameState.son.stats;
    const p = gameState.son.personality;
    const tm = gameState.son.trainingMastery;
    const masteryInc = toolBonus ? 2 : 1;

    const addStat = (k, v) => { s[k] = clampInt((s[k] || 0) + v, 0, 999); };
    const addTrait = (k, v) => { p[k] = clampInt((p[k] ?? 50) + v, 0, 100); };
    const addMastery = (k, v) => { tm[k] = clampInt((tm[k] || 0) + v, 0, 999); };

    if (type === 'strength') {
        const hpInc = toolBonus ? 3 : 2;
        gameState.son.maxHp += hpInc;
        gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + hpInc);
        addStat('physAtk', 1);
        addTrait('endurance', 1);
        addTrait('bravery', 1);
        addMastery('strength', masteryInc);
        return { label: '💪 근력 훈련', summary: `최대HP +${hpInc} · 물공 +1 · 인내 +1` };
    }
    if (type === 'magic') {
        addStat('magicAtk', 1);
        addStat('magicRes', 1);
        addTrait('intelligence', 1);
        addTrait('calmness', 1);
        addMastery('magic', masteryInc);
        return { label: '✨ 마법 훈련', summary: `마공 +1 · 마저 +1 · 지능 +1 · 차분 +1` };
    }
    if (type === 'archery') {
        addStat('physAtk', 1);
        addStat('agility', 1);
        addStat('accuracy', 1);
        addTrait('focus', 1);
        addMastery('archery', masteryInc);
        return { label: '🏹 사격 훈련', summary: `물공 +1 · 민첩 +1 · 명중 +1 · 집중 +1` };
    }
    return { label: '🤺 기본 훈련', summary: '' };
}

function getJobInfo() {
    ensureSonGrowthState();
    const tm = gameState.son.trainingMastery;
    const p = gameState.son.personality;
    const s = gameState.son.stats;
    const lv = clampInt(gameState.son.level || 1, 1, 999);
    const stage = getJobStage();
    const stageTxt = jobStageLabel(stage);
    const { topV } = getTrainingMasteryTop();
    const nextTxt =
        stage >= 2 ? `<span style="color:#10b981;">✅ 전직 최고 단계</span>` :
        stage >= 1 ? `다음 전직: Lv.10 & 숙련 22 (현재 Lv.${lv} · 숙련 ${topV})` :
        `전직 조건: Lv.5 & 숙련 10 (현재 Lv.${lv} · 숙련 ${topV})`;

    const entries = [
        { key: 'strength', v: tm.strength || 0, name: '근력' },
        { key: 'magic', v: tm.magic || 0, name: '마법' },
        { key: 'archery', v: tm.archery || 0, name: '사격' }
    ].sort((a, b) => b.v - a.v);

    const top = entries[0];
    const second = entries[1];
    const maxV = top.v;
    const margin = maxV - second.v;

    const tier =
        maxV >= 24 ? '전문가' :
        maxV >= 14 ? '숙련자' :
        maxV >= 6 ? '견습' :
        '초보';

    if (maxV < 4 || margin < 2) {
        return {
            title: `🧑‍🌾 ${tier} 모험가`,
            subHtml: `근력 ${tm.strength || 0} · 마법 ${tm.magic || 0} · 사격 ${tm.archery || 0}<br><span style="color:#64748b;">아직은 다양한 길을 고민 중이에요.</span><br><span style="color:#64748b;">전직 단계: <b>${stageTxt}</b> · ${nextTxt}</span>`
        };
    }

    if (top.key === 'strength') {
        const role = p.endurance >= 60 || gameState.son.maxHp >= 160 ? '🛡️ 수호자' : '⚔️ 기사';
        const perk = role.includes('수호자')
            ? '부상 위험 감소 · 귀환 컨디션 소폭 상승'
            : '골드 소폭 증가 · 부상 위험 소폭 감소';
        return {
            title: `${role} (${tier} · ${stageTxt})`,
            subHtml: `근력 숙련 ${tm.strength || 0} · 최대HP ${gameState.son.maxHp} · 물공 ${s.physAtk || 0} · 인내 ${p.endurance}<br><span style="color:#64748b;">모험 특성: ${perk}</span><br><span style="color:#64748b;">${nextTxt}</span>`
        };
    }
    if (top.key === 'magic') {
        const role = p.calmness >= 60 ? '🙏 사제' : '🧙‍♂️ 마법사';
        const perk = role.includes('사제')
            ? '부상 위험 감소 · 귀환 컨디션 상승'
            : 'EXP 증가 · 전리품 소폭 증가';
        return {
            title: `${role} (${tier} · ${stageTxt})`,
            subHtml: `마법 숙련 ${tm.magic || 0} · 마공 ${s.magicAtk || 0} · 마저 ${s.magicRes || 0} · 지능 ${p.intelligence} · 차분 ${p.calmness}<br><span style="color:#64748b;">모험 특성: ${perk}</span><br><span style="color:#64748b;">${nextTxt}</span>`
        };
    }
    const role = p.focus >= 60 ? '🏹 궁수' : '🦌 사냥꾼';
    const perk = role.includes('사냥꾼')
        ? '전리품 증가 · 골드 소폭 증가 · 부상 위험 소폭 증가'
        : '전리품 소폭 증가 · EXP 소폭 증가';
    return {
        title: `${role} (${tier} · ${stageTxt})`,
        subHtml: `사격 숙련 ${tm.archery || 0} · 물공 ${s.physAtk || 0} · 민첩 ${s.agility || 0} · 명중 ${s.accuracy || 0} · 집중 ${p.focus}<br><span style="color:#64748b;">모험 특성: ${perk}</span><br><span style="color:#64748b;">${nextTxt}</span>`
    };
}

function getJobKey() {
    ensureSonGrowthState();
    const tm = gameState.son.trainingMastery;
    const p = gameState.son.personality;

    const entries = [
        { key: 'strength', v: tm.strength || 0 },
        { key: 'magic', v: tm.magic || 0 },
        { key: 'archery', v: tm.archery || 0 }
    ].sort((a, b) => b.v - a.v);
    const top = entries[0];
    const second = entries[1];
    const maxV = top.v;
    const margin = maxV - second.v;
    if (maxV < 4 || margin < 2) return 'neutral';

    if (top.key === 'strength') {
        return (p.endurance >= 60 || gameState.son.maxHp >= 160) ? 'guardian' : 'knight';
    }
    if (top.key === 'magic') {
        return (p.calmness >= 60) ? 'priest' : 'mage';
    }
    return (p.focus >= 60) ? 'archer' : 'hunter';
}

function getTrainingMasteryTop() {
    ensureSonGrowthState();
    const tm = gameState.son.trainingMastery;
    const entries = [
        { key: 'strength', v: tm.strength || 0 },
        { key: 'magic', v: tm.magic || 0 },
        { key: 'archery', v: tm.archery || 0 }
    ].sort((a, b) => b.v - a.v);
    const top = entries[0];
    const second = entries[1];
    const margin = (top?.v || 0) - (second?.v || 0);
    return { topKey: top?.key || 'strength', topV: top?.v || 0, margin };
}

function getJobStage() {
    // Stage is a “전직” feeling layered on top of the current job key.
    const lv = clampInt(gameState.son.level || 1, 1, 999);
    const { topV } = getTrainingMasteryTop();
    if (lv >= 10 && topV >= 22) return 2;
    if (lv >= 5 && topV >= 10) return 1;
    return 0;
}

function jobStageLabel(stage) {
    if (stage >= 2) return '2차 전직';
    if (stage >= 1) return '1차 전직';
    return '전직 전';
}

function scaleMulByStage(mul, stage) {
    const m = Number.isFinite(mul) ? mul : 1.0;
    const strength = stage >= 2 ? 1.75 : stage >= 1 ? 1.35 : 1.0;
    return 1 + (m - 1) * strength;
}

function scaleAddByStage(add, stage) {
    const a = Number.isFinite(add) ? add : 0;
    const strength = stage >= 2 ? 1.5 : stage >= 1 ? 1.25 : 1.0;
    return a * strength;
}

function getAdventureJobPerks() {
    const key = getJobKey();
    const stage = getJobStage();
    const base = {
        key,
        name: '모험가',
        stage,
        planRecMul: 1.0,
        wGatherAdd: 0,
        wHuntAdd: 0,
        wBossAdd: 0,
        goldMul: 1.0,
        expMul: 1.0,
        lootMul: 1.0,
        riskMul: 1.0,
        fatigueAdd: 0.0,
        desc: ''
    };

    const finalize = (job) => {
        const j = { ...job };
        // Scale perks by stage (keeps early game gentle, late game more distinct).
        j.planRecMul = scaleMulByStage(j.planRecMul, stage);
        j.goldMul = scaleMulByStage(j.goldMul, stage);
        j.expMul = scaleMulByStage(j.expMul, stage);
        j.lootMul = scaleMulByStage(j.lootMul, stage);
        j.riskMul = scaleMulByStage(j.riskMul, stage);
        j.fatigueAdd = scaleAddByStage(j.fatigueAdd, stage);
        j.wGatherAdd = scaleAddByStage(j.wGatherAdd, stage);
        j.wHuntAdd = scaleAddByStage(j.wHuntAdd, stage);
        j.wBossAdd = scaleAddByStage(j.wBossAdd, stage);

        const stageNames = {
            knight: ['견습 기사', '기사', '은빛 기사'],
            guardian: ['견습 수호자', '수호자', '철벽 수호자'],
            mage: ['견습 마법사', '마법사', '대마법사'],
            priest: ['견습 사제', '사제', '고위 사제'],
            hunter: ['견습 사냥꾼', '사냥꾼', '명사수'],
            archer: ['견습 궁수', '궁수', '신궁']
        };
        if (stageNames[key]) j.name = stageNames[key][Math.min(2, Math.max(0, stage))];
        j.desc = `${j.desc || ''}${j.desc ? ' · ' : ''}${jobStageLabel(stage)}`;
        return j;
    };

    if (key === 'knight') {
        return finalize({
            ...base,
            planRecMul: 1.05,
            wGatherAdd: -0.06,
            wHuntAdd: 0.06,
            wBossAdd: 0.04,
            goldMul: 1.03,
            riskMul: 0.97,
            desc: '골드 소폭 증가 · 부상 위험 소폭 감소'
        });
    }
    if (key === 'guardian') {
        return finalize({
            ...base,
            planRecMul: 1.02,
            wGatherAdd: -0.03,
            wHuntAdd: 0.03,
            wBossAdd: 0.05,
            riskMul: 0.92,
            fatigueAdd: 0.03,
            desc: '부상 위험 감소 · 귀환 컨디션 소폭 상승'
        });
    }
    if (key === 'mage') {
        return finalize({
            ...base,
            planRecMul: 1.04,
            wGatherAdd: -0.04,
            wHuntAdd: 0.02,
            wBossAdd: 0.04,
            expMul: 1.06,
            lootMul: 1.02,
            desc: 'EXP 증가 · 전리품 소폭 증가'
        });
    }
    if (key === 'priest') {
        return finalize({
            ...base,
            planRecMul: 0.98,
            wGatherAdd: 0.08,
            wHuntAdd: -0.02,
            wBossAdd: -0.06,
            riskMul: 0.94,
            fatigueAdd: 0.04,
            desc: '부상 위험 감소 · 귀환 컨디션 상승'
        });
    }
    if (key === 'hunter') {
        return finalize({
            ...base,
            planRecMul: 1.03,
            wGatherAdd: 0.06,
            wHuntAdd: 0.04,
            wBossAdd: -0.03,
            lootMul: 1.07,
            goldMul: 1.02,
            riskMul: 1.03,
            desc: '전리품 증가 · 골드 소폭 증가 · 부상 위험 소폭 증가'
        });
    }
    if (key === 'archer') {
        return finalize({
            ...base,
            planRecMul: 1.02,
            wGatherAdd: -0.03,
            wHuntAdd: 0.07,
            wBossAdd: 0.02,
            lootMul: 1.06,
            expMul: 1.02,
            riskMul: 1.02,
            desc: '전리품 소폭 증가 · EXP 소폭 증가'
        });
    }
    return { ...base, name: '모험가', desc: '특수 효과 없음' };
}

function getTraitSummary() {
    const b = gameState.son.personality.bravery;
    const d = gameState.son.personality.diligence;
    const m = gameState.son.personality.morality ?? 50;
    const f = gameState.son.personality.flexibility ?? 50;
    const braveTxt = b >= 60 ? '대담' : b <= 40 ? '신중' : '균형';
    const dilTxt = d >= 60 ? '성실' : d <= 40 ? '즉흥' : '보통';
    const morTxt = m >= 60 ? '선함' : m <= 40 ? '냉정' : '중립';
    const flexTxt = f >= 60 ? '유연' : f <= 40 ? '완고' : '보통';
    const short = `${braveTxt} · ${dilTxt} · ${morTxt} · ${flexTxt}`;
    let line = '';
    if (b >= 60 && d >= 60) line = '스스로 목표를 세우고 끝까지 해내려는 타입이에요.';
    else if (b >= 60 && d <= 40) line = '일단 해보는 타입! 가끔 무리수가 나올 수 있어요.';
    else if (b <= 40 && d >= 60) line = '안전하게 준비를 마친 뒤 꾸준히 성장하는 타입이에요.';
    else if (b <= 40 && d <= 40) line = '그날 기분에 따라 움직여요. 엄마 케어가 중요해요.';
    else line = '상황에 따라 유연하게 움직여요.';
    return { short, line };
}

function getPersonalityCode() {
    ensureSonGrowthState();
    const p = gameState.son.personality;
    const code =
        (p.bravery >= 50 ? 'B' : 'C') + // Brave / Cautious
        (p.diligence >= 50 ? 'J' : 'P') + // Judging / Perceiving (feels familiar)
        (p.morality >= 50 ? 'G' : 'E') + // Good / Evil-ish
        (p.flexibility >= 50 ? 'F' : 'S'); // Flexible / Stubborn
    return code;
}

// ============================================================
// Injury system (partial failure + penalties + hospital)
// ============================================================
const injuryDefs = {
    '경미': { label: '경미', remaining: 180, cpMul: 0.92, riskMul: 1.15, healMul: 0.9, hungerDrain: 0.05, hospitalCost: 120 },
    '중상': { label: '중상', remaining: 360, cpMul: 0.80, riskMul: 1.35, healMul: 0.75, hungerDrain: 0.12, hospitalCost: 350 },
    '심각': { label: '심각', remaining: 600, cpMul: 0.65, riskMul: 1.60, healMul: 0.6, hungerDrain: 0.18, hospitalCost: 900 }
};
const injuryRank = { '경미': 1, '중상': 2, '심각': 3 };

function applyInjury(severity) {
    const def = injuryDefs[severity];
    if (!def) return;

    if (gameState.son.injury) {
        const current = gameState.son.injury;
        const curRank = injuryRank[current.severity] || 1;
        const newRank = injuryRank[severity] || 1;
        if (newRank < curRank) {
            // Don't downgrade; extend a bit instead
            current.remaining = Math.min(900, (current.remaining || 0) + 60);
            return;
        }
    }

    gameState.son.injury = {
        severity,
        label: def.label,
        remaining: def.remaining,
        cpMul: def.cpMul,
        riskMul: def.riskMul,
        healMul: def.healMul,
        hungerDrain: def.hungerDrain,
        hospitalCost: def.hospitalCost
    };
    updateUI();
}

function clearInjury(reason = '') {
    gameState.son.injury = null;
    if (reason) addMail("🩹 회복", reason);
    updateUI();
}

function treatInjuryAtHospital() {
    const inj = gameState.son.injury;
    if (!inj) return;
    const cost = inj.hospitalCost || 200;
    if (gameState.parent.gold < cost) {
        showToast(`골드 부족! (필요: ${cost}G)`, 'error');
        return;
    }
    gameState.parent.gold -= cost;
    clearInjury("병원 치료를 받고 회복했습니다.");
    gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 2);
    gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 1);
    showToast(`🏥 치료 완료! (-${cost}G)`, 'success');
}
window.treatInjuryAtHospital = treatInjuryAtHospital;

function injuryTick() {
    const inj = gameState.son.injury;
    if (!inj) return;
    if (gameState.son.state === 'ADVENTURING') return;
    inj.remaining = Math.max(0, (inj.remaining || 0) - 1);
    if (inj.remaining <= 0) {
        clearInjury("시간이 지나 부상이 자연 회복되었습니다.");
        showToast("🩹 부상이 나았습니다!", 'success');
    }
}

// ============================================================
// UI Navigation
// ============================================================
function setMainView(viewKey) {
    if (!els.views?.[viewKey]) return;
    els.mainTabs.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-view') === viewKey));
    Object.entries(els.views).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle('active', k === viewKey);
    });
    // leaving home implies mom isn't touching the wardrobe
    if (viewKey !== 'home') {
        ensureUiLocks();
        gameState.parent.uiLocks.wardrobe = false;
    }
}
window.setMainView = setMainView;

els.mainTabs.forEach(tab => {
    tab.addEventListener('click', () => setMainView(tab.getAttribute('data-view')));
});

// Town hub navigation (cards -> detail)
const townSections = {
    life: {
        title: '생활',
        subs: [],
        defaultSys: 'sys-work'
    },
    shop: {
        title: '상점',
        subs: [],
        defaultSys: 'sys-shop'
    },
    smith: {
        title: '대장간',
        subs: [],
        defaultSys: 'sys-smith'
    }
};
const townNav = {
    route: 'hub',
    section: 'life',
    sysBySection: { life: 'sys-work', shop: 'sys-shop', smith: 'sys-smith' }
};

function setTownSys(sysId) {
    if (!sysId) return;
    els.sysContents.forEach(c => c.classList.remove('active'));
    const target = document.getElementById(sysId);
    if (target) target.classList.add('active');

    if (els.townSubtabs) {
        els.townSubtabs.querySelectorAll('[data-town-sys]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-town-sys') === sysId);
        });
    }
    if (townNav.section) townNav.sysBySection[townNav.section] = sysId;
    updateUI();
}

function applySmithyTabUI() {
    ensureSmithy();
    const tab = gameState.parent.smithy.uiTab || 'gacha';
    const btns = document.querySelectorAll('#sys-smith [data-smith-tab]');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-smith-tab') === tab));
    const panes = [
        { id: 'smith-tab-gacha', key: 'gacha' },
        { id: 'smith-tab-synth', key: 'synth' },
        { id: 'smith-tab-craft', key: 'craft' }
    ];
    panes.forEach(p => {
        const el = document.getElementById(p.id);
        if (!el) return;
        el.classList.toggle('active', p.key === tab);
    });
}

function setSmithyTab(tabKey) {
    ensureSmithy();
    const t = (tabKey === 'synth' || tabKey === 'craft') ? tabKey : 'gacha';
    gameState.parent.smithy.uiTab = t;
    applySmithyTabUI();
    updateUI();
}
window.setSmithyTab = setSmithyTab;

function applyShopTabUI() {
    ensureShopState();
    const tab = gameState.parent.shop.uiTab || 'grocery';
    const btns = document.querySelectorAll('#sys-shop [data-shop-tab]');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-shop-tab') === tab));
    const panes = [
        { id: 'shop-tab-grocery', key: 'grocery' },
        { id: 'shop-tab-general', key: 'general' },
        { id: 'shop-tab-book', key: 'book' }
    ];
    panes.forEach(p => {
        const el = document.getElementById(p.id);
        if (!el) return;
        el.classList.toggle('active', p.key === tab);
    });
}

function setShopTab(tabKey) {
    ensureShopState();
    const t = (tabKey === 'general' || tabKey === 'book') ? tabKey : 'grocery';
    gameState.parent.shop.uiTab = t;
    applyShopTabUI();
    updateUI();
}
window.setShopTab = setShopTab;

function applySonTabUI() {
    ensureSonUiState();
    const tab = gameState.parent.sonUiTab || 'summary';
    const btns = document.querySelectorAll('#sys-son [data-son-tab]');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-son-tab') === tab));
    const panes = [
        { id: 'son-tab-summary', key: 'summary' },
        { id: 'son-tab-gear', key: 'gear' },
        { id: 'son-tab-world', key: 'world' }
    ];
    panes.forEach(p => {
        const el = document.getElementById(p.id);
        if (!el) return;
        el.classList.toggle('active', p.key === tab);
    });
}

function setSonTab(tabKey) {
    ensureSonUiState();
    const t = (tabKey === 'gear' || tabKey === 'world') ? tabKey : 'summary';
    gameState.parent.sonUiTab = t;
    applySonTabUI();
    updateUI();
}
window.setSonTab = setSonTab;

function pinSupportTask(task) {
    ensureSupportPinState();
    if (!task || typeof task !== 'object' || !task.type) return;
    gameState.parent.supportPin = deepClone(task);
    showToast("📌 서포트를 핀했어요.", 'info');
    updateUI();
}
window.pinSupportTask = pinSupportTask;

function clearSupportPin() {
    ensureSupportPinState();
    gameState.parent.supportPin = null;
    showToast("📌 핀을 해제했어요.", 'info');
    updateUI();
}
window.clearSupportPin = clearSupportPin;

function goToSupportPin() {
    ensureSupportPinState();
    const pin = gameState.parent.supportPin;
    if (!pin) return;
    if (pin.type === 'treat') {
        setMainView('son');
        setSonTab('summary');
        return;
    }
    if (pin.type === 'craftSeal') {
        setMainView('town');
        openTownSection('smith');
        setSmithyTab('craft');
        return;
    }
    if (pin.type === 'craftGear' || pin.type === 'craftMilestone') {
        setMainView('town');
        openTownSection('smith');
        setSmithyTab('craft');
        return;
    }
    if (pin.type === 'cook') {
        setMainView('home');
        setHomeRoomView('room-table');
        return;
    }
    if (pin.type === 'bookshelf') {
        setMainView('home');
        setHomeRoomView('room-desk');
        return;
    }
    if (pin.type === 'buySandbag') {
        setMainView('town');
        openTownSection('shop');
        setShopTab('general');
        return;
    }
}
window.goToSupportPin = goToSupportPin;

function openTownHub() {
    townNav.route = 'hub';
    if (els.townHub) els.townHub.style.display = 'grid';
    if (els.townDetail) els.townDetail.style.display = 'none';
}
window.openTownHub = openTownHub;

function openTownSection(sectionKey) {
    const section = townSections[sectionKey];
    if (!section) return;
    townNav.route = 'detail';
    townNav.section = sectionKey;

    if (els.townHub) els.townHub.style.display = 'none';
    if (els.townDetail) els.townDetail.style.display = 'flex';
    if (els.townTitle) els.townTitle.innerText = section.title;

    if (els.townSubtabs) {
        if (section.subs && section.subs.length > 0) {
            els.townSubtabs.style.display = 'block';
            const html = `
                <div class="segmented">
                    ${section.subs.map(s => `<button class="seg-btn" type="button" data-town-sys="${s.sys}">${s.label}</button>`).join('')}
                </div>
            `;
            els.townSubtabs.innerHTML = html;
        } else {
            els.townSubtabs.style.display = 'none';
            els.townSubtabs.innerHTML = '';
        }
    }

    const sysId = townNav.sysBySection[sectionKey] || section.defaultSys;
    setTownSys(sysId);

    const smithH3 = document.getElementById('smithy-h3');
    if (smithH3) smithH3.innerText = '대장간';
}
window.openTownSection = openTownSection;

if (els.townCards && els.townCards.length) {
    els.townCards.forEach(card => {
        card.addEventListener('click', () => openTownSection(card.getAttribute('data-town')));
    });
}
if (els.townBack) {
    els.townBack.addEventListener('click', () => openTownHub());
}
if (els.townSubtabs) {
    els.townSubtabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-town-sys]');
        if (!btn) return;
        setTownSys(btn.getAttribute('data-town-sys'));
    });
}

els.roomTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        els.roomTabs.forEach(t => t.classList.remove('active'));
        Object.values(els.roomViews).forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        const roomId = tab.getAttribute('data-room');
        els.roomViews[roomId].classList.add('active');
        ensureUiLocks();
        gameState.parent.uiLocks.wardrobe = roomId === 'room-wardrobe';
        updateUpgradeButtons(roomId);
        if (roomId === 'room-wardrobe') updateWardrobeUI();
    });
});
openTownHub();

function setHomeRoomView(roomId) {
    if (!els.roomViews?.[roomId]) return;
    els.roomTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-room') === roomId));
    Object.entries(els.roomViews).forEach(([k, v]) => {
        if (!v) return;
        v.classList.toggle('active', k === roomId);
    });
    ensureUiLocks();
    gameState.parent.uiLocks.wardrobe = roomId === 'room-wardrobe';
    updateUpgradeButtons(roomId);
    if (roomId === 'room-wardrobe') updateWardrobeUI();
}
window.setHomeRoomView = setHomeRoomView;

// ============================================================
// Toast-based Buy / Inventory
// ============================================================
let currentTargetRoom = null;
let currentInventoryMode = 'place'; // 'place' | 'equip'

function ensureKitchenState() {
    if (!gameState.parent.kitchen || typeof gameState.parent.kitchen !== 'object') {
        gameState.parent.kitchen = { cooking: null };
    }
    if (!('cooking' in gameState.parent.kitchen)) gameState.parent.kitchen.cooking = null;
}

function getPantryCount(key) {
    ensurePantry();
    return gameState.parent.harvestBag[key] || 0;
}

function needsTextFromRecipe(recipe) {
    const parts = Object.entries(recipe.needs || {}).map(([k, v]) => {
        const have = getPantryCount(k);
        const color = have >= v ? '#10b981' : '#ef4444';
        const nm = ingredientNames[k] || k;
        return `<span style="color:${color}; font-weight:900;">${nm} ${have}/${v}</span>`;
    });
    return parts.join(' ');
}

function canCookRecipe(recipe) {
    return Object.entries(recipe.needs || {}).every(([k, v]) => getPantryCount(k) >= v);
}

function openKitchenCookMenu() {
    ensureKitchenState();
    ensurePantry();
    const cooking = gameState.parent.kitchen.cooking;
    const placed = gameState.rooms['room-table']?.placedItem;

    currentInventoryMode = 'cook';
    currentTargetRoom = 'room-table';
    if (els.invDesc) {
        els.invDesc.innerText = cooking
            ? `조리 중... (${Math.max(0, cooking.remaining)}초 남음)`
            : placed
                ? '식탁에 음식이 있어요. 아들이 먹으면 비워집니다.'
                : '조리할 메뉴를 선택하세요. (조리 시간: 3~10초)';
    }
    els.invList.innerHTML = '';

    // Pantry summary
    const pantryKeys = Object.keys(ingredientNames);
    const summary = pantryKeys
        .filter(k => (gameState.parent.harvestBag[k] || 0) > 0)
        .map(k => `${ingredientNames[k]} ${gameState.parent.harvestBag[k]}`)
        .join(' · ');
    const sumDiv = document.createElement('div');
    sumDiv.style.cssText = 'margin-bottom:10px; font-size:0.78rem; color:#64748b; line-height:1.35;';
    sumDiv.innerHTML = summary ? `보유 재료: <b>${summary}</b>` : '보유 재료가 없습니다. (마을에서 재료를 구매하거나 텃밭에서 수확하세요)';
    els.invList.appendChild(sumDiv);

    if (cooking) {
        const p = document.createElement('div');
        p.style.cssText = 'padding:10px; background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; font-size:0.85rem; font-weight:900; color:#0f172a;';
        const r = recipes.find(x => x.id === cooking.recipeId);
        p.innerText = `🍳 ${r?.name || cooking.recipeId} 조리 중... ${Math.max(0, cooking.remaining)}초`;
        els.invList.appendChild(p);
        els.invModal.style.display = 'flex';
        return;
    }

    if (placed) {
        const btnClear = document.createElement('button');
        btnClear.className = 'action-btn';
        btnClear.style.cssText = 'background:#ef4444; margin-top:0;';
        btnClear.innerText = '🧹 식탁 치우기';
        btnClear.onclick = () => {
            gameState.rooms['room-table'].placedItem = null;
            updateUI();
            showToast("식탁을 비웠습니다.", 'info');
            closeInventory();
        };
        els.invList.appendChild(btnClear);
        els.invModal.style.display = 'flex';
        return;
    }

    recipes.forEach(recipe => {
        const unlocked = isRecipeUnlocked(recipe);
        const can = canCookRecipe(recipe);
        const sealDef = recipe.requiresSeal ? bossSealDefs?.[recipe.requiresSeal] : null;
        const lockLine = !unlocked
            ? `<div style="margin-top:6px; font-size:0.72rem; font-weight:1000; color:#f59e0b;">🔒 ${sealDef?.name || '인장'} 제작 필요</div>`
            : '';

        const div = document.createElement('div');
        const opacity = !unlocked ? 0.55 : (can ? 1.0 : 0.85);
        div.style.cssText = `display:flex; justify-content:space-between; align-items:center; gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px; opacity:${opacity};`;
        div.innerHTML = `
          <div style="flex:1; font-size:0.82rem;">
            <div style="font-weight:1000; color:#0f172a;">${recipe.name} <span style="color:#64748b; font-size:0.75rem;">(${recipe.desc})</span></div>
            <div style="margin-top:6px; font-size:0.75rem;">${needsTextFromRecipe(recipe)}</div>
            ${lockLine}
          </div>
        `;
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        const enabled = unlocked && can;
        btn.style.cssText = `width:auto; padding:8px 12px; margin:0; font-size:0.78rem; background:${enabled ? '#10b981' : '#94a3b8'};`;
        btn.disabled = !enabled;
        btn.innerText = !unlocked ? '잠김' : (can ? '조리 시작' : '재료 부족');
        btn.onclick = () => startKitchenCooking(recipe.id);
        div.appendChild(btn);
        els.invList.appendChild(div);
    });

    els.invModal.style.display = 'flex';
}

function isRecipeUnlocked(recipe) {
    if (!recipe) return false;
    const seal = recipe.requiresSeal;
    if (!seal) return true;
    return isBossSealCrafted(seal);
}

function startKitchenCooking(recipeId) {
    ensureKitchenState();
    ensurePantry();
    const cooking = gameState.parent.kitchen.cooking;
    if (cooking) {
        showToast("이미 조리 중입니다.", 'warning');
        return;
    }
    if (gameState.rooms['room-table']?.placedItem) {
        showToast("식탁에 이미 음식이 있어요.", 'warning');
        return;
    }
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    if (!isRecipeUnlocked(recipe)) {
        const def = recipe.requiresSeal ? bossSealDefs?.[recipe.requiresSeal] : null;
        showToast(`🔒 아직 해금되지 않은 레시피입니다. (${def?.name || '인장'} 제작 필요)`, 'warning');
        return;
    }
    if (!canCookRecipe(recipe)) {
        showToast("재료가 부족합니다!", 'error');
        return;
    }

    // consume mats now
    Object.entries(recipe.needs || {}).forEach(([k, v]) => {
        gameState.parent.harvestBag[k] = Math.max(0, (gameState.parent.harvestBag[k] || 0) - v);
    });
    const total = 3 + Math.floor(Math.random() * 8); // 3~10
    gameState.parent.kitchen.cooking = { recipeId, remaining: total, total };
    showToast(`🍳 조리 시작: ${recipe.name} (${total}초)`, 'info');
    closeInventory();
    updateUI();
}

function getKitchenItemEmoji(itemId) {
    const r = recipes.find(x => x.id === itemId);
    if (r?.name) return r.name.split(' ')[0];
    const inv = gameState.parent.inventory?.[itemId];
    if (inv?.name) return inv.name.split(' ')[0];
    return '🍽️';
}

function getKitchenItemName(itemId) {
    const r = recipes.find(x => x.id === itemId);
    if (r?.name) return r.name;
    const inv = gameState.parent.inventory?.[itemId];
    if (inv?.name) return inv.name;
    return itemId;
}

function updateKitchenSlotUI() {
    if (!els.slots?.['room-table']) return;
    ensureKitchenState();
    const slotEl = els.slots['room-table'];
    const cooking = gameState.parent.kitchen.cooking;
    const placed = gameState.rooms['room-table']?.placedItem;

    if (cooking) {
        const r = recipes.find(x => x.id === cooking.recipeId);
        const label = `조리 중... ${Math.max(0, cooking.remaining)}초`;
        slotEl.innerHTML = `<span class="slot-label">${label}</span>🍳`;
        slotEl.classList.add('filled');
        slotEl.classList.add('cooking');
        return;
    }

    slotEl.classList.remove('cooking');
    if (placed) {
        const emoji = getKitchenItemEmoji(placed);
        slotEl.innerHTML = `<span class="slot-label">식탁 위 음식</span>${emoji}`;
        slotEl.classList.add('filled');
    } else {
        slotEl.innerHTML = `<span class="slot-label">🍳 요리하기</span>➕`;
        slotEl.classList.remove('filled');
    }
}


function buyItem(itemId, cost) {
    if (gameState.parent.gold >= cost) {
        gameState.parent.gold -= cost;
        gameState.parent.inventory[itemId].count++;
        updateUI();
        showToast(`${gameState.parent.inventory[itemId].name} 구매 완료!`, 'success');
    } else {
        showToast("골드가 부족합니다!", 'error');
    }
}
window.buyItem = buyItem;

function buyGear(slot, itemId) {
    const inv = gameState.parent.gearInventory?.[slot];
    if (!inv || !inv[itemId]) return;
    const item = inv[itemId];
    if (gameState.parent.gold < item.cost) {
        showToast("골드 부족!", 'error');
        return;
    }
    gameState.parent.gold -= item.cost;
    item.count++;
    showToast(`${item.name} 구매 완료!`, 'success');
    updateUI();
}
window.buyGear = buyGear;

function buyMaterial(key, cost, amount = 1) {
    ensureLootKey(key);
    const a = Math.max(1, Math.floor(amount));
    const total = cost * a;
    if (gameState.parent.gold < total) {
        showToast(`골드 부족! (필요: ${total}G)`, 'error');
        return;
    }
    gameState.parent.gold -= total;
    gameState.parent.loot[key].count += a;
    showToast(`${gameState.parent.loot[key].name} x${a} 구매!`, 'success');
    updateUI();
}
window.buyMaterial = buyMaterial;

function ensurePantry() {
    if (!gameState.parent.harvestBag || typeof gameState.parent.harvestBag !== 'object') {
        gameState.parent.harvestBag = {};
    }
}

function buyIngredient(key, cost, amount = 1) {
    ensurePantry();
    const a = Math.max(1, Math.floor(amount));
    const total = cost * a;
    if (gameState.parent.gold < total) {
        showToast(`골드 부족! (필요: ${total}G)`, 'error');
        return;
    }
    gameState.parent.gold -= total;
    if (!gameState.parent.harvestBag[key]) gameState.parent.harvestBag[key] = 0;
    gameState.parent.harvestBag[key] += a;
    showToast(`${ingredientNames[key] || key} x${a} 구매!`, 'success');
    updateUI();
}
window.buyIngredient = buyIngredient;

function buySeed(totalCost, amount = 1) {
    ensureFarm();
    const a = Math.max(1, Math.floor(amount));
    const total = Math.max(0, Math.floor(totalCost || 0));
    if (total <= 0) return;
    if (gameState.parent.gold < total) {
        showToast(`골드 부족! (필요: ${total}G)`, 'error');
        return;
    }
    gameState.parent.gold -= total;
    gameState.parent.farm.seed += a;
    showToast(`🌱 씨앗 x${a} 구매! (-${total}G)`, 'success');
    updateUI();
}
window.buySeed = buySeed;

// ============================================================
// Crafting system (4 slots x 10 tiers + weapon milestones)
// ============================================================
const craftConfig = {
    slots: ['helmet', 'armor', 'boots'],
    tierCount: 10,
    milestoneWeapons: [
        { tier: 3, id: 'wolf_sword', name: '🐺 늑대의 보검', needs: { wolf_fang: 3, leather: 4, steel: 2 } },
        { tier: 6, id: 'relic_sword', name: '🏛️ 유적의 보검', needs: { relic_fragment: 4, steel: 6, magic_crystal: 3 } },
        { tier: 10, id: 'dragon_sword', name: '🐉 드래곤 스워드', needs: { dragon_heart: 1, wyvern_scale: 6, steel: 10, magic_crystal: 6 } }
    ]
};

function materialHave(key) {
    ensureLootKey(key);
    return gameState.parent.loot[key]?.count || 0;
}

function canCraftNeeds(needs) {
    return Object.entries(needs).every(([k, v]) => materialHave(k) >= v);
}

function consumeNeeds(needs) {
    Object.entries(needs).forEach(([k, v]) => {
        ensureLootKey(k);
        gameState.parent.loot[k].count = Math.max(0, (gameState.parent.loot[k].count || 0) - v);
    });
}

function getZoneStageGroup(zoneId) {
    const z = String(zoneId || '');
    if (!z) return '';
    if (z === 'meadow' || z === 'creek' || z === 'burrow') return 'meadow';
    if (z === 'forest' || z === 'grove' || z === 'den') return 'forest';
    if (z === 'ruins' || z === 'crypt' || z === 'library' || z === 'forge') return 'ruins';
    if (z === 'mountain' || z === 'pass' || z === 'cliff' || z === 'aerie') return 'mountain';
    if (z === 'dragon_lair') return 'dragon';
    return '';
}

function pickZoneCoreKey(zoneId) {
    const g = getZoneStageGroup(zoneId);
    if (g === 'forest') return 'wolf_fang';
    if (g === 'ruins') return 'relic_fragment';
    if (g === 'mountain') return 'wyvern_scale';
    if (g === 'dragon') return 'dragon_heart';
    return null;
}

function grantGuaranteedZoneDrop({ zone, mission, outcome }) {
    if (!zone || !Array.isArray(zone.drops) || zone.drops.length === 0) return null;
    const failChance = 0.5;
    if (outcome === 'fail' && Math.random() > failChance) return null;

    const missionId = mission?.id || 'gather';
    const coreKey = pickZoneCoreKey(zone.id);

    // Prefer non-seed materials when possible
    const nonSeed = zone.drops.filter(d => d && d.key && d.key !== 'seed');
    const pool = nonSeed.length ? nonSeed : zone.drops;

    const weighted = pool.map(d => {
        let w = Math.max(0.001, d.prob || 1);
        // Gather mission should feel materially rewarding
        if (missionId === 'gather') w *= 1.25;
        // Boss mission should tilt slightly toward the core drop
        if (missionId === 'boss' && coreKey && d.key === coreKey) w *= 1.35;
        // Core item bias (still random, but less frustrating)
        if (coreKey && d.key === coreKey) w *= 1.35;
        return { drop: d, w };
    });
    const picked = rollFromWeights(weighted);
    const d = picked?.drop || weighted[0]?.drop;
    if (!d) return null;

    const min = Math.max(1, Math.floor(d.min || 1));
    const max = Math.max(min, Math.floor(d.max || min));
    let amount = min + Math.floor(Math.random() * (max - min + 1));

    // Outcome bonus: better runs bring a little more stuff home
    if (outcome === 'success' && Math.random() < 0.35) amount += 1;
    if (outcome === 'great' && Math.random() < 0.70) amount += 1;
    amount = Math.max(1, amount);

    return { key: d.key, amount };
}

function tierStageMaterials(tier) {
    if (tier <= 3) return { core: 'wolf_fang', baseA: 'leather', baseB: 'steel' };
    if (tier <= 6) return { core: 'relic_fragment', baseA: 'steel', baseB: 'magic_crystal' };
    if (tier <= 9) return { core: 'wyvern_scale', baseA: 'steel', baseB: 'rare_hide' };
    return { core: 'dragon_heart', baseA: 'steel', baseB: 'magic_crystal' };
}

function slotName(slot) {
    if (slot === 'helmet') return '🪖 투구';
    if (slot === 'armor') return '🧥 갑옷';
    if (slot === 'boots') return '👢 신발';
    return slot;
}

function makeGearName(slot, tier, stage) {
    const themes = {
        wolf_fang: '늑대',
        relic_fragment: '유적',
        wyvern_scale: '와이번',
        dragon_heart: '드래곤'
    };
    const theme = themes[stage.core] || '장비';
    return `${theme} ${slot === 'helmet' ? '투구' : slot === 'armor' ? '갑옷' : '신발'} T${tier}`;
}

function calcGearDef(slot, tier) {
    const base = slot === 'armor' ? 4 : slot === 'helmet' ? 2 : 1;
    const growth = slot === 'armor' ? 2.0 : slot === 'helmet' ? 1.4 : 1.1;
    return Math.max(1, Math.floor(base + tier * growth));
}

function buildGearRecipe(slot, tier) {
    const stage = tierStageMaterials(tier);
    const def = calcGearDef(slot, tier);
    ensureLootKey(stage.core);
    ensureLootKey(stage.baseA);
    ensureLootKey(stage.baseB);

    // Balance: crafting should progress steadily with adventure drops.
    const coreQty = tier <= 3 ? 1 : tier <= 6 ? 2 : tier <= 9 ? 2 : 1;
    const baseAQty = 1 + Math.floor(tier * 0.7);
    const baseBQty = tier <= 3 ? Math.floor(tier * 0.2) : 1 + Math.floor(tier * 0.45);

    // Slot-specific bias
    const needs = {};
    needs[stage.core] = coreQty + (slot === 'armor' && tier <= 6 ? 1 : 0);
    needs[stage.baseA] = baseAQty + (slot === 'armor' ? 1 : slot === 'boots' ? -1 : 0);
    if (baseBQty > 0) needs[stage.baseB] = baseBQty + (slot === 'helmet' ? 1 : 0);

    const id = `${slot}_t${tier}`;
    const name = makeGearName(slot, tier, stage);
    let needsGear = null;
    if (tier > 1) {
        const prevTier = tier - 1;
        const prevStage = tierStageMaterials(prevTier);
        const prevId = `${slot}_t${prevTier}`;
        const prevName = makeGearName(slot, prevTier, prevStage);
        needsGear = { id: prevId, name: prevName, count: 1 };
    }
    return { id, slot, tier, name, def, needs, needsGear, themeCore: stage.core };
}

function craftGear(slot, recipeId) {
    const inv = gameState.parent.gearInventory?.[slot];
    if (!inv) return;
    const tier = parseInt((recipeId.split('_t')[1] || '').trim(), 10);
    const recipe = buildGearRecipe(slot, Number.isFinite(tier) ? tier : 1);
    const hasPrev = !recipe.needsGear || ((inv[recipe.needsGear.id]?.count || 0) >= recipe.needsGear.count);
    if (!hasPrev) {
        showToast("이전 티어 장비가 필요합니다!", 'warning');
        return;
    }
    if (!canCraftNeeds(recipe.needs)) {
        showToast("재료가 부족합니다!", 'error');
        return;
    }
    // Consume previous tier gear for upgrades
    if (recipe.needsGear) {
        inv[recipe.needsGear.id].count -= recipe.needsGear.count;
    }
    consumeNeeds(recipe.needs);
    if (!inv[recipe.id]) {
        inv[recipe.id] = { id: recipe.id, name: recipe.name, def: recipe.def, count: 0, cost: 0, tier: recipe.tier };
    }
    inv[recipe.id].count++;
    const actionLabel = recipe.tier === 1 ? '제작' : '승급';
    showToast(`${recipe.name} ${actionLabel} 완료!`, 'gold');
    addMail("🧵 제작 완료", `${slotName(slot)}: <b>${recipe.name}</b> (방+${recipe.def})`);
    updateUI();
}
window.craftGear = craftGear;

function craftMilestoneWeapon(weaponId) {
    const w = gameState.parent.specialWeaponInventory?.[weaponId];
    const def = craftConfig.milestoneWeapons.find(m => m.id === weaponId);
    if (!w || !def) return;
    const needs = def.needs;
    if (!canCraftNeeds(needs)) {
        showToast("재료가 부족합니다!", 'error');
        return;
    }
    consumeNeeds(needs);
    w.count++;
    showToast(`${w.name} 제작 완료!`, 'gold');
    addMail("🧵 제작 완료", `<b>${w.name}</b> (공+${w.atk})`);
    updateUI();
}
window.craftMilestoneWeapon = craftMilestoneWeapon;

function dismantleGear(slot, recipeId) {
    const inv = gameState.parent.gearInventory?.[slot];
    if (!inv) return;
    const item = inv[recipeId];
    if (!item || item.count <= 0) return;

    const tier = parseInt((recipeId.split('_t')[1] || '').trim(), 10);
    const recipe = buildGearRecipe(slot, Number.isFinite(tier) ? tier : 1);

    // Remove one item
    item.count--;

    // Salvage base materials only (core stays precious)
    const stage = tierStageMaterials(recipe.tier);
    const coreKey = stage.core;
    const salvage = {};
    for (const [k, v] of Object.entries(recipe.needs)) {
        if (k === coreKey || k === 'dragon_heart') continue;
        const ratio = 0.45;
        const amt = Math.max(0, Math.floor(v * ratio));
        if (amt > 0) salvage[k] = (salvage[k] || 0) + amt;
    }
    Object.entries(salvage).forEach(([k, v]) => {
        ensureLootKey(k);
        gameState.parent.loot[k].count += v;
    });

    const salvageText = Object.entries(salvage).map(([k, v]) => `${gameState.parent.loot[k].name} x${v}`).join(', ');
    showToast(`해체 완료! ${salvageText || '환급 없음'}`, 'info');
    updateUI();
}
window.dismantleGear = dismantleGear;

function needsText(needs) {
    return Object.entries(needs).map(([k, v]) => {
        ensureLootKey(k);
        const have = materialHave(k);
        const color = have >= v ? '#10b981' : '#ef4444';
        return `<span style="color:${color}; font-weight:900;">${gameState.parent.loot[k].name} ${have}/${v}</span>`;
    }).join(' · ');
}

function gearNeedText(slot, needsGear) {
    if (!needsGear) return '';
    const inv = gameState.parent.gearInventory?.[slot] || {};
    const have = inv[needsGear.id]?.count || 0;
    const need = needsGear.count || 1;
    const color = have >= need ? '#10b981' : '#ef4444';
    return `<span style="color:${color}; font-weight:900;">이전 장비 ${needsGear.name} ${have}/${need}</span>`;
}

function updateCraftUI() {
    const root = document.getElementById('craft-list');
    if (!root) return;
    let html = '';

    // Gear sections
    for (const slot of craftConfig.slots) {
        html += `<div class="craft-section"><div class="craft-title">${slotName(slot)} <span class="craft-meta">10단계</span></div>`;
        for (let tier = 1; tier <= craftConfig.tierCount; tier++) {
            const r = buildGearRecipe(slot, tier);
            const inv = gameState.parent.gearInventory?.[slot] || {};
            const hasPrev = !r.needsGear || ((inv[r.needsGear.id]?.count || 0) >= (r.needsGear.count || 1));
            const can = canCraftNeeds(r.needs) && hasPrev;
            const owned = inv[r.id]?.count || 0;
            const actionLabel = tier === 1 ? '제작' : '승급';
            const icon = `<img src="assets/items/${r.id}.png" alt="" style="width:20px; height:20px; vertical-align:middle; margin-right:6px; image-rendering:pixelated; border-radius:7px; border:1px solid #e2e8f0; background:#fff;" onerror="this.style.display='none'">`;
            html += `
              <div class="craft-item ${can ? '' : 'locked'}">
                <div class="craft-row">
                  <div>
                    <div class="craft-name">${icon}T${tier} · ${r.name}</div>
                    <div class="craft-meta">방어 +${r.def} · 보유 ${owned}개 · 핵심: ${gameState.parent.loot[r.themeCore]?.name || r.themeCore}</div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="craft-btn" ${can ? '' : 'disabled'} onclick="craftGear('${slot}', '${r.id}')">${actionLabel}</button>
                    <button class="craft-btn" ${(owned > 0) ? '' : 'disabled'} style="background:#334155" onclick="dismantleGear('${slot}', '${r.id}')">해체</button>
                  </div>
                </div>
                <div class="craft-needs">${gearNeedText(slot, r.needsGear)}${r.needsGear ? '<br>' : ''}${needsText(r.needs)}</div>
              </div>
            `;
        }
        html += `</div>`;
    }

    // Weapon milestones
    html += `<div class="craft-section"><div class="craft-title">🗡️ 무기(마일스톤) <span class="craft-meta">T3/T6/T10</span></div>`;
    for (const m of craftConfig.milestoneWeapons) {
        const w = gameState.parent.specialWeaponInventory?.[m.id];
        const can = canCraftNeeds(m.needs);
        const icon = `<img src="assets/items/${m.id}.png" alt="" style="width:20px; height:20px; vertical-align:middle; margin-right:6px; image-rendering:pixelated; border-radius:7px; border:1px solid #e2e8f0; background:#fff;" onerror="this.style.display='none'">`;
        html += `
          <div class="craft-item ${can ? '' : 'locked'}">
            <div class="craft-row">
              <div>
                <div class="craft-name">${icon}T${m.tier} · ${m.name}</div>
                <div class="craft-meta">공격 +${w?.atk ?? '?'} · 특별 무기</div>
              </div>
              <button class="craft-btn" ${can ? '' : 'disabled'} onclick="craftMilestoneWeapon('${m.id}')">제작</button>
            </div>
            <div class="craft-needs">${needsText(m.needs)}</div>
          </div>
        `;
    }
    html += `</div>`;

    // Boss seals (parent-side progression using boss trophies)
    html += `<div class="craft-section"><div class="craft-title">🏆 보스 인장 <span class="craft-meta">영구 효과</span></div>`;
    html += `<div style="font-size:0.78rem; color:#64748b; margin-bottom:8px;">보스 전리품으로 인장을 만들어, 이후 모험이 조금씩 좋아집니다.</div>`;
    for (const z of zones) {
        const def = bossSealDefs[z.id];
        if (!def) continue;
        const crafted = isBossSealCrafted(z.id);
        const can = !crafted && canCraftNeeds(def.needs);
        const effect = describeSealEffects(def.effects);
        html += `
          <div class="craft-item ${crafted || can ? '' : 'locked'}">
            <div class="craft-row">
              <div>
                <div class="craft-name">${def.name}</div>
                <div class="craft-meta">${z.emoji} ${z.name} · ${effect ? effect : '효과 없음'}</div>
              </div>
              <button class="craft-btn" ${crafted ? 'disabled' : (can ? '' : 'disabled')} onclick="craftBossSeal('${z.id}')">${crafted ? '완료' : '제작'}</button>
            </div>
            <div class="craft-needs">${needsText(def.needs)}${def.desc ? `<br><span style="color:#64748b;">${def.desc}</span>` : ''}</div>
          </div>
        `;
    }
    html += `</div>`;

    root.innerHTML = html;
}

function openInventory(roomType) {
    if (roomType === 'kitchen') {
        openKitchenCookMenu();
        return;
    }
    if (roomType === 'study') {
        openBookshelfManager();
        return;
    }
    const equipTypes = ['weapon', 'helmet', 'armor', 'boots'];
    currentInventoryMode = equipTypes.includes(roomType) ? 'equip' : 'place';
    if (els.invDesc) {
        const modeText = currentInventoryMode === 'equip'
            ? '장착할 장비를 선택하세요.'
            : '이 방에 배치할 아이템을 선택하세요.';
        els.invDesc.innerText = modeText;
    }
    if (currentInventoryMode === 'place') {
        currentTargetRoom = roomType === 'kitchen' ? 'room-table' : roomType === 'study' ? 'room-desk' : roomType === 'training' ? 'room-dummy' : 'room-bed';
    } else {
        currentTargetRoom = null;
    }
    els.invList.innerHTML = '';
    let hasItems = false;

    const setItemButtonHtml = (btn, { iconId = null, title = '', sub = '' } = {}) => {
        const safeTitle = String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeSub = String(sub || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const iconHtml = iconId
            ? `<img class="item-icon" src="assets/items/${String(iconId)}.png" alt="" onerror="this.style.display='none'">`
            : '';
        btn.innerHTML = `${iconHtml}<div class="item-lines"><div class="item-title">${safeTitle}</div>${safeSub ? `<div class="item-sub">${safeSub}</div>` : ''}</div>`;
    };

    if (roomType === 'weapon') {
        // Tier weapons (gacha)
        Object.keys(gameState.parent.weaponInventory).forEach(tier => {
            const item = gameState.parent.weaponInventory[tier];
            if (item.count > 0) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'item-btn';
                setItemButtonHtml(btn, {
                    iconId: `weapon_${tier}`,
                    title: `[${tier}급] ${item.name}`,
                    sub: `보유 ${item.count} · 공+${item.atk}`
                });
                btn.onclick = () => equipWeaponTier(tier);
                els.invList.appendChild(btn);
            }
        });
        // Crafted/special weapons
        Object.keys(gameState.parent.specialWeaponInventory || {}).forEach(k => {
            const w = gameState.parent.specialWeaponInventory[k];
            if (w.count > 0) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'item-btn';
                setItemButtonHtml(btn, {
                    iconId: w.id,
                    title: `[특별] ${w.name}`,
                    sub: `보유 ${w.count} · 공+${w.atk}`
                });
                btn.onclick = () => equipSpecialWeapon(w.id);
                els.invList.appendChild(btn);
            }
        });
    } else if (['helmet', 'armor', 'boots'].includes(roomType)) {
        const inv = gameState.parent.gearInventory?.[roomType] || {};
        Object.keys(inv).forEach(key => {
            const item = inv[key];
            if (item.count > 0) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'item-btn';
                setItemButtonHtml(btn, {
                    iconId: item.id,
                    title: item.name,
                    sub: `보유 ${item.count} · 방+${item.def}`
                });
                btn.onclick = () => equipGear(roomType, item.id);
                els.invList.appendChild(btn);
            }
        });
    } else {
        Object.keys(gameState.parent.inventory).forEach(key => {
            const item = gameState.parent.inventory[key];
            if (item.type === roomType && item.count > 0) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'item-btn';
                btn.innerText = `${item.name} (보유: ${item.count})`;
                btn.onclick = () => placeItem(key);
                els.invList.appendChild(btn);
            }
        });
    }
    if (!hasItems) els.invList.innerHTML = '<p style="color:#ef4444; font-weight:bold;">배치할 수 있는 아이템이 없습니다.</p>';
    els.invModal.style.display = 'flex';
}
window.openInventory = openInventory;

function equipGear(slot, itemId) {
    const inv = gameState.parent.gearInventory?.[slot];
    if (!inv) return;
    const item = inv[itemId];
    if (!item || item.count <= 0) return;

    item.count--;

    const old = gameState.son.equipment[slot];
    if (old && old.id && !old.id.startsWith('none_')) {
        const oldInv = gameState.parent.gearInventory?.[slot];
        if (oldInv && oldInv[old.id]) oldInv[old.id].count++;
    }

    gameState.son.equipment[slot] = {
        id: item.id,
        name: item.name,
        atk: 0,
        def: item.def || 0,
        tier: 'C'
    };
    closeInventory();
    updateUI();
    showToast(`${item.name} 장착!`, 'success');
}
window.equipGear = equipGear;

function unequipGear(slot) {
    const current = gameState.son.equipment?.[slot];
    if (!current || !current.id || current.id.startsWith('none_')) {
        showToast("해제할 장비가 없습니다.", 'warning');
        return;
    }
    const inv = gameState.parent.gearInventory?.[slot];
    if (inv) {
        if (!inv[current.id]) {
            inv[current.id] = { id: current.id, name: current.name, def: current.def || 0, count: 0, cost: 0, tier: current.tier || 1 };
        }
        inv[current.id].count++;
    }
    // Set base item
    const baseMap = {
        helmet: { id: 'none_helmet', name: '맨머리', atk: 0, def: 0, tier: 'C' },
        armor: { id: 'none_armor', name: '허름한 옷', atk: 0, def: 0, tier: 'C' },
        boots: { id: 'none_boots', name: '맨발', atk: 0, def: 0, tier: 'C' }
    };
    gameState.son.equipment[slot] = baseMap[slot] || gameState.son.equipment[slot];
    showToast("장비를 해제했습니다.", 'info');
    updateUI();
}
window.unequipGear = unequipGear;

function equipWeaponTier(tier) {
    if (gameState.parent.weaponInventory[tier].count > 0) {
        gameState.parent.weaponInventory[tier].count--;
        const currentTier = gameState.son.equipment.weapon.tier;
        // return previous weapon to appropriate inventory
        if (gameState.son.equipment.weapon.id && gameState.son.equipment.weapon.id.startsWith('weapon_')) {
            gameState.parent.weaponInventory[currentTier].count++;
        } else if (gameState.son.equipment.weapon.id && (gameState.parent.specialWeaponInventory?.[gameState.son.equipment.weapon.id])) {
            gameState.parent.specialWeaponInventory[gameState.son.equipment.weapon.id].count++;
        }
        gameState.son.equipment.weapon = {
            id: `weapon_${tier}`,
            name: gameState.parent.weaponInventory[tier].name,
            atk: gameState.parent.weaponInventory[tier].atk,
            def: 0,
            tier: tier
        };
        closeInventory();
        updateUI();
        sonSpeech("우와 새 장비다!!");
        showToast(`${gameState.parent.weaponInventory[tier].name} 장착!`, 'success');
    }
}

function equipSpecialWeapon(id) {
    const w = gameState.parent.specialWeaponInventory?.[id];
    if (!w || w.count <= 0) return;
    w.count--;

    // return previous weapon
    if (gameState.son.equipment.weapon.id && gameState.son.equipment.weapon.id.startsWith('weapon_')) {
        const tier = gameState.son.equipment.weapon.tier;
        if (gameState.parent.weaponInventory?.[tier]) gameState.parent.weaponInventory[tier].count++;
    } else if (gameState.son.equipment.weapon.id && gameState.parent.specialWeaponInventory?.[gameState.son.equipment.weapon.id]) {
        gameState.parent.specialWeaponInventory[gameState.son.equipment.weapon.id].count++;
    }

    gameState.son.equipment.weapon = {
        id: w.id,
        name: w.name,
        atk: w.atk,
        def: 0,
        tier: w.tier || 'B'
    };
    closeInventory();
    updateUI();
    sonSpeech("이 무기… 뭔가 다르다!");
    showToast(`${w.name} 장착!`, 'gold');
}
window.equipSpecialWeapon = equipSpecialWeapon;

function closeInventory() {
    if (els.invModal) els.invModal.style.display = 'none';
}
window.closeInventory = closeInventory;

function ensureUiLocks() {
    if (!gameState.parent.uiLocks || typeof gameState.parent.uiLocks !== 'object') gameState.parent.uiLocks = {};
    if (typeof gameState.parent.uiLocks.wardrobe !== 'boolean') gameState.parent.uiLocks.wardrobe = false;
}

function isWardrobeLocked() {
    ensureUiLocks();
    return !!gameState.parent.uiLocks.wardrobe;
}

function updateWardrobeUI() {
    const weaponName = document.getElementById('wb-weapon-name');
    const weaponStat = document.getElementById('wb-weapon-stat');
    const helmetName = document.getElementById('wb-helmet-name');
    const helmetStat = document.getElementById('wb-helmet-stat');
    const armorName = document.getElementById('wb-armor-name');
    const armorStat = document.getElementById('wb-armor-stat');
    const bootsName = document.getElementById('wb-boots-name');
    const bootsStat = document.getElementById('wb-boots-stat');
    if (!weaponName || !helmetName || !armorName || !bootsName) return;

    const w = gameState.son.equipment.weapon;
    weaponName.innerText = w?.name || '-';
    weaponStat.innerText = w ? `공+${w.atk}` : '';

    const h = gameState.son.equipment.helmet;
    const hEmpty = !h?.id || String(h.id).startsWith('none_');
    helmetName.innerText = hEmpty ? '비어있음' : (h?.name || '-');
    helmetStat.innerText = (!hEmpty && h) ? `방+${h.def}` : '';

    const a = gameState.son.equipment.armor;
    const aEmpty = !a?.id || String(a.id).startsWith('none_');
    armorName.innerText = aEmpty ? '비어있음' : (a?.name || '-');
    armorStat.innerText = (!aEmpty && a) ? `방+${a.def}` : '';

    const b = gameState.son.equipment.boots;
    const bEmpty = !b?.id || String(b.id).startsWith('none_');
    bootsName.innerText = bEmpty ? '비어있음' : (b?.name || '-');
    bootsStat.innerText = (!bEmpty && b) ? `방+${b.def}` : '';

    const setImg = (slot, eq) => {
        const img = document.getElementById(`wg-img-${slot}`);
        const wrap = img ? img.closest('.wg-icon') : null;
        const sil = wrap ? wrap.querySelector('.wg-sil') : null;
        if (!img || !wrap) return;
        const id = eq?.id;
        const isEmpty = !id || String(id).startsWith('none_');
        const iconId = (!isEmpty) ? String(id) : null;
        if (iconId) {
            img.src = `assets/items/${iconId}.png`;
            img.style.display = 'block';
            if (sil) sil.style.display = 'none';
            img.onerror = () => {
                img.style.display = 'none';
                if (sil) sil.style.display = 'block';
            };
        } else {
            img.src = '';
            img.style.display = 'none';
            if (sil) sil.style.display = 'block';
        }
    };

    setImg('weapon', w || null);
    setImg('helmet', h || null);
    setImg('armor', a || null);
    setImg('boots', b || null);
}

function selectRoomView(roomId) {
    if (!roomId || !els.roomViews?.[roomId]) return;
    els.roomTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-room') === roomId));
    Object.entries(els.roomViews).forEach(([id, el]) => el.classList.toggle('active', id === roomId));
    updateUpgradeButtons(roomId);
}

function openWardrobe(focusSlot = null) {
    if (gameState.son.state === 'ADVENTURING') {
        showToast("아들이 모험 중이라 옷장을 열 수 없어요.", 'warning');
        return;
    }
    ensureUiLocks();
    gameState.parent.uiLocks.wardrobe = true;
    if (typeof setMainView === 'function') setMainView('home');
    selectRoomView('room-wardrobe');
    updateWardrobeUI();

    if (focusSlot) {
        const el = document.querySelector(`[data-wslot=\"${focusSlot}\"]`);
        if (el) {
            el.style.outline = '3px solid rgba(59,130,246,0.45)';
            el.style.outlineOffset = '2px';
            setTimeout(() => {
                el.style.outline = '';
                el.style.outlineOffset = '';
            }, 850);
        }
    }
}
window.openWardrobe = openWardrobe;

function closeWardrobe() {
    ensureUiLocks();
    gameState.parent.uiLocks.wardrobe = false;
    selectRoomView('room-bed');
}
window.closeWardrobe = closeWardrobe;

function openWardrobePicker(slot) {
    if (!slot) return;
    openWardrobe();
    openInventory(slot);
}
window.openWardrobePicker = openWardrobePicker;

function unequipWeapon() {
    const cur = gameState.son.equipment.weapon;
    if (!cur || cur.name === '몽둥이') {
        showToast("이미 기본 무기입니다.", 'info');
        return;
    }
    // return current weapon
    if (cur.id && cur.id.startsWith('weapon_')) {
        const tier = cur.tier;
        if (gameState.parent.weaponInventory?.[tier]) gameState.parent.weaponInventory[tier].count++;
    } else if (cur.id && gameState.parent.specialWeaponInventory?.[cur.id]) {
        gameState.parent.specialWeaponInventory[cur.id].count++;
    }
    gameState.son.equipment.weapon = { id: 'weapon_C', name: '몽둥이', atk: 1, def: 0, tier: 'C' };
    showToast("무기를 해제했습니다.", 'info');
    updateUI();
}
window.unequipWeapon = unequipWeapon;

function placeItem(itemId) {
    if (gameState.parent.inventory[itemId].count > 0) {
        gameState.parent.inventory[itemId].count--;
        gameState.rooms[currentTargetRoom].placedItem = itemId;
        const slotEl = els.slots[currentTargetRoom];
        if (slotEl) {
            slotEl.innerHTML = `<div>${gameState.parent.inventory[itemId].name.split(' ')[0]}</div>`;
            slotEl.classList.add('filled');
        }
        closeInventory();
        updateUI();
        showToast("아이템 배치 완료!", 'success');
    }
}

// ============================================================
// Weapon Synthesis
// ============================================================
function updateSynthesisUI() {
    if (!els.weaponInventoryList) return;
    els.weaponInventoryList.innerHTML = '';
    Object.keys(gameState.parent.weaponInventory).forEach((tier, index, arr) => {
        const item = gameState.parent.weaponInventory[tier];
        const nextTier = arr[index + 1];
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:5px; background:white; border-radius:5px;';
        const icon = `<img src="assets/items/weapon_${tier}.png" alt="" style="width:22px; height:22px; vertical-align:middle; margin-right:6px; image-rendering:pixelated; border-radius:7px; border:1px solid #e2e8f0; background:#fff;" onerror="this.style.display='none'">`;
        let html = `<span style="font-size:0.85rem">${icon}[${tier}] ${item.name}: ${item.count}개</span>`;
        if (nextTier && item.count >= 3) {
            html += `<button class="action-btn" style="width:auto; padding:4px 10px; margin:0; font-size:0.75rem; background:#8b5cf6;" onclick="synthesizeWeapon('${tier}', '${nextTier}')">합성 (3개)</button>`;
        } else if (nextTier) {
            html += `<span style="font-size:0.7rem; color:#94a3b8">${item.count}/3</span>`;
        }
        div.innerHTML = html;
        els.weaponInventoryList.appendChild(div);
    });

    // Special weapons (crafted milestones)
    if (gameState.parent.specialWeaponInventory) {
        const header = document.createElement('div');
        header.style.cssText = 'margin-top:8px; font-size:0.75rem; color:#64748b; font-weight:900;';
        header.innerText = '특별 무기';
        els.weaponInventoryList.appendChild(header);
        Object.values(gameState.parent.specialWeaponInventory).forEach(w => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:5px; background:white; border-radius:5px; border:1px solid #e2e8f0;';
            const icon = `<img src="assets/items/${w.id}.png" alt="" style="width:22px; height:22px; vertical-align:middle; margin-right:6px; image-rendering:pixelated; border-radius:7px; border:1px solid #e2e8f0; background:#fff;" onerror="this.style.display='none'">`;
            div.innerHTML = `<span style="font-size:0.85rem">${icon}[★] ${w.name}: ${w.count}개</span><span style="font-size:0.7rem; color:#94a3b8">공+${w.atk}</span>`;
            els.weaponInventoryList.appendChild(div);
        });
    }
}
window.synthesizeWeapon = function(currentTier, nextTier) {
    if (gameState.parent.weaponInventory[currentTier].count >= 3) {
        gameState.parent.weaponInventory[currentTier].count -= 3;
        gameState.parent.weaponInventory[nextTier].count++;

        addSmithyXp(2);

        // Byproducts (keeps synthesis meaningful without dismantling)
        const byproductMap = {
            'C>B': { iron_scrap: 1 },
            'B>A': { iron_scrap: 2, arcane_dust: 1 },
            'A>S': { iron_scrap: 4, arcane_dust: 2 }
        };
        const key = `${currentTier}>${nextTier}`;
        const byp = { ...(byproductMap[key] || {}) };

        // Smithy skill slightly improves byproducts over time
        ensureSmithy();
        const smithLv = gameState.parent.smithy.level;
        const extraScrap = Math.floor((smithLv - 1) / 4);
        const extraDust = Math.floor((smithLv - 1) / 6);
        if (extraScrap > 0) byp.iron_scrap = (byp.iron_scrap || 0) + extraScrap;
        if (extraDust > 0 && (byp.arcane_dust || 0) > 0) byp.arcane_dust = (byp.arcane_dust || 0) + extraDust;

        const gained = [];
        Object.entries(byp).forEach(([k, v]) => {
            ensureLootKey(k);
            gameState.parent.loot[k].count += v;
            gained.push(`${gameState.parent.loot[k].name} x${v}`);
        });

        showToast(
            `[${nextTier}급] ${gameState.parent.weaponInventory[nextTier].name} 합성 성공!${gained.length ? ` (+${gained.join(', ')})` : ''}`,
            'gold'
        );
        updateUI();
    }
};

function exchangeByproduct(fromKey, fromAmount, toKey, toAmount) {
    ensureLootKey(fromKey);
    ensureLootKey(toKey);
    const need = Math.max(1, Math.floor(fromAmount));
    const gain = Math.max(1, Math.floor(toAmount));
    if (need <= 4) {
        // "Pro exchange" rates are unlock-gated
        if (!isSmithyUnlocked('exchange_pro')) {
            showToast("🧱 숙련 교환은 대장간 숙련도 Lv.3부터 해금됩니다.", 'warning');
            return;
        }
    }
    if ((gameState.parent.loot[fromKey].count || 0) < need) {
        showToast(`${gameState.parent.loot[fromKey].name} 부족! (${need}개 필요)`, 'error');
        return;
    }
    gameState.parent.loot[fromKey].count -= need;
    gameState.parent.loot[toKey].count += gain;
    addSmithyXp(1);
    showToast(`${gameState.parent.loot[fromKey].name} ${need}개 → ${gameState.parent.loot[toKey].name} ${gain}개`, 'success');
    updateUI();
}
window.exchangeByproduct = exchangeByproduct;

// ============================================================
// #3 — Furniture Upgrade System
// ============================================================
function upgradeFurniture(type) {
    const currentLv = gameState.parent.upgrades[type];
    const data = upgradeData[type];
    if (currentLv >= data.costs.length - 1) {
        showToast("이미 최고 레벨입니다!", 'warning');
        return;
    }
    const prevEffect = getUpgradeEffectValue(type, currentLv);
    const cost = data.costs[currentLv]; // cost for NEXT level
    if (gameState.parent.gold >= cost) {
        gameState.parent.gold -= cost;
        gameState.parent.upgrades[type]++;
        const newLv = gameState.parent.upgrades[type];
        const nextEffect = getUpgradeEffectValue(type, newLv);
        const slotTitle = type === 'bed' ? '침대' : type === 'table' ? '식탁' : type === 'desk' ? '책상' : '훈련장';
        const modelName = getFurnitureModel(type)?.name || '기본';
        showToast(`${data.emoji} ${slotTitle} 강화 Lv.${newLv} (모델: ${modelName})`, 'gold');
        showToast(`효과: ${getUpgradeEffectLabel(type, prevEffect)} → ${getUpgradeEffectLabel(type, nextEffect)}`, 'info');
        updateUI();
        updateUpgradeButtons(getActiveRoom());
    } else {
        showToast(`골드 부족! (필요: ${cost}G)`, 'error');
    }
}
window.upgradeFurniture = upgradeFurniture;

function getActiveRoom() {
    for (const tab of els.roomTabs) {
        if (tab.classList.contains('active')) return tab.getAttribute('data-room');
    }
    return 'room-bed';
}

function updateUpgradeButtons(roomId) {
    // Hide all upgrade buttons
    ['bed', 'desk', 'table', 'dummy'].forEach(t => {
        const btn = document.getElementById(`upgrade-${t}`);
        if (btn) btn.style.display = 'none';
    });
    // Don't show during adventure
    if (gameState.son.state === 'ADVENTURING') return;
    // Show relevant button
    const typeMap = { 'room-bed': 'bed', 'room-desk': 'desk', 'room-table': 'table', 'room-dummy': 'dummy' };
    const type = typeMap[roomId];
    if (!type) return;
    const btn = document.getElementById(`upgrade-${type}`);
    const data = upgradeData[type];
    const lv = gameState.parent.upgrades[type];
    if (lv < data.costs.length - 1) {
        const nextLv = lv + 1;
        const effectPreview = getUpgradeEffectPreview(type, lv, nextLv);
        const modelName = getFurnitureModel(type)?.name || '기본';
        btn.innerHTML = `⬆️ 강화 Lv.${nextLv} (${data.costs[lv]}G)<span class="up-sub">모델: ${modelName} · 효과: ${effectPreview}</span>`;
        btn.style.display = 'block';
    }
}

// ============================================================
// Quest System
// ============================================================
const questDB = [
    { type: 'money', desc: "엄마, 저 용돈 100골드만 주세요!", timer: 30, reqGold: 100 },
    { type: 'money', desc: "엄마! 마을에서 멋진 걸 봤는데 50골드만...", timer: 25, reqGold: 50 },
    { type: 'food', desc: "엄마 배고파요. 뭐 좀 먹을 거 주세요!", timer: 60, reqItem: 'kitchen' },
    { type: 'food', desc: "엄마, 맛있는 거 해주세요!", timer: 60, reqItem: 'kitchen' },
    { type: 'equipment', desc: "엄마, 더 좋은 무기 없어요?", timer: 45, reqItem: 'weapon' },
    { type: 'attention', desc: "엄마, 나 좀 봐주세요!", timer: 20, reqItem: 'none' }
];

function triggerRandomQuest() {
    if (gameState.son.quest || Math.random() > 0.1) return;
    const q = questDB[Math.floor(Math.random() * questDB.length)];
    gameState.son.quest = { ...q, active: true, context: 'home' };
    sonSpeech("엄마!! 부탁이 있어요!");
    updateUI();
}

function handleQuestTick() {
    if (!gameState.son.quest) return;
    gameState.son.quest.timer--;
    if (gameState.son.quest.timer <= 0) {
        const ctx = gameState.son.quest.context || 'home';
        if (ctx === 'adventure') {
            addMail("📵 연락 실패", "모험 중 연락을 놓쳤습니다. 아들이 서운해합니다.");
            gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 8);
            gameState.son.affinity.trust = Math.max(0, gameState.son.affinity.trust - 3);
        } else {
            sonSpeech("치.. 엄마 미워!");
            addMail("부탁 거절", "아들의 부탁을 들어주지 않아 ⚡반항심이 올랐습니다.");
            gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 15);
            gameState.son.affinity.affection = Math.max(0, gameState.son.affinity.affection - 5);
        }
        closeQuestModal();
        gameState.son.quest = null;
    }
    updateUI();
}

function openQuestModal() {
    // Legacy alias: quest system was replaced by accumulated requests.
    openRequestsModal();
}
window.openQuestModal = openQuestModal;

function closeQuestModal() { els.questModal.style.display = 'none'; }

// --- Quest helpers ---
function checkQuestFulfillable(q) {
    const ctx = q.context || 'home';
    if (q.type === 'money') {
        if (gameState.parent.gold >= q.reqGold) {
            return { possible: true, label: `들어주기 (${q.reqGold}G)` };
        }
    } else if (q.type === 'food') {
        const kitchenItems = Object.keys(gameState.parent.inventory).filter(k =>
            gameState.parent.inventory[k].type === 'kitchen' && gameState.parent.inventory[k].count > 0
        );
        if (kitchenItems.length > 0) {
            return { possible: true, label: `${gameState.parent.inventory[kitchenItems[0]].name} 주기` };
        }
        if (ctx !== 'adventure' && gameState.rooms['room-table'].placedItem) {
            return { possible: true, label: '식탁 위 음식 주기' };
        }
    } else if (q.type === 'equipment') {
        // Check if we have a weapon better than current
        const tiers = ['C', 'B', 'A', 'S'];
        const currentIdx = tiers.indexOf(gameState.son.equipment.weapon.tier);
        for (let i = currentIdx + 1; i < tiers.length; i++) {
            if (gameState.parent.weaponInventory[tiers[i]].count > 0) {
                return { possible: true, label: `${gameState.parent.weaponInventory[tiers[i]].name} 장착해주기` };
            }
        }
    } else if (q.type === 'attention') {
        return { possible: false }; // handled separately
    }
    return { possible: false };
}

function getExtendTime(q) {
    if (q.type === 'food') return 60;
    if (q.type === 'equipment') return 45;
    if (q.type === 'money') return 30;
    return 30;
}

function getQuestHint(q) {
    if (q.type === 'food') {
        return '💡 <b>힌트:</b> 마을에서 요리 재료를 사거나, 텃밭에서 수확해서 주방에서 요리하세요!';
    } else if (q.type === 'equipment') {
        return '💡 <b>힌트:</b> 대장간에서 무기를 뽑거나 합성하세요!';
    } else if (q.type === 'money') {
        return `💡 <b>힌트:</b> 바느질로 ${q.reqGold}G를 모으세요!`;
    }
    return '';
}

function extendQuest() {
    const q = gameState.son.quest;
    if (!q || q.extended) return;
    q.extended = true;
    const bonus = getExtendTime(q);
    q.timer += bonus;
    sonSpeech("알겠어요.. 빨리요 엄마!");
    showToast(`⏳ 아들이 기다려줍니다! +${bonus}초`, 'info');
    const ctx = q.context || 'home';
    const trustCost = ctx === 'adventure' ? 1 : 2;
    gameState.son.affinity.trust = Math.max(0, gameState.son.affinity.trust - trustCost); // slight trust cost
    closeQuestModal();
    updateUI();
}

function acceptQuest() {
    const q = gameState.son.quest;
    if (!q) return;
    let success = false;
    let bonusAffection = 10;
    const ctx = q.context || 'home';

    if (q.type === 'money' && gameState.parent.gold >= q.reqGold) {
        gameState.parent.gold -= q.reqGold;
        success = true;
    } else if (q.type === 'food') {
        const kitchenItems = Object.keys(gameState.parent.inventory).filter(k =>
            gameState.parent.inventory[k].type === 'kitchen' && gameState.parent.inventory[k].count > 0
        );
        if (kitchenItems.length > 0) {
            gameState.parent.inventory[kitchenItems[0]].count--;
            success = true;
        } else if (ctx !== 'adventure' && gameState.rooms['room-table'].placedItem) {
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
            success = true;
        }
    } else if (q.type === 'equipment') {
        const tiers = ['C', 'B', 'A', 'S'];
        const currentIdx = tiers.indexOf(gameState.son.equipment.weapon.tier);
        for (let i = currentIdx + 1; i < tiers.length; i++) {
            if (gameState.parent.weaponInventory[tiers[i]].count > 0) {
                gameState.parent.weaponInventory[tiers[i]].count--;
                const oldTier = gameState.son.equipment.weapon.tier;
                gameState.parent.weaponInventory[oldTier].count++;
                gameState.son.equipment.weapon = {
                    id: `weapon_${tiers[i]}`,
                    name: gameState.parent.weaponInventory[tiers[i]].name,
                    atk: gameState.parent.weaponInventory[tiers[i]].atk,
                    def: 0,
                    tier: tiers[i]
                };
                bonusAffection = 15;
                success = true;
                break;
            }
        }
    } else if (q.type === 'attention') {
        success = true;
        bonusAffection = 5;
    }

    if (success) {
        if (ctx !== 'adventure') sonSpeech("우와! 엄마 최고 사랑해요!!");
        gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + bonusAffection);
        gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 5);
        gameState.son.affinity.rebellion = Math.max(0, gameState.son.affinity.rebellion - 10);
        gameState.son.personality.morality = clampInt((gameState.son.personality.morality ?? 50) + 1, 0, 100);
        showToast(ctx === 'adventure' ? "모험 중 아들을 도왔습니다! 💌" : "아들의 부탁을 들어줬습니다! ❤️", 'success');
        closeQuestModal();
        gameState.son.quest = null;
        updateUI();
    } else {
        showToast("아직 조건을 만족하지 못했습니다! 준비할 시간을 벌어보세요.", 'warning');
    }
}

function rejectQuest() {
    const q = gameState.son.quest;
    const ctx = q?.context || 'home';
    if (ctx === 'adventure') {
        addMail("📵 연락 종료", "모험 중 도움을 못 받았다고 아들이 투덜댑니다.");
        gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 6);
        gameState.son.affinity.trust = Math.max(0, gameState.son.affinity.trust - 2);
        gameState.son.personality.morality = clampInt((gameState.son.personality.morality ?? 50) - 1, 0, 100);
        showToast("모험 중 연락을 거절했습니다.", 'warning');
    } else {
        sonSpeech("엄마 미워!!");
        gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 10);
        gameState.son.personality.morality = clampInt((gameState.son.personality.morality ?? 50) - 1, 0, 100);
        showToast("아들이 실망했습니다... ⚡반항심 +10", 'warning');
    }
    closeQuestModal();
    gameState.son.quest = null;
    updateUI();
}
window.rejectQuest = rejectQuest;

// ============================================================
// Requests system (accumulates + deadline-based completion)
// ============================================================
const requestTemplates = [
    {
        kind: 'need_book',
        title: '📚 책이 필요해요',
        desc: '엄마, 책 좀… 읽고 싶어요.',
        help: '해결: 집(서재)에서 책장에 책을 배치해두기',
        durationMs: 60 * 60 * 1000, // 1h
        passive: true
    },
    {
        kind: 'need_steak',
        title: '🥩 스테이크 해주세요',
        desc: '엄마! 오늘은 스테이크 먹고 싶어요!',
        help: '해결: 주방에서 스테이크를 조리하면 식탁에 자동으로 올라가요',
        durationMs: 60 * 1000, // 1m
        passive: true
    },
    {
        kind: 'need_better_weapon',
        title: '🗡️ 더 좋은 무기 없어요?',
        desc: '엄마, 더 좋은 무기 없어요?',
        help: '해결: 옷장에서 더 좋은 무기를 장착해두기 (또는 자동 장착 버튼)',
        durationMs: 4 * 60 * 1000,
        passive: true
    },
    {
        kind: 'need_money',
        title: '🪙 용돈 주세요',
        desc: '엄마, 용돈 조금만…',
        help: '해결: 요청 목록에서 골드를 지급하기',
        durationMs: 6 * 60 * 1000,
        passive: false
    },
    {
        kind: 'need_hug',
        title: '🤗 나 좀 봐주세요',
        desc: '엄마, 나 좀 봐주세요!',
        help: '해결: 요청 목록에서 “안아주기” 버튼 누르기',
        durationMs: 90 * 1000,
        passive: false
    }
];

function newRequestId() {
    return `req_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function formatRemainingMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
}

function getOpenRequests() {
    ensureRequestState();
    return (gameState.son.requests || []).filter(r => r && r.status === 'open');
}

function countShelfBooks() {
    ensureLibraryState();
    return (gameState.parent.library?.shelf || []).filter(Boolean).length;
}

function getBestOwnedWeaponAtk() {
    const curAtk = gameState.son.equipment?.weapon?.atk || 0;
    let bestAtk = curAtk;
    const tiers = ['C', 'B', 'A', 'S'];
    for (const t of tiers) {
        const item = gameState.parent.weaponInventory?.[t];
        if (!item || (item.count || 0) <= 0) continue;
        bestAtk = Math.max(bestAtk, item.atk || 0);
    }
    for (const w of Object.values(gameState.parent.specialWeaponInventory || {})) {
        if (!w || (w.count || 0) <= 0) continue;
        bestAtk = Math.max(bestAtk, w.atk || 0);
    }
    return bestAtk;
}

function hasBetterWeaponToEquip(baselineAtk) {
    const base = Math.max(0, Math.floor(baselineAtk || 0));
    return getBestOwnedWeaponAtk() > base;
}

function getIngredientCostToCookRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return Infinity;
    ensurePantry();
    let total = 0;
    for (const [k, v] of Object.entries(recipe.needs || {})) {
        const need = Math.max(0, Math.floor(v || 0));
        const have = getPantryCount(k);
        const missing = Math.max(0, need - have);
        const price = ingredientPrices[k];
        if (!Number.isFinite(price)) return Infinity;
        total += missing * price;
    }
    return total;
}

function canAcquireAnyNewBook() {
    ensureLibraryState();
    const lib = gameState.parent.library;
    // placeable now (owned + unread + not on shelf)
    const canPlaceNow = bookCatalog.some(b => lib.owned?.[b.id] && !lib.read?.[b.id] && !(lib.shelf || []).includes(b.id));
    if (canPlaceNow) return true;
    // purchasable in the future (not owned + unlocked)
    return bookCatalog.some(b => !lib.owned?.[b.id] && isBookUnlocked(b));
}

function addRequestFromTemplate(kind) {
    ensureRequestState();
    ensureSonGrowthState();
    const tpl = requestTemplates.find(t => t.kind === kind);
    if (!tpl) return null;

    const open = getOpenRequests();
    if (open.some(r => r.kind === kind)) return null;

    const now = Date.now();
    const req = {
        id: newRequestId(),
        kind: tpl.kind,
        title: tpl.title,
        desc: tpl.desc,
        help: tpl.help,
        createdAt: now,
        dueAt: now + tpl.durationMs,
        status: 'open',
        data: {}
    };

    if (kind === 'need_money') {
        const amount = Math.random() < 0.5 ? 50 : 100;
        req.data.amount = amount;
        req.desc = amount === 100 ? '엄마, 용돈 100골드만 주세요!' : '엄마… 50골드만…';
        req.help = `해결: 요청 목록에서 ${amount}G 지급하기`;
    }
    if (kind === 'need_better_weapon') {
        req.data.baselineAtk = gameState.son.equipment?.weapon?.atk || 0;
        req.data.baselineName = gameState.son.equipment?.weapon?.name || '';
        if (!hasBetterWeaponToEquip(req.data.baselineAtk)) return null;
        req.help = `해결: 요청 목록에서 “자동 장착”을 누르거나, 옷장에서 현재(${req.data.baselineName} 공+${req.data.baselineAtk})보다 좋은 무기를 장착해두기`;
    }
    if (kind === 'need_book') {
        ensureLibraryState();
        if (!canAcquireAnyNewBook()) return null;
        req.data.baselineShelfPlaceRevision = gameState.parent.library?.shelfPlaceRevision || 0;
        req.help = '해결: 집(서재)에서 책장에 책을 “추가 배치”하거나, 기존 책을 빼고 다른 책으로 “교체”해두기';
    }

    gameState.son.requests.unshift(req);
    if (gameState.son.requests.length > 10) gameState.son.requests = gameState.son.requests.slice(0, 10);

    sonSpeech("엄마!! 부탁이 있어요!");
    addMail("📋 아들의 요청", `${req.title}\n"${req.desc}"\n\n${req.help}`);
    showToast("📋 아들의 요청이 추가되었습니다.", 'info');
    updateUI();
    return req;
}

function isRequestConditionMet(req) {
    if (!req || req.status !== 'open') return false;
    if (req.kind === 'need_steak') {
        return gameState.rooms?.['room-table']?.placedItem === 'steak';
    }
    if (req.kind === 'need_book') {
        ensureLibraryState();
        const baseRev = Math.max(0, Math.floor(req.data?.baselineShelfPlaceRevision || 0));
        const curRev = gameState.parent.library?.shelfPlaceRevision || 0;
        return (curRev > baseRev) && (countShelfBooks() > 0);
    }
    if (req.kind === 'need_better_weapon') {
        const baseAtk = Math.max(0, Math.floor(req.data?.baselineAtk || 0));
        const curAtk = gameState.son.equipment?.weapon?.atk || 0;
        return curAtk > baseAtk;
    }
    return false;
}

function applyRequestSuccess(req, meta = {}) {
    const auto = !!meta.auto;
    const affection = req.kind === 'need_hug' ? 6 : 8;
    const trust = req.kind === 'need_money' ? 4 : 3;
    const rebellionDown = req.kind === 'need_hug' ? 6 : 4;
    gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + affection, 0, 100);
    gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + trust, 0, 100);
    gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - rebellionDown, 0, 100);
    gameState.son.personality.morality = clampInt((gameState.son.personality.morality ?? 50) + 1, 0, 100);
    if (req.kind === 'need_book' || req.kind === 'need_steak') {
        gameState.son.personality.flexibility = clampInt((gameState.son.personality.flexibility ?? 50) + 1, 0, 100);
    }
    addMail("✅ 요청 완료", `${req.title}\n${auto ? '(자동 완료)' : ''}\n아들이 기뻐합니다.`);
    showToast("✅ 요청을 해결했습니다!", 'success');
}

function applyRequestFail(req) {
    gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) + 10, 0, 100);
    gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) - 4, 0, 100);
    gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) - 2, 0, 100);
    gameState.son.personality.morality = clampInt((gameState.son.personality.morality ?? 50) - 1, 0, 100);
    addMail("⏰ 요청 실패", `${req.title}\n기한 내 해결하지 못했습니다. (⚡반항 상승)`);
    showToast("⏰ 요청을 놓쳤습니다...", 'warning');
}

function completeRequest(reqId, meta = {}) {
    ensureRequestState();
    const req = gameState.son.requests.find(r => r.id === reqId);
    if (!req || req.status !== 'open') return false;
    req.status = 'done';
    applyRequestSuccess(req, meta);
    updateUI();
    return true;
}

function fulfillRequestNow(reqId) {
    ensureRequestState();
    const req = gameState.son.requests.find(r => r.id === reqId);
    if (!req || req.status !== 'open') return;

    if (req.kind === 'need_money') {
        const amt = Math.max(0, Math.floor(req.data?.amount || 0));
        if (gameState.parent.gold < amt) {
            showToast("골드가 부족합니다!", 'error');
            return;
        }
        gameState.parent.gold -= amt;
        completeRequest(reqId);
        return;
    }
    if (req.kind === 'need_hug') {
        sonSpeech("헤헤… 고마워요 엄마.");
        completeRequest(reqId);
        return;
    }
    showToast("이 요청은 행동으로 해결됩니다. (해결 방법 참고)", 'info');
}
window.fulfillRequestNow = fulfillRequestNow;

function autoEquipBestWeapon() {
    const curAtk = gameState.son.equipment?.weapon?.atk || 0;
    let best = { type: null, id: null, tier: null, atk: curAtk };

    const tiers = ['C', 'B', 'A', 'S'];
    for (const t of tiers) {
        const item = gameState.parent.weaponInventory?.[t];
        if (!item || (item.count || 0) <= 0) continue;
        if ((item.atk || 0) > best.atk) best = { type: 'tier', tier: t, atk: item.atk };
    }
    for (const [id, w] of Object.entries(gameState.parent.specialWeaponInventory || {})) {
        if (!w || (w.count || 0) <= 0) continue;
        if ((w.atk || 0) > best.atk) best = { type: 'special', id, atk: w.atk };
    }

    if (!best.type) {
        showToast("장착할 더 좋은 무기가 없어요.", 'warning');
        return false;
    }
    if (best.type === 'tier') equipWeaponTier(best.tier);
    else equipSpecialWeapon(best.id);
    return true;
}
window.autoEquipBestWeapon = autoEquipBestWeapon;

function openRequestsModal() {
    if (els.questModal) els.questModal.style.display = 'flex';
    renderRequestsUI();
    updateUI();
}
window.openRequestsModal = openRequestsModal;

function closeRequestsModal() {
    if (els.questModal) els.questModal.style.display = 'none';
}
window.closeRequestsModal = closeRequestsModal;

function renderRequestsUI() {
    if (!els.requestList) return;
    ensureRequestState();
    const open = getOpenRequests();
    if (!open.length) {
        els.requestList.innerHTML = `<div class="hint-card" style="background:#f8fafc; border:1px solid #e2e8f0;">아직 쌓인 요청이 없습니다.</div>`;
        return;
    }
    const now = Date.now();
    open.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));

    els.requestList.innerHTML = open.map(req => {
        const remaining = Math.max(0, (req.dueAt || 0) - now);
        const remText = formatRemainingMs(remaining);
        const urgent = remaining <= 30 * 1000;
        const canPay = req.kind === 'need_money' ? (gameState.parent.gold >= (req.data?.amount || 0)) : true;

        let actionHtml = '';
        if (req.kind === 'need_money') {
            const amt = req.data?.amount || 0;
            actionHtml = `
              <button class="mini-btn" type="button" ${canPay ? '' : 'disabled'} onclick="fulfillRequestNow('${req.id}')">지급 (${amt}G)</button>
            `;
        } else if (req.kind === 'need_hug') {
            actionHtml = `<button class="mini-btn" type="button" onclick="fulfillRequestNow('${req.id}')">🤗 안아주기</button>`;
        } else if (req.kind === 'need_better_weapon') {
            actionHtml = `
              <button class="mini-btn" type="button" onclick="autoEquipBestWeapon()">자동 장착</button>
              <button class="mini-btn secondary" type="button" onclick="setMainView('home'); setHomeRoomView('room-wardrobe')">옷장</button>
            `;
        } else if (req.kind === 'need_book') {
            actionHtml = `
              <button class="mini-btn secondary" type="button" onclick="setMainView('home'); setHomeRoomView('room-desk'); openBookshelfManager();">책장</button>
            `;
        } else if (req.kind === 'need_steak') {
            actionHtml = `
              <button class="mini-btn secondary" type="button" onclick="setMainView('home'); setHomeRoomView('room-table'); openKitchenCookMenu();">주방</button>
            `;
        } else {
            actionHtml = `<button class="mini-btn secondary" type="button" onclick="setMainView('son'); setSonTab('summary')">확인</button>`;
        }

        return `
          <div class="support-row ${urgent ? 'pinned' : ''}">
            <div style="flex:1; min-width:0;">
              <div class="support-title">${req.title} <span style="font-size:0.75rem; color:${urgent ? '#ef4444' : '#64748b'}; font-weight:1000;">⏰ ${remText}</span></div>
              <div class="support-sub">"${req.desc}"</div>
              <div class="support-sub" style="margin-top:8px;"><b>해결 방법</b><br>${req.help}</div>
            </div>
            <div class="support-actions">${actionHtml}</div>
          </div>
        `;
    }).join('');
}

function requestsTick() {
    ensureRequestState();
    const now = Date.now();
    let changed = false;
    for (const r of gameState.son.requests) {
        if (!r || r.status !== 'open') continue;
        if (isRequestConditionMet(r)) {
            r.status = 'done';
            applyRequestSuccess(r, { auto: true });
            changed = true;
            continue;
        }
        if ((r.dueAt || 0) <= now) {
            r.status = 'failed';
            applyRequestFail(r);
            changed = true;
        }
    }
    if (changed) updateUI();
}

let lastRequestRollAt = 0;
function triggerRandomRequest() {
    ensureRequestState();
    const now = Date.now();
    const open = getOpenRequests();
    if (open.length >= 3) return;
    if (now - lastRequestRollAt < 18 * 1000) return;
    lastRequestRollAt = now;

    // Reduce home request frequency (~50%).
    if (Math.random() > 0.275) return;

    const feasible = (kind) => {
        if (kind === 'need_better_weapon') {
            const curAtk = gameState.son.equipment?.weapon?.atk || 0;
            return hasBetterWeaponToEquip(curAtk);
        }
        if (kind === 'need_steak') {
            const r = recipes.find(x => x.id === 'steak');
            if (r && canCookRecipe(r)) return true;
            const cost = getIngredientCostToCookRecipe('steak');
            if (!(Number.isFinite(cost) && cost !== Infinity)) return false;
            if (gameState.parent.gold >= cost) return true;
            // Sometimes doable via quick side jobs (energy-based).
            ensureWorkState();
            const w = gameState.parent.work;
            const reward = getWorkGoldReward(w.level);
            const bestGold = gameState.parent.gold + reward * Math.max(0, Math.floor(w.energy || 0));
            return bestGold >= cost;
        }
        if (kind === 'need_book') {
            return canAcquireAnyNewBook();
        }
        return true;
    };

    const weights = [
        { kind: 'need_steak', w: 22 },
        { kind: 'need_book', w: 18 },
        { kind: 'need_better_weapon', w: 14 },
        { kind: 'need_money', w: 12 },
        { kind: 'need_hug', w: 10 }
    ].filter(x => !open.some(r => r.kind === x.kind))
        .filter(x => feasible(x.kind));
    if (!weights.length) return;
    const picked = rollFromWeights(weights);
    addRequestFromTemplate(picked.kind);
}

function updateRequestsAlertUI() {
    if (!els.questAlert || !els.questTimer) return;
    const open = getOpenRequests();
    if (!open.length) {
        els.questAlert.style.display = 'none';
        return;
    }
    const now = Date.now();
    const soonest = open.reduce((best, r) => (!best || (r.dueAt || 0) < (best.dueAt || 0)) ? r : best, null);
    const remaining = soonest ? Math.max(0, (soonest.dueAt || 0) - now) : 0;
    const remText = formatRemainingMs(remaining);
    els.questAlert.style.display = 'block';
    els.questAlert.innerHTML = `📋 아들의 요청 <b>${open.length}</b>개 · 가장 급함 <span id="quest-timer">${remText}</span>`;
    if (els.questModal && els.questModal.style.display === 'flex') renderRequestsUI();
}

if (els.questModal) {
    els.questModal.addEventListener('click', (e) => {
        if (e.target === els.questModal) closeRequestsModal();
    });
}

// ============================================================
// Core UI Update
// ============================================================
function updateUI() {
    try {
        ensureFurnitureState();
        ensureSonGrowthState();
        ensureSonBehaviorState();
        ensureNetworkState();
        ensureKitchenState();
        ensureShopState();
        ensureLibraryState();
        ensureWorkState();
        ensureBossSealState();
        ensureSupportPinState();
        ensureRequestState();
        ensureMailPhotoHistory();
        applySmithyTabUI();
        applyShopTabUI();
        applySonTabUI();
        els.gold.innerText = gameState.parent.gold;
        els.sonLevel.innerText = `(Lv. ${gameState.son.level})`;
        els.sonWeapon.innerHTML = `<img src="assets/items/${String(gameState.son.equipment.weapon.id)}.png" alt="" onerror="this.style.display='none'">${gameState.son.equipment.weapon.name} (공+${gameState.son.equipment.weapon.atk})`;
        els.sonWeapon.className = `weapon-badge tier-${gameState.son.equipment.weapon.tier}`;
        els.barHp.style.width = `${(gameState.son.hp / gameState.son.maxHp) * 100}%`;
        els.barHunger.style.width = `${(gameState.son.hunger / gameState.son.maxHunger) * 100}%`;
        els.barExp.style.width = `${(gameState.son.exp / gameState.son.maxExp) * 100}%`;
        updateKitchenSlotUI();
        updateDeskSlotUI();
        renderBookstoreUI();
        (function updateWorkUI() {
            const w = gameState.parent.work;
            const lvEl = document.getElementById('work-lv');
            const xpTextEl = document.getElementById('work-xp-text');
            const xpBarEl = document.getElementById('work-xp-bar');
            const eTextEl = document.getElementById('work-energy-text');
            const eBarEl = document.getElementById('work-energy-bar');
            const eNextEl = document.getElementById('work-energy-next');
            if (lvEl) lvEl.innerText = String(w.level);
            const need = getWorkXpToNext(w.level);
            const xp = w.xp || 0;
            const xpPct = need > 0 ? Math.max(0, Math.min(100, Math.round((xp / need) * 100))) : 0;
            if (xpTextEl) xpTextEl.innerText = `${xp}/${need}`;
            if (xpBarEl) xpBarEl.style.width = `${xpPct}%`;
            if (eTextEl) eTextEl.innerText = `${w.energy}/${w.maxEnergy}`;
            const ePct = w.maxEnergy > 0 ? Math.max(0, Math.min(100, Math.round((w.energy / w.maxEnergy) * 100))) : 0;
            if (eBarEl) eBarEl.style.width = `${ePct}%`;
            if (eNextEl) eNextEl.innerText = (w.energy >= w.maxEnergy) ? '가득' : formatMmSs(w.energyTimer || 0);

            if (els.btnWork) {
                const reward = getWorkGoldReward(w.level);
                els.btnWork.disabled = w.energy <= 0;
                els.btnWork.innerText = `🪡 바느질 하기 (+${reward}G · 에너지 -1)`;
            }
        })();

        // Son profile panel
        const cpEl = document.getElementById('son-cp');
        if (cpEl) cpEl.innerText = getSonCombatPower();
        const lv2 = document.getElementById('son-level-2');
        if (lv2) lv2.innerText = gameState.son.level;
        const hp2 = document.getElementById('son-hp-2');
        const hpMax2 = document.getElementById('son-hpmax-2');
        const hu2 = document.getElementById('son-hunger-2');
        const huMax2 = document.getElementById('son-hungermax-2');
        if (hp2) hp2.innerText = Math.floor(gameState.son.hp);
        if (hpMax2) hpMax2.innerText = gameState.son.maxHp;
        if (hu2) hu2.innerText = Math.floor(gameState.son.hunger);
        if (huMax2) huMax2.innerText = gameState.son.maxHunger;

        const atkEl = document.getElementById('son-atk-total');
        const defEl = document.getElementById('son-def-total');
        const eqAtkEl = document.getElementById('son-eq-atk');
        const eqDefEl = document.getElementById('son-eq-def');
        if (atkEl) atkEl.innerText = String(getSonAtk());
        if (defEl) defEl.innerText = String(getSonDef());
        if (eqAtkEl) eqAtkEl.innerText = String(getEquipAtkSum());
        if (eqDefEl) eqDefEl.innerText = String(getEquipDefSum());

        const injuryEl = document.getElementById('son-injury');
        const injuryDescEl = document.getElementById('son-injury-desc');
        const hospitalBtn = document.getElementById('btn-hospital');
        if (injuryEl) {
            if (!gameState.son.injury) {
                injuryEl.style.color = '#10b981';
                injuryEl.innerText = '🩹 건강';
                if (injuryDescEl) injuryDescEl.innerText = '';
                if (hospitalBtn) hospitalBtn.style.display = 'none';
            } else {
                injuryEl.style.color = '#ef4444';
                injuryEl.innerText = `🩹 부상: ${gameState.son.injury.label}`;
                if (injuryDescEl) {
                    const rem = Math.max(0, Math.floor(gameState.son.injury.remaining || 0));
                    const m = Math.floor(rem / 60);
                    const s = rem % 60;
                    const riskPct = Math.round((gameState.son.injury.riskMul || 1) * 100);
                    injuryDescEl.innerText = `남은 시간 ${m}:${String(s).padStart(2, '0')} · 전투력 ${Math.round((gameState.son.injury.cpMul || 1) * 100)}% · 부상 위험 ${riskPct}%`;
                }
                if (hospitalBtn) hospitalBtn.style.display = 'inline-flex';
            }
        }

	        const eqWeaponEl = document.getElementById('eq-weapon');
	        const eqHelmetEl = document.getElementById('eq-helmet');
	        const eqArmorEl = document.getElementById('eq-armor');
	        const eqBootsEl = document.getElementById('eq-boots');
	        const iconHtml = (id) => `<img class="eq-item-icon" src="assets/items/${String(id)}.png" alt="" onerror="this.style.display='none'">`;
	        const setEq = (el, eq, label) => {
	            if (!el || !eq) return;
	            const id = String(eq.id || '');
	            const empty = !id || id.startsWith('none_');
	            const icon = empty ? '' : iconHtml(id);
	            const name = empty ? '비어있음' : eq.name;
	            const stat = empty ? '' : ` (${label}+${label === '공' ? (eq.atk || 0) : (eq.def || 0)})`;
	            el.innerHTML = `${icon}<span>${name}${stat}</span>`;
	        };
	        setEq(eqWeaponEl, gameState.son.equipment.weapon, '공');
	        setEq(eqHelmetEl, gameState.son.equipment.helmet, '방');
	        setEq(eqArmorEl, gameState.son.equipment.armor, '방');
	        setEq(eqBootsEl, gameState.son.equipment.boots, '방');
	        updateWardrobeUI();

        const braveryFill = document.getElementById('trait-bravery');
        const diligenceFill = document.getElementById('trait-diligence');
        if (braveryFill) braveryFill.style.width = `${clampInt(gameState.son.personality.bravery, 0, 100)}%`;
        if (diligenceFill) diligenceFill.style.width = `${clampInt(gameState.son.personality.diligence, 0, 100)}%`;
        const moralityFill = document.getElementById('trait-morality');
        const flexFill = document.getElementById('trait-flexibility');
        if (moralityFill) moralityFill.style.width = `${clampInt(gameState.son.personality.morality ?? 50, 0, 100)}%`;
        if (flexFill) flexFill.style.width = `${clampInt(gameState.son.personality.flexibility ?? 50, 0, 100)}%`;
        const traitSummaryEl = document.getElementById('trait-summary');
        if (traitSummaryEl) {
            const t = getTraitSummary();
            traitSummaryEl.innerHTML = `<b>${t.short}</b><br>${t.line}`;
        }
        const traitCodeEl = document.getElementById('trait-code');
        if (traitCodeEl) {
            const code = getPersonalityCode();
            traitCodeEl.innerText = `성격 코드(4글자): ${code} (MBTI처럼 “느낌”만)`;
        }

        // Job & training stats (son panel)
        const jobEl = document.getElementById('son-job');
        const jobSubEl = document.getElementById('son-job-sub');
        if (jobEl || jobSubEl) {
            const j = getJobInfo();
            if (jobEl) jobEl.innerText = j.title;
            if (jobSubEl) jobSubEl.innerHTML = j.subHtml || '';
        }
        renderSonNetworkUI();
        const s = gameState.son.stats || {};
        const setNum = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.innerText = String(v);
        };
        setNum('stat-physatk', s.physAtk || 0);
        setNum('stat-magatk', s.magicAtk || 0);
        setNum('stat-magres', s.magicRes || 0);
        setNum('stat-agi', s.agility || 0);
        setNum('stat-acc', s.accuracy || 0);

        // Training ground type hint (home room)
        const dummyTypeEl = document.getElementById('dummy-training-type');
        if (dummyTypeEl) {
            const t = getTrainingTypeFromDummyModel();
            const label =
                t === 'strength' ? '💪 근력' :
                t === 'magic' ? '✨ 마법' :
                t === 'archery' ? '🏹 사격' :
                t === 'legend' ? '🌟 맞춤(전설)' :
                '🎲 랜덤';
            dummyTypeEl.innerText = `현재 훈련: ${label}`;
        }

        // Next goal preview (son & mail panels)
        const nextGoalEl = document.getElementById('next-goal');
        const nextGoalSubEl = document.getElementById('next-goal-sub');
        if (nextGoalEl) {
            const plan = planAdventureGoal();
            const objective = plan.objective || gameState.son.objective;
            const label = `${plan.zone.emoji} ${plan.zone.name} · ${plan.mission.emoji} ${plan.mission.name}`;
            const diffName = (difficultyData[plan.diffKey] || difficultyData.normal).name;
            const diffLabel = `${diffName} (아들 선택)`;
            const score = plan.cp / plan.zone.recCP;
            const riskHint = score >= 1.1 ? '안정적' : score >= 0.9 ? '도전적' : '무리할 수도…';
            if (nextGoalEl) nextGoalEl.innerText = label;
            const sub = `${diffLabel} · 권장CP ${plan.zone.recCP} · 내 CP ${plan.cp} · ${riskHint}`;
            if (nextGoalSubEl) nextGoalSubEl.innerText = sub;

            // Objective progress + checklist
            const progEl = document.getElementById('goal-progress');
            const checklistEl = document.getElementById('goal-checklist');
            if (progEl) {
                if (objective) {
                    const p = getObjectiveProgress(objective);
                    progEl.innerText = `${p.done ? '✅ ' : '🎯 '}목표: ${p.label}${p.sub ? ` · ${p.sub}` : ''}`;
                } else {
                    progEl.innerText = '';
                }
            }
            if (checklistEl) {
                checklistEl.innerHTML = renderObjectiveChecklistHtml(plan, objective);
            }

            // Why (plan reasons)
            const reasonEl = document.getElementById('goal-reason');
            if (reasonEl) {
                const why = describePlanReasons(plan);
                reasonEl.innerHTML = why || '';
            }

            // Support pin + suggestions
            renderSupportPinUI(plan);
            renderSupportSuggestionsUI(plan);

            // Long-term goals (condensed)
            const metaEl = document.getElementById('long-goals-meta');
            const listEl = document.getElementById('long-goals');
            if (metaEl) metaEl.innerText = getLongTermGoalsMeta();
            if (listEl) listEl.innerHTML = renderLongTermGoals(plan.zone.id);

            // Last choice feedback
            const lastChoiceEl = document.getElementById('last-choice');
            if (lastChoiceEl) {
                const lc = gameState.son.lastChoice;
                if (!lc) {
                    lastChoiceEl.innerText = '';
                } else {
                    const labelMap = { RESTING: '🧸 휴식', TRAINING: '⚔️ 훈련', STUDYING: '📚 공부', ADVENTURE: '🏃‍♂️ 모험' };
                    const ago = Number.isFinite(lc.tick) ? Math.max(0, (gameState.worldTick || 0) - lc.tick) : null;
                    const when = Number.isFinite(ago) ? `${ago}초 전` : '';
                    const why = (lc.reasons || []).slice(0, 2).join(' · ');
                    lastChoiceEl.innerText = `최근 선택: ${labelMap[lc.pick] || lc.pick}${when ? ` (${when})` : ''}${why ? ` — ${why}` : ''}`;
                }
            }

            // World codex
            renderWorldCodexUI(plan.zone.id);

        }

        // Affinity
        els.affTrust.innerText = gameState.son.affinity.trust;
        els.affAffection.innerText = gameState.son.affinity.affection;
        els.affRebellion.innerText = gameState.son.affinity.rebellion;

        // Mail badge (mailbox button)
        if (els.mailBadge) {
            const unread = Math.max(0, gameState.parent.mailUnread || 0);
            if (unread > 0) {
                els.mailBadge.style.display = 'inline-flex';
                els.mailBadge.innerText = unread > 9 ? '9+' : String(unread);
            } else {
                els.mailBadge.style.display = 'none';
                els.mailBadge.innerText = '';
            }
        }

        // Smith byproducts
        const ironScrapEl = document.getElementById('cnt-iron-scrap');
        const arcaneDustEl = document.getElementById('cnt-arcane-dust');
        if (ironScrapEl) {
            ensureLootKey('iron_scrap');
            ironScrapEl.innerText = gameState.parent.loot.iron_scrap.count || 0;
        }
        if (arcaneDustEl) {
            ensureLootKey('arcane_dust');
            arcaneDustEl.innerText = gameState.parent.loot.arcane_dust.count || 0;
        }

        // Town hub badges ("지금 할 일" 안내)
        (function updateTownBadges() {
            const setBadge = (badgeId, text, type) => {
                const el = document.getElementById(badgeId);
                if (!el) return;
                const card = el.closest('.town-card');
                if (!text) {
                    el.style.display = 'none';
                    el.innerText = '';
                    el.className = 'town-card-badge';
                    if (card) card.classList.remove('has-action');
                    return;
                }
                el.style.display = 'inline-flex';
                el.innerText = text;
                el.className = `town-card-badge ${type || ''}`.trim();
                if (card) card.classList.add('has-action');
            };

            // Life: now only "work" in town (farm/cooking moved to home)
            setBadge('badge-life', '', '');

            // Craft: count craftable actions
            let craftable = 0;
            for (const slot of (craftConfig?.slots || [])) {
                for (let tier = 1; tier <= (craftConfig?.tierCount || 0); tier++) {
                    const r = buildGearRecipe(slot, tier);
                    const inv = gameState.parent.gearInventory?.[slot] || {};
                    const hasPrev = !r.needsGear || ((inv[r.needsGear.id]?.count || 0) >= (r.needsGear.count || 1));
                    if (hasPrev && canCraftNeeds(r.needs)) craftable += 1;
                }
            }
            for (const m of (craftConfig?.milestoneWeapons || [])) {
                if (canCraftNeeds(m.needs)) craftable += 1;
            }
            const craftableHint = craftable;

            // Smithy badge: quick actions
            ensureLootKey('iron_scrap');
            ensureLootKey('arcane_dust');
            const synthPossible = (() => {
                const inv = gameState.parent.weaponInventory || {};
                const tiers = Object.keys(inv);
                let c = 0;
                for (let i = 0; i < tiers.length - 1; i++) {
                    const t = tiers[i];
                    if ((inv[t]?.count || 0) >= 3) c += 1;
                }
                return c;
            })();
            const canTemper = isSmithyUnlocked('temper') && (gameState.parent.loot.iron_scrap.count || 0) >= 8 && (gameState.parent.loot.arcane_dust.count || 0) >= 2;
            const canOrder = isSmithyUnlocked('special_order') && gameState.parent.gold >= 6000 && (gameState.parent.loot.arcane_dust.count || 0) >= 6;
            const canPremium = isSmithyUnlocked('premium_gacha') && gameState.parent.gold >= 2500;
            if (canOrder) setBadge('badge-smith', '주문', 'warn');
            else if (canTemper) setBadge('badge-smith', '정련', 'info');
            else if (craftableHint > 0) setBadge('badge-smith', `제작 ${craftableHint > 9 ? '9+' : craftableHint}`, 'info');
            else if (synthPossible > 0) setBadge('badge-smith', `합성 ${synthPossible > 9 ? '9+' : synthPossible}`, 'good');
            else if (canPremium) setBadge('badge-smith', '고급', 'info');
            else setBadge('badge-smith', '', '');

            // Shop badge: keep minimal (no forced prompts)
            setBadge('badge-shop', '', '');

            // Adventure card removed (mailbox is a separate button)
        })();

        // Smithy level
        ensureSmithy();
        const smithLvEl = document.getElementById('smith-lv');
        const smithXpTextEl = document.getElementById('smith-xp-text');
        const smithXpBarEl = document.getElementById('smith-xp-bar');
        const smithBonusEl = document.getElementById('smith-bonus-text');
        const smithBuffEl = document.getElementById('smith-buff-text');
        const unlockExchangeEl = document.getElementById('unlock-exchange-state');
        const unlockPremiumEl = document.getElementById('unlock-premium-state');
        const unlockTemperEl = document.getElementById('unlock-temper-state');
        const unlockOrderEl = document.getElementById('unlock-order-state');
        if (smithLvEl) smithLvEl.innerText = gameState.parent.smithy.level;
        const need = getSmithyXpToNext(gameState.parent.smithy.level);
        const xp = gameState.parent.smithy.xp || 0;
        const pct = need > 0 ? Math.max(0, Math.min(100, Math.round((xp / need) * 100))) : 0;
        if (smithXpTextEl) smithXpTextEl.innerText = `${xp}/${need}`;
        if (smithXpBarEl) smithXpBarEl.style.width = `${pct}%`;
        if (smithBonusEl) smithBonusEl.innerText = `고급 무기 확률 보정 +${Math.round(getSmithyQualityBonus(gameState.parent.smithy.level) * 100)}%`;
        if (smithBuffEl) {
            const buff = gameState.parent.smithy.buff;
            if (buff?.type === 'lucky' && (buff.pulls || 0) > 0) {
                smithBuffEl.innerText = `✨ 정련 효과: 다음 뽑기 ${buff.pulls}회`;
            } else {
                smithBuffEl.innerText = '';
            }
        }

        const setUnlockText = (el, id) => {
            if (!el) return;
            const def = smithyUnlocks[id];
            if (!def) return;
            const ok = isSmithyUnlocked(id);
            el.style.color = ok ? '#10b981' : '#94a3b8';
            el.innerText = ok ? '✅ 해금됨' : `Lv.${def.level} 필요`;
        };
        setUnlockText(unlockExchangeEl, 'exchange_pro');
        setUnlockText(unlockPremiumEl, 'premium_gacha');
        setUnlockText(unlockTemperEl, 'temper');
        setUnlockText(unlockOrderEl, 'special_order');

        // Pro exchange UI (hide locked buttons to reduce clutter)
        const exchangeProWrapEl = document.getElementById('exchange-pro-wrap');
        const exchangeProLockEl = document.getElementById('exchange-pro-lock');
        if (exchangeProWrapEl || exchangeProLockEl) {
            const ok = isSmithyUnlocked('exchange_pro');
            if (exchangeProWrapEl) exchangeProWrapEl.style.display = ok ? 'grid' : 'none';
            if (exchangeProLockEl) exchangeProLockEl.style.display = ok ? 'none' : 'block';
        }

        // Enable/disable smithy actions based on unlocks + busy state
        setSmithyBusy(gameState.parent.smithy.isBusy);

        // Requests alert (accumulated)
        updateRequestsAlertUI();

        // Son room indicator
        els.roomTabs.forEach(tab => {
            if (tab.getAttribute('data-room') === gameState.son.currentRoom && gameState.son.state !== 'ADVENTURING') {
                tab.classList.add('has-son');
            } else {
                tab.classList.remove('has-son');
            }
        });

	        // Son state label
	        if (els.sonStateLabel) {
	            const shortStates = {
	                'SLEEPING': '💤 수면 중...',
	                'EATING': '🍖 식사 중...',
	                'TRAINING': '⚔️ 훈련 중...',
	                'STUDYING': '📚 공부 중...',
	                'RESTING': '🧸 휴식 중...',
	                'ADVENTURING': '🏃‍♂️ 모험 중!',
	                'IDLE': '대기 중'
	            };
	            els.sonStateLabel.innerText = shortStates[gameState.son.state] || '대기 중';
	        }

        // Pixel son sprite swap (if assets exist)
        updateSonPixelSprite();

        // Furniture levels + models
        ['bed', 'desk', 'table', 'dummy'].forEach(t => {
            const el = document.getElementById(`lvl-${t}`);
            if (el) el.innerText = gameState.parent.upgrades[t];
            const modelEl = document.getElementById(`model-${t}`);
            if (modelEl) {
                const m = getFurnitureModel(t);
                modelEl.innerText = `🔁 ${m.name}`;
                modelEl.title = `${m.name} (클릭해서 교체)`;
            }
        });

        // Son sprite should not appear while adventuring (prevents UI overlap, also fixes reload state)
        if (els.sprite) {
            els.sprite.style.display = (gameState.son.state === 'ADVENTURING') ? 'none' : 'block';
        }

        // Son info: adventure status
        const advInfoEl = document.getElementById('son-adventure-info');
        const advSubEl = document.getElementById('son-adventure-sub');
        const encourageBtn = els.btnEncourage;
        if (advInfoEl && advSubEl) {
            ensureSonBehaviorState();
            const act = gameState.son.homeActionCount || 0;
            const actLine = `집 행동 ${Math.min(10, act)}/10`;
            if (gameState.son.state === 'ADVENTURING' && gameState.son.adventure) {
                const rem = Math.max(0, (gameState.son.adventure.totalTicks || 0) - (gameState.son.adventure.ticks || 0));
                const range = etaRangeFromRemaining(rem);
                const lastAgo = Math.max(0, (gameState.son.adventure.ticks || 0) - (gameState.son.adventure.lastContactTick || 0));
                advInfoEl.innerText = `🏃‍♂️ 외출 중 · 예상 귀환 ${formatMmSs(range.min)}~${formatMmSs(range.max)}`;
                advSubEl.innerText = `마지막 소식: ${formatLastContact(lastAgo)} · ${actLine}`;
            } else {
                advInfoEl.innerText = '🏠 집에 있어요';
                advSubEl.innerText = `배고프거나 피곤하면 엄마를 찾을 거예요. · ${actLine}`;
            }
        }
        if (encourageBtn) {
            const show = (gameState.son.state === 'ADVENTURING') && !gameState.son.adventureEncouraged;
            encourageBtn.style.display = show ? 'inline-flex' : 'none';
            encourageBtn.disabled = !!gameState.son.adventureEncouraged;
        }

        // Next adventure buff info
        if (els.buffInfo) {
            const b = gameState.son.nextAdventureBuff;
            if (b) {
                els.buffInfo.style.display = 'block';
                els.buffInfo.innerText = `✨ 다음 모험 버프: ${describeNextAdventureBuff(b)}`;
            } else {
                els.buffInfo.style.display = 'none';
                els.buffInfo.innerText = '';
            }
        }

	        // Refresh sub-UIs
	        if (typeof updateSynthesisUI !== 'undefined') updateSynthesisUI();
	        renderMaterialRequestUI();
	        updateUpgradeButtons(getActiveRoom());
	        updateFarmUI();
	        updateCookUI();
	        updateCraftUI();
	        renderFurnitureShop();
        updateFurnitureShopUI();
    } catch (e) {
        console.error("CRASH IN updateUI:", e);
    }
}

function moveToRoom(roomId) {
    if (gameState.son.currentRoom !== roomId) {
        gameState.son.currentRoom = roomId;
        els.roomViews[roomId].appendChild(els.sprite);
        updateUI();
    }
}

function sonSpeech(text) {
    els.speech.innerText = text;
    els.speech.style.opacity = '1';
    setTimeout(() => { els.speech.style.opacity = '0'; }, 3000);
}

els.sprite.addEventListener('click', () => {
    if (gameState.son.state !== 'ADVENTURING') sonSpeech("엄마 사랑해요!");
});

function isSonMailTitle(title) {
    const t = String(title || '');
    // Mailbox keeps only son's letters.
    return t.startsWith('📮');
}

function sanitizeMailboxLog() {
    if (!gameState.parent) gameState.parent = {};
    if (!Array.isArray(gameState.parent.mailLog)) gameState.parent.mailLog = [];
    const before = gameState.parent.mailLog.length;
    gameState.parent.mailLog = gameState.parent.mailLog
        .filter(m => m && isSonMailTitle(m.title))
        .slice(0, 10);
    if (!Number.isFinite(gameState.parent.mailUnread)) gameState.parent.mailUnread = 0;
    if (before !== gameState.parent.mailLog.length) gameState.parent.mailUnread = 0;
    gameState.parent.mailUnread = Math.max(0, Math.min(gameState.parent.mailUnread, gameState.parent.mailLog.length));
}

function addMail(title, text, isGold = false) {
    // Deprecated: mailbox now stores only son's letters.
    if (!isSonMailTitle(title)) return;
    const opts = (isGold && typeof isGold === 'object') ? isGold : null;
    const isGoldFlag = (typeof isGold === 'boolean') ? isGold : !!(opts && opts.isGold);
    const img = (opts && typeof opts.img === 'string' && opts.img.trim()) ? opts.img.trim() : null;
    if (!gameState.parent.mailLog || !Array.isArray(gameState.parent.mailLog)) gameState.parent.mailLog = [];
    gameState.parent.mailLog.unshift({
        title,
        text,
        isGold: !!isGoldFlag,
        source: 'son',
        img,
        ts: Date.now()
    });
    if (gameState.parent.mailLog.length > 10) gameState.parent.mailLog = gameState.parent.mailLog.slice(0, 10);
    const mailboxOpen = !!(els.mailboxModal && els.mailboxModal.style.display === 'flex');
    if (!mailboxOpen) {
        gameState.parent.mailUnread = Math.max(0, (gameState.parent.mailUnread || 0) + 1);
    }
    renderMailbox();
    updateUI();
}

function clearMailUnread() {
    gameState.parent.mailUnread = 0;
}

function renderMailbox() {
    if (!els.mailList) return;
    if (!gameState.parent.mailLog || !Array.isArray(gameState.parent.mailLog)) gameState.parent.mailLog = [];
    sanitizeMailboxLog();
    const log = gameState.parent.mailLog;
    if (log.length === 0) {
        els.mailList.innerHTML = `<li class="mail-item" style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">📮 아직 도착한 편지가 없습니다.</li>`;
        return;
    }
    els.mailList.innerHTML = log.map(m => {
        const color = m.isGold ? '#eab308' : '#334155';
        const title = m.img ? `${m.title} 🖼️` : m.title;
        const imgHtml = m.img ? `<div style="margin-top:8px;"><img class="mail-img" src="${m.img}" alt="첨부 이미지"></div>` : '';
        return `<li class="mail-item" style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px;">
            <strong style="color:${color}">${title}</strong><br>
            <span style="font-size:0.85rem">${m.text}</span>
            ${imgHtml}
        </li>`;
    }).join('');
}

// ============================================================
// Material request (parent asks the son to bring a specific crafting material)
// ============================================================
function getMaterialRequestOptions() {
    // Focus on crafting-related materials (not seeds). Boss trophies are excluded for now.
    const keys = [
        'herb',
        'monster_bone',
        'magic_crystal',
        'rare_hide',
        'leather',
        'steel',
        'wolf_fang',
        'relic_fragment',
        'wyvern_scale',
        'dragon_heart'
    ];
    // Ensure display names exist.
    keys.forEach(k => ensureLootKey(k));
    return keys;
}

function getFindableZonesForMaterial(key) {
    const k = String(key || '');
    if (!k) return [];
    const inCore = lootTable.some(it => it?.key === k);
    if (inCore) return ['any'];
    return zones
        .filter(z => Array.isArray(z?.drops) && z.drops.some(d => d?.key === k))
        .map(z => z.id);
}

function formatFindableZonesText(key) {
    const zs = getFindableZonesForMaterial(key);
    if (!zs.length) return '어디서 나오는지 아직 몰라요.';
    if (zs.includes('any')) return '어느 던전에서든 나올 수 있어요.';
    const names = zs.map(id => {
        const z = getZoneById(id);
        return `${z.emoji} ${z.name}`;
    });
    return `나오는 곳: ${names.join(', ')}`;
}

function canFindMaterialInZone(zone, key) {
    const k = String(key || '');
    if (!k) return false;
    const core = lootTable.find(it => it?.key === k);
    if (core) return (gameState.son.level || 1) >= (core.minLv || 1);
    return !!(zone?.drops || []).some(d => d?.key === k);
}

function tryGrantRequestedMaterialBonus(zone, mission, diffKey, outcome) {
    ensureMaterialRequestState();
    const r = gameState.parent.materialRequest;
    if (!r) return null;
    const need = clampInt(r.target || 5, 1, 30);
    if (materialHave(r.key) >= need) return null;
    if (!canFindMaterialInZone(zone, r.key)) return null;

    const a = gameState.son.affinity || {};
    const p = gameState.son.personality || {};
    const affection = clampInt(a.affection ?? 50, 0, 100);
    const trust = clampInt(a.trust ?? 50, 0, 100);
    const rebellion = clampInt(a.rebellion ?? 0, 0, 100);
    const diligence = clampInt(p.diligence ?? 50, 0, 100);

    let chance = 0.18;
    chance += (affection - 50) / 100 * 0.20;
    chance += (trust - 50) / 100 * 0.18;
    chance += (diligence - 50) / 100 * 0.12;
    chance -= (rebellion / 100) * 0.18;
    if (mission?.id === 'gather') chance += 0.12;
    if (mission?.id === 'boss') chance += 0.05;
    if (diffKey === 'safe') chance += 0.05;
    if (diffKey === 'risky') chance -= 0.03;
    if (outcome === 'fail') chance -= 0.08;
    if (outcome === 'great') chance += 0.05;
    chance = clamp01(chance);
    if (Math.random() > chance) return null;

    let amount = 1;
    if ((outcome === 'great' && Math.random() < 0.55) || (outcome === 'success' && Math.random() < 0.30)) amount += 1;
    amount = Math.max(1, Math.min(2, amount));

    ensureLootKey(r.key);
    gameState.parent.loot[r.key].count += amount;
    const text = `🧡 부탁: ${gameState.parent.loot[r.key].name} x${amount}`;
    if (materialHave(r.key) >= need) showToast("💬 부탁한 재료가 목표 수량에 도달했어요!", 'success');
    return { key: r.key, amount, text };
}

function getMaterialRequestChanceEstimate() {
    const a = gameState.son.affinity || {};
    const p = gameState.son.personality || {};
    const affection = clampInt(a.affection ?? 50, 0, 100);
    const trust = clampInt(a.trust ?? 50, 0, 100);
    const rebellion = clampInt(a.rebellion ?? 0, 0, 100);
    const diligence = clampInt(p.diligence ?? 50, 0, 100);
    let chance = 0.18;
    chance += (affection - 50) / 100 * 0.20;
    chance += (trust - 50) / 100 * 0.18;
    chance += (diligence - 50) / 100 * 0.12;
    chance -= (rebellion / 100) * 0.18;
    return clamp01(chance);
}

function getMaterialRequestStatus() {
    ensureMaterialRequestState();
    const r = gameState.parent.materialRequest;
    if (!r) return { active: false };
    const have = materialHave(r.key);
    const need = clampInt(r.target || 5, 1, 30);
    const done = have >= need;
    return { active: true, key: r.key, have, need, done };
}

function renderMaterialRequestUI() {
    if (!els.matReqUi) return;
    ensureMaterialRequestState();
    const st = getMaterialRequestStatus();
    if (!st.active) {
        els.matReqUi.innerHTML = `<div style="font-size:0.8rem; color:#64748b;">아직 부탁한 재료가 없어요. 제작에 막히는 재료를 부탁해보세요.</div>`;
        return;
    }
    ensureLootKey(st.key);
    const nm = gameState.parent.loot[st.key]?.name || st.key;
    const progress = `${st.have}/${st.need}`;
    const chance = Math.round(getMaterialRequestChanceEstimate() * 100);
    const zoneText = formatFindableZonesText(st.key);
    els.matReqUi.innerHTML = `
      <div class="support-row ${st.done ? 'done' : ''}" style="align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div class="support-title">${st.done ? '✅ ' : ''}${nm} 부탁</div>
          <div class="support-sub">진행: <b>${progress}</b> · 친밀도 보정 기대: <b>약 ${chance}%</b><br><span style="color:#64748b;">${zoneText}</span></div>
        </div>
        <div class="support-actions">
          <button class="mini-btn secondary" type="button" onclick="openMaterialRequestModal()">변경</button>
          <button class="mini-btn" type="button" onclick="clearMaterialRequest()">해제</button>
        </div>
      </div>
    `;
}

function adjustMaterialRequestTarget(delta) {
    ensureMaterialRequestState();
    gameState.parent.materialRequestTarget = clampInt((gameState.parent.materialRequestTarget || 5) + Math.floor(delta || 0), 1, 30);
    if (els.matReqModal && els.matReqModal.style.display === 'flex') renderMaterialRequestModal();
    updateUI();
}
window.adjustMaterialRequestTarget = adjustMaterialRequestTarget;

function setMaterialRequest(key) {
    ensureMaterialRequestState();
    const k = String(key || '');
    if (!k) return;
    ensureLootKey(k);
    gameState.parent.materialRequest = {
        key: k,
        target: clampInt(gameState.parent.materialRequestTarget || 5, 1, 30),
        createdTick: Math.floor(gameState.worldTick || 0)
    };
    showToast(`💬 부탁 완료: ${gameState.parent.loot[k].name} (목표 ${gameState.parent.materialRequest.target}개)`, 'info');
    renderMaterialRequestUI();
    updateUI();
}
window.setMaterialRequest = setMaterialRequest;

function clearMaterialRequest() {
    ensureMaterialRequestState();
    gameState.parent.materialRequest = null;
    showToast("💬 부탁을 해제했어요.", 'info');
    renderMaterialRequestUI();
    updateUI();
}
window.clearMaterialRequest = clearMaterialRequest;

function renderMaterialRequestModal() {
    if (!els.matReqModal || !els.matReqList || !els.matReqCurrent) return;
    ensureMaterialRequestState();
    const st = getMaterialRequestStatus();
    const tgt = clampInt(gameState.parent.materialRequestTarget || 5, 1, 30);

    const curLine = st.active
        ? (() => {
            ensureLootKey(st.key);
            const nm = gameState.parent.loot[st.key]?.name || st.key;
            const done = st.done ? '✅' : '☐';
            return `<div class="hint-card" style="margin-top:0;"><b>${done} 현재 부탁</b><div style="margin-top:6px; font-size:0.82rem; color:#0f172a; font-weight:1000;">${nm} (${st.have}/${st.need})</div><div style="margin-top:6px; font-size:0.78rem; color:#64748b;">${formatFindableZonesText(st.key)}</div></div>`;
        })()
        : `<div class="hint-card" style="margin-top:0;"><b>현재 부탁</b><div style="margin-top:6px; font-size:0.78rem; color:#64748b;">아직 부탁이 없어요.</div></div>`;

    els.matReqCurrent.innerHTML = `
      ${curLine}
      <div class="hint-card" style="margin-top:10px;">
        <b>목표 수량</b>
        <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <button class="mini-btn secondary" type="button" onclick="adjustMaterialRequestTarget(-1)">-1</button>
          <div style="font-weight:1000; color:#0f172a;">${tgt}개</div>
          <button class="mini-btn secondary" type="button" onclick="adjustMaterialRequestTarget(1)">+1</button>
        </div>
        <div style="margin-top:8px; font-size:0.78rem; color:#64748b;">목표 수량은 “지금 보유량” 기준으로 달성됩니다.</div>
      </div>
    `;

    const options = getMaterialRequestOptions();
    els.matReqList.innerHTML = options.map(k => {
        ensureLootKey(k);
        const nm = gameState.parent.loot[k].name;
        const have = materialHave(k);
        const zoneText = formatFindableZonesText(k);
        return `
          <div class="furn-row" style="align-items:flex-start;">
            <div style="min-width:0;">
              <div class="furn-row-title">${nm}</div>
              <div class="furn-row-desc">보유: <b>${have}</b> · ${zoneText}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <button class="mini-btn" type="button" onclick="setMaterialRequest('${k}')">부탁</button>
            </div>
          </div>
        `;
    }).join('');
}

function openMaterialRequestModal() {
    if (!els.matReqModal) return;
    ensureMaterialRequestState();
    els.matReqModal.style.display = 'flex';
    renderMaterialRequestModal();
}
window.openMaterialRequestModal = openMaterialRequestModal;

function closeMaterialRequestModal() {
    if (els.matReqModal) els.matReqModal.style.display = 'none';
}
window.closeMaterialRequestModal = closeMaterialRequestModal;

function openMailbox() {
    if (els.mailboxModal) els.mailboxModal.style.display = 'flex';
    clearMailUnread();
    renderMailbox();
    updateUI();
}
window.openMailbox = openMailbox;

function closeMailbox() {
    if (els.mailboxModal) els.mailboxModal.style.display = 'none';
}
window.closeMailbox = closeMailbox;

if (els.mailboxModal) {
    els.mailboxModal.addEventListener('click', (e) => {
        if (e.target === els.mailboxModal) closeMailbox();
    });
}
if (els.matReqModal) {
    els.matReqModal.addEventListener('click', (e) => {
        if (e.target === els.matReqModal) closeMaterialRequestModal();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.travelModal && els.travelModal.style.display === 'flex') closeTravelModal();
    if (els.debugModal && els.debugModal.style.display === 'flex') closeBalancePanel();
    if (els.mailboxModal && els.mailboxModal.style.display === 'flex') closeMailbox();
    if (els.matReqModal && els.matReqModal.style.display === 'flex') closeMaterialRequestModal();
    if (els.questModal && els.questModal.style.display === 'flex') closeRequestsModal();
});

// ============================================================
// Travel modal (leave / return) — pauses game time
// ============================================================
let travelModalCtx = null; // { defaultId, onResolve, resolved }

function openTravelModal(opts) {
    if (!els.travelModal) return;
    pauseGame('travel-modal');

    const title = opts?.title || '아들';
    const sub = opts?.sub || '';
    const dialogue = opts?.dialogue || '';
    const imgSrc = opts?.imgSrc || 'assets/pixel/son_idle.png';
    const summary = opts?.summary || '';
    const actions = Array.isArray(opts?.actions) ? opts.actions : [];
    const defaultId = opts?.defaultId || (actions[0]?.id ?? null);
    const onResolve = typeof opts?.onResolve === 'function' ? opts.onResolve : null;

    travelModalCtx = { defaultId, onResolve, resolved: false };

    if (els.travelTitle) els.travelTitle.innerText = title;
    if (els.travelSub) els.travelSub.innerText = sub;
    if (els.travelDialogue) els.travelDialogue.innerText = dialogue;
    if (els.travelImg) els.travelImg.src = imgSrc;

    if (els.travelSummary) {
        if (summary) {
            els.travelSummary.style.display = 'block';
            els.travelSummary.innerHTML = summary;
        } else {
            els.travelSummary.style.display = 'none';
            els.travelSummary.innerHTML = '';
        }
    }

    if (els.travelActions) {
        els.travelActions.innerHTML = actions.map(a => {
            const variant = a.variant === 'secondary' ? 'secondary' : '';
            return `<button class="action-btn ${variant}" type="button" onclick="resolveTravelModal('${a.id}')">${a.label}</button>`;
        }).join('');
    }

    els.travelModal.style.display = 'flex';
}

function resolveTravelModal(actionId, meta = {}) {
    if (!travelModalCtx || travelModalCtx.resolved) return;
    travelModalCtx.resolved = true;
    const ctx = travelModalCtx;
    travelModalCtx = null;

    if (els.travelModal) els.travelModal.style.display = 'none';
    resumeGame();

    if (ctx.onResolve) {
        try {
            ctx.onResolve(actionId, meta);
        } catch (e) {
            console.error('travel onResolve failed:', e);
        }
    }
}
window.resolveTravelModal = resolveTravelModal;

function closeTravelModal() {
    if (!travelModalCtx) {
        if (els.travelModal) els.travelModal.style.display = 'none';
        resumeGame();
        return;
    }
    resolveTravelModal(travelModalCtx.defaultId, { auto: true });
}
window.closeTravelModal = closeTravelModal;

if (els.travelModal) {
    els.travelModal.addEventListener('click', (e) => {
        if (e.target === els.travelModal) closeTravelModal();
    });
}

// ============================================================
// Balance panel (debug) — pauses game time
// ============================================================
function openBalancePanel() {
    if (!els.debugModal || !els.debugContent) return;
    pauseGame('debug-modal');
    els.debugModal.style.display = 'flex';
    renderBalancePanel();
}
window.openBalancePanel = openBalancePanel;

function closeBalancePanel() {
    if (els.debugModal) els.debugModal.style.display = 'none';
    resumeGame();
}
window.closeBalancePanel = closeBalancePanel;

function rerunBalanceSim() {
    renderBalancePanel(true);
}
window.rerunBalanceSim = rerunBalanceSim;

if (els.debugModal) {
    els.debugModal.addEventListener('click', (e) => {
        if (e.target === els.debugModal) closeBalancePanel();
    });
}

function simulateAdventureBatch(plan, runs = 20) {
    const n = Math.max(5, Math.min(200, Math.floor(runs || 20)));
    const zone = plan.zone;
    const mission = plan.mission;
    const diff = plan.diff;
    const cp = plan.cp;
    const job = getAdventureJobPerks();
    const seals = getBossSealPerks();

    const missionGoldMul = Number.isFinite(mission.goldMul) ? mission.goldMul : (Number.isFinite(mission.rewardMul) ? mission.rewardMul : 1.0);
    const missionLootMul = Number.isFinite(mission.lootMul) ? mission.lootMul : (Number.isFinite(mission.rewardMul) ? mission.rewardMul : 1.0);

    const totals = {
        gold: 0,
        exp: 0,
        outcomes: { great: 0, success: 0, partial: 0, fail: 0 },
        loot: {} // key -> count
    };

    const addLoot = (key, amount) => {
        const k = String(key || '');
        totals.loot[k] = (totals.loot[k] || 0) + Math.max(0, Math.floor(amount || 0));
    };

    const baseScore = cp / Math.max(1, zone.recCP);
    for (let i = 0; i < n; i++) {
        // Small jitter makes outcomes feel less deterministic in the report.
        const score = baseScore * (0.92 + Math.random() * 0.16);
        let outcome = 'fail';
        if (score >= 1.25) outcome = 'great';
        else if (score >= 1.0) outcome = 'success';
        else if (score >= 0.78) outcome = 'partial';
        totals.outcomes[outcome] = (totals.outcomes[outcome] || 0) + 1;

        const outcomeMul = outcome === 'great' ? 1.18 : outcome === 'success' ? 1.0 : outcome === 'partial' ? 0.65 : 0.35;

        // Gold
        const earnedGold = Math.floor((zone.baseGold + cp * 3.2 + Math.random() * 160) * diff.goldMul * missionGoldMul * outcomeMul);
        const gold = Math.floor(earnedGold * (job.goldMul || 1.0) * (seals.goldMul || 1.0));
        totals.gold += gold;

        // EXP
        const baseExp = 18 + (gameState.son.level * 5);
        let exp = Math.floor(baseExp * diff.expMul * mission.expMul * (outcome === 'great' ? 1.1 : outcome === 'partial' ? 0.75 : outcome === 'fail' ? 0.55 : 1.0));
        exp = Math.floor(exp * (job.expMul || 1.0) * (seals.expMul || 1.0));
        totals.exp += exp;

        // Loot
        const lootResults = [];
        const lootPasses = 1 + (mission.id === 'gather' ? 1 : 0) + (outcome === 'great' ? 1 : 0);
        const lootBuffMul = (job.lootMul || 1.0) * (seals.lootMul || 1.0);
        let zoneDropHits = 0;
        let nonSeedHits = 0;

        for (let pass = 0; pass < lootPasses; pass++) {
            for (const item of lootTable) {
                const passMul = pass === 0 ? 1.0 : pass === 1 ? 0.45 : 0.25;
                const prob = Math.min(95, item.prob * diff.lootMul * lootBuffMul * missionLootMul * passMul * outcomeMul);
                if (gameState.son.level >= item.minLv && Math.random() * 100 < prob) {
                    const amount = 1 + Math.floor(Math.random() * 2);
                    addLoot(item.key, amount);
                    lootResults.push({ key: item.key, amount });
                }
            }
        }

        if (zone?.drops?.length) {
            for (const drop of zone.drops) {
                const prob = Math.min(95, drop.prob * diff.lootMul * lootBuffMul * missionLootMul * outcomeMul);
                if (Math.random() * 100 < prob) {
                    const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                    addLoot(drop.key, amount);
                    zoneDropHits++;
                    if (drop.key !== 'seed') nonSeedHits++;
                }
            }
        }

        if (zone && (zoneDropHits === 0 || nonSeedHits === 0)) {
            const g = grantGuaranteedZoneDrop({ zone, mission, outcome });
            if (g) addLoot(g.key, g.amount);
        }

        if (mission?.id === 'boss' && zone) {
            const trophy = bossTrophiesByZone[zone.id];
            if (trophy) {
                let grant = 0;
                if (outcome === 'great' || outcome === 'success') grant = 1;
                else if (outcome === 'partial' && Math.random() < 0.25) grant = 1;
                if (grant > 0) addLoot(trophy.key, grant);
            }
        }
    }

    return {
        runs: n,
        avgGold: Math.round(totals.gold / n),
        avgExp: Math.round(totals.exp / n),
        outcomePct: Object.fromEntries(Object.entries(totals.outcomes).map(([k, v]) => [k, Math.round((v / n) * 100)])),
        avgLoot: Object.fromEntries(Object.entries(totals.loot).map(([k, v]) => [k, +(v / n).toFixed(2)]))
    };
}

function renderBalancePanel() {
    if (!els.debugContent) return;
    ensureBossSealState();
    ensureObjectiveState();

    const plan = planAdventureGoal();
    const objective = plan.objective || gameState.son.objective;
    const prog = objective ? getObjectiveProgress(objective) : null;
    const job = getAdventureJobPerks();
    const seals = getBossSealPerks();

    const sim = simulateAdventureBatch(plan, 25);

    const lootPairs = Object.entries(sim.avgLoot)
        .filter(([k, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const lootLines = lootPairs.length
        ? lootPairs.map(([k, v]) => {
            const nm = k === 'seed' ? '🌱 씨앗' : (gameState.parent.loot?.[k]?.name || k);
            return `${nm}: ${v}/회`;
        }).join('<br>')
        : '-';

    const nextSteps = craftConfig.slots.map(slot => getNextGearCraftStep(slot)).filter(Boolean);
    const stepHtml = nextSteps.map(s => {
        const needs = s.recipe.needs || {};
        const miss = Object.entries(needs).map(([k, v]) => {
            const have = materialHave(k);
            const lack = Math.max(0, v - have);
            const nm = gameState.parent.loot?.[k]?.name || k;
            return lack > 0 ? `<span style="color:#ef4444;">${nm} -${lack}</span>` : `<span style="color:#10b981;">${nm} OK</span>`;
        }).join(' · ');
        return `<div class="support-row"><div style="flex:1; min-width:0;"><div class="support-title">🧵 다음 ${slotName(s.slot)}: T${s.tier}</div><div class="support-sub">${miss || '-'}</div></div></div>`;
    }).join('');

    const sealShort = describeBossSealsShort();
    const perkLine = [
        seals.goldMul !== 1 ? `골드 x${seals.goldMul.toFixed(2)}` : '',
        seals.lootMul !== 1 ? `전리품 x${seals.lootMul.toFixed(2)}` : '',
        seals.expMul !== 1 ? `EXP x${seals.expMul.toFixed(2)}` : '',
        seals.riskMul !== 1 ? `부상위험 x${seals.riskMul.toFixed(2)}` : '',
        seals.fatigueAdd ? `귀환 +${Math.round(seals.fatigueAdd * 100)}%p` : ''
    ].filter(Boolean).join(' · ') || '없음';

    els.debugContent.innerHTML = `
      <div class="hint-card">
        <b>🎯 현재 목표/다음 모험</b>
        <div style="margin-top:8px; font-size:0.88rem; font-weight:1000; color:#0f172a;">
          ${plan.zone.emoji} ${plan.zone.name} · ${plan.mission.emoji} ${plan.mission.name} (${diffLabel(plan.diffKey)})
        </div>
        <div style="margin-top:6px; font-size:0.78rem; color:#64748b;">
          CP ${plan.cp} / 권장 ${plan.zone.recCP} · ${objective ? (prog?.label || '') : '목표 없음'}
        </div>
      </div>

      <div class="hint-card" style="margin-top:10px;">
        <b>🧭 직업/인장</b>
        <div style="margin-top:8px; font-size:0.82rem; color:#0f172a; font-weight:1000;">직업: ${job.name}</div>
        <div style="margin-top:6px; font-size:0.78rem; color:#64748b;">${job.desc || ''}</div>
        <div style="margin-top:10px; font-size:0.82rem; color:#0f172a; font-weight:1000;">인장: ${sealShort || '없음'}</div>
        <div style="margin-top:6px; font-size:0.78rem; color:#64748b;">효과: ${perkLine}</div>
      </div>

      <div class="hint-card" style="margin-top:10px;">
        <b>🧪 25회 시뮬레이션(대략)</b>
        <div style="margin-top:8px; font-size:0.82rem; color:#0f172a; font-weight:1000;">평균 골드: ${sim.avgGold}G · 평균 EXP: ${sim.avgExp}</div>
        <div style="margin-top:6px; font-size:0.78rem; color:#64748b;">성공 분포: 대성공 ${sim.outcomePct.great || 0}% · 성공 ${sim.outcomePct.success || 0}% · 부분 ${sim.outcomePct.partial || 0}% · 실패 ${sim.outcomePct.fail || 0}%</div>
        <div style="margin-top:10px; font-size:0.78rem; color:#475569; line-height:1.4;"><b>전리품(상위 10)</b><br>${lootLines}</div>
      </div>

      <div class="hint-card" style="margin-top:10px;">
        <b>🧵 제작 병목(다음 단계)</b>
        <div style="margin-top:8px;">${stepHtml || '-'}</div>
      </div>
    `;
}

function diffLabel(diffKey) {
    return (difficultyData[diffKey] || difficultyData.normal).name.replace('🟢 ', '').replace('🟡 ', '').replace('🔴 ', '');
}

// ============================================================
// #4 — Dynamic Adventure with Letters + Loot + Encourage
// ============================================================
let adventureInterval = null;

function ensureAdventureInterval() {
    if (adventureInterval) return;
    if (gameState.son.state !== 'ADVENTURING') return;
    if (!gameState.son.adventure) return;

    // Resume ticking after reload / refresh.
    const adv = gameState.son.adventure;
    if (els.btnEncourage) els.btnEncourage.disabled = !!gameState.son.adventureEncouraged;

    adventureInterval = setInterval(() => {
        if (isGamePaused) return;
        if (!gameState.son.adventure) return;
        gameState.son.adventure.ticks++;
        const ticks = gameState.son.adventure.ticks;
        const total = gameState.son.adventure.totalTicks;
        maybeSendAdventureMail(ticks, total);
        if (ticks >= total) {
            clearInterval(adventureInterval);
            adventureInterval = null;
            completeAdventure();
        }
    }, 1000);
}

function pickOne(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
}

function getSonTone() {
    const a = gameState.son.affinity || {};
    const p = gameState.son.personality || {};
    const affection = Number.isFinite(a.affection) ? a.affection : 50;
    const trust = Number.isFinite(a.trust) ? a.trust : 50;
    const rebellion = Number.isFinite(a.rebellion) ? a.rebellion : 0;
    const bravery = Number.isFinite(p.bravery) ? p.bravery : 50;

    if (rebellion >= 75) return 'cool';
    if (affection >= 72) return 'sweet';
    if (trust >= 72) return 'steady';
    if (bravery >= 72) return 'brave';
    return 'normal';
}

function buildDepartureDialogue(plan) {
    const tone = getSonTone();
    const zone = plan?.zone;
    const mission = plan?.mission;
    const where = zone && mission ? `${zone.name}에서 ${mission.name}` : zone ? zone.name : '밖에서';
    const lines = {
        sweet: [
            `엄마~ 다녀올게요!\n오늘은 ${where} 하고 올게요!`,
            `엄마 걱정하지 마세요!\n${where} 잠깐만 하고 금방 올게요.`
        ],
        steady: [
            `다녀오겠습니다.\n${where} 수행하고 오겠습니다.`,
            `계획대로 움직일게요.\n${where} 다녀오겠습니다.`
        ],
        cool: [
            `갔다 올게.\n${where}.`,
            `나갔다 올게요.\n${where} 좀 보고 올게요.`
        ],
        brave: [
            `엄마! 오늘은 제대로 해볼게요!\n${where} 하고 올게요!`,
            `고블린이든 뭐든…\n${where} 다녀올게요!`
        ],
        normal: [
            `다녀올게요~\n${where} 하고 올게요.`,
            `엄마, 잠깐 다녀올게요.\n${where}에요.`
        ]
    };
    return pickOne(lines[tone] || lines.normal);
}

function buildReturnDialogue(outcome, pct, ctx = {}) {
    const tone = getSonTone();
    const injured = !!ctx.injured;
    const base =
        outcome === 'great' ? '정말 잘 됐어요!' :
        outcome === 'success' ? '잘 다녀왔어요!' :
        outcome === 'partial' ? '조금 아쉬웠지만… 괜찮아요!' :
        '…미안해요. 생각보다 어려웠어요.';
    const suffix = injured ? ' 조금 다쳤지만 괜찮아요.' : '';
    const lines = {
        sweet: [
            `엄마~ 다녀왔어요!\n${base} (${pct}%)${suffix}`,
            `엄마 보고 싶었어요!\n${base} (${pct}%)${suffix}`
        ],
        steady: [
            `귀환했습니다.\n${base} (${pct}%)${suffix}`,
            `다녀왔습니다.\n${base} (${pct}%)${suffix}`
        ],
        cool: [
            `왔어.\n${base} (${pct}%)${suffix}`,
            `다녀옴.\n${base} (${pct}%)${suffix}`
        ],
        brave: [
            `엄마! 다녀왔어요!\n${base} (${pct}%)${suffix}`,
            `헤헤, 나름 해냈어요!\n${base} (${pct}%)${suffix}`
        ],
        normal: [
            `다녀왔어요~\n${base} (${pct}%)${suffix}`,
            `엄마, 다녀왔어요.\n${base} (${pct}%)${suffix}`
        ]
    };
    return pickOne(lines[tone] || lines.normal);
}

function startAdventure() {
    ensureSonBehaviorState();
    gameState.son.homeActionCount = 0;
    gameState.son.state = 'ADVENTURING';
    gameState.son.adventureEncouraged = false;

    const plan = planAdventureGoal();
    ensureObjectiveState();
    if (gameState.son.objective && gameState.son.objective.zoneId === plan.zone.id && gameState.son.objective.missionId === plan.mission.id) {
        gameState.son.objective.tries = Math.max(0, Math.floor(gameState.son.objective.tries || 0) + 1);
    }
    gameState.son.lastChoice = {
        pick: 'ADVENTURE',
        tick: gameState.worldTick || 0,
        reasons: [
            `${(difficultyData[plan.diffKey] || difficultyData.normal).name.replace('🟢 ', '').replace('🟡 ', '').replace('🔴 ', '')} 난이도`,
            `${plan.mission?.name || '목표'}`
        ]
    };

    const job = getAdventureJobPerks();
    const baseCp = plan.cp;
    const diffKey = plan.diffKey;
    const diff = plan.diff;
    const totalTicks = diff.duration[0] + Math.floor(Math.random() * (diff.duration[1] - diff.duration[0] + 1));
    const appliedBuff = gameState.son.nextAdventureBuff ? normalizeNextAdventureBuff(gameState.son.nextAdventureBuff) : null;
    if (appliedBuff) gameState.son.nextAdventureBuff = null;

    gameState.son.adventure = {
        ticks: 0,
        totalTicks,
        baseCp,
        difficulty: diffKey,
        zoneId: plan.zone.id,
        missionId: plan.mission.id,
        startedInjury: !!gameState.son.injury,
        lastContactTick: 0,
        mailSent: { a: false, b: false, c: false },
        mailCount: 0,
        eventsTriggered: { a: false, b: false, c: false },
        buff: appliedBuff,
        job,
        sendoff: null,
        photosSent: {},
        storySeen: {},
        storyRiskMul: 1.0,
        storyLootMul: 1.0,
        storyGoldMul: 1.0,
        storyInjuryApplied: false
    };
    gameState.son.plannedGoal = null;

    const applySendoffChoice = (choiceId) => {
        const sendoff = { id: choiceId, goldMul: 1.0, lootMul: 1.0, riskMul: 1.0 };
        if (choiceId === 'bye_warm') {
            gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + 2, 0, 100);
            gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + 1, 0, 100);
            gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - 1, 0, 100);
            sendoff.goldMul = 1.03;
        } else if (choiceId === 'bye_careful') {
            gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + 2, 0, 100);
            gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - 2, 0, 100);
            sendoff.riskMul = 0.92;
        } else if (choiceId === 'bye_cool') {
            gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) - 1, 0, 100);
            gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) + 2, 0, 100);
            sendoff.lootMul = 1.05;
        }
        if (gameState.son.adventure) gameState.son.adventure.sendoff = sendoff;
    };

    const beginAdventureTicks = () => {
        if (els.sprite) els.sprite.style.display = 'none';
        if (els.btnEncourage) els.btnEncourage.disabled = false;
        updateUI();

        adventureInterval = setInterval(() => {
            if (isGamePaused) return;
            if (!gameState.son.adventure) return;
            gameState.son.adventure.ticks++;
            const ticks = gameState.son.adventure.ticks;
            const total = gameState.son.adventure.totalTicks;
            maybeSendAdventureMail(ticks, total);
            if (ticks >= total) {
                clearInterval(adventureInterval);
                adventureInterval = null;
                completeAdventure();
            }
        }, 1000);
    };

    const zoneLine = `${plan.zone.emoji} ${plan.zone.name} · ${plan.mission.emoji} ${plan.mission.name}`;
    const diffLine = `${diff.name} · 전투력 ${baseCp} (권장CP ${plan.zone.recCP})`;
    openTravelModal({
        title: '🏃‍♂️ 출발',
        sub: `${zoneLine} · ${diffLine}`,
        imgSrc: 'assets/pixel/son_adventuring.png',
        dialogue: buildDepartureDialogue(plan),
        summary: appliedBuff
            ? `<b>✨ 적용 버프</b>\n${describeNextAdventureBuff(appliedBuff)}\n\n<b>🧭 직업</b>\n${job.name}${job.desc ? ` (${job.desc})` : ''}`
            : `<b>🧭 직업</b>\n${job.name}${job.desc ? ` (${job.desc})` : ''}`,
        actions: [
            { id: 'bye_warm', label: '잘 다녀와' },
            { id: 'bye_careful', label: '조심해' },
            { id: 'bye_cool', label: '응(시크하게)', variant: 'secondary' }
        ],
        defaultId: 'bye_warm',
        onResolve: (choiceId) => {
            applySendoffChoice(choiceId);
            showToast('🏃‍♂️ 아들이 모험을 떠났습니다.', 'info');
            beginAdventureTicks();
        }
    });
}

// Photo mails (warm/casual/sentimental). Images are generated from assets/reference/son_refer.png.
const sonPhotoMails = [
    {
        id: 'mail01_goblin',
        zoneId: 'forest',
        missionId: 'hunt',
        img: 'assets/mail/mail01_goblin.jpg',
        title: '📮 사진: 고블린!',
        text: '엄마! 내가 잡은 고블린 보세요! 😳\n(엄청 무섭진 않았어요… 진짜로!)'
    },
    {
        id: 'mail02_camp',
        zoneId: 'meadow',
        missionId: 'gather',
        img: 'assets/mail/mail02_camp.jpg',
        title: '📮 사진: 야영',
        text: '엄마, 오늘은 별이 예뻐요.\n따뜻한 모닥불 피워두고 잠깐 쉬고 있어요.'
    },
    {
        id: 'mail03_relic',
        zoneId: 'ruins',
        missionId: 'gather',
        img: 'assets/mail/mail03_relic.jpg',
        title: '📮 사진: 반짝이는 유물',
        text: '엄마! 땅에서 반짝이는 걸 주웠어요.\n왠지… 엄마한테 보여주고 싶었어요.'
    },
    {
        id: 'mail04_kindness',
        zoneId: 'meadow',
        missionId: 'hunt',
        img: 'assets/mail/mail04_kindness.jpg',
        title: '📮 사진: 작은 친구',
        text: '엄마, 길에서 다친 친구를 만났어요.\n조금 도와줬더니 고개를 끄덕였어요.'
    },
    {
        id: 'mail05_mountain',
        zoneId: 'mountain',
        missionId: 'hunt',
        img: 'assets/mail/mail05_mountain.jpg',
        title: '📮 사진: 바람 산맥',
        text: '여기 바람이 엄청 세요!\n그래도 하늘이 너무 예뻐서… 잠깐 멈췄어요.'
    },
    {
        id: 'mail06_guardian',
        zoneId: 'ruins',
        missionId: 'boss',
        img: 'assets/mail/mail06_guardian.jpg',
        title: '📮 사진: 수호자',
        text: '엄마… 방금 큰 녀석을 만났어요.\n그래도 괜찮아요. 난… 할 수 있어요!'
    },
    {
        id: 'mail07_soup',
        zoneId: 'forest',
        missionId: 'gather',
        img: 'assets/mail/mail07_soup.jpg',
        title: '📮 사진: 따뜻한 한 그릇',
        text: '엄마가 해준 것만큼은 아니지만…\n따뜻한 걸 먹으니까 힘이 나요.'
    },
    {
        id: 'mail08_wolf',
        zoneId: 'forest',
        missionId: 'gather',
        img: 'assets/mail/mail08_wolf.jpg',
        title: '📮 사진: 늑대 친구',
        text: '엄마! 길에서 늑대를 만났는데…\n이상하게 무섭지 않았어요. (잠깐이지만요!)'
    },
    {
        id: 'mail09_smile',
        zoneId: 'meadow',
        missionId: 'hunt',
        img: 'assets/mail/mail09_smile.jpg',
        title: '📮 사진: 엄마 생각',
        text: '엄마 생각나서 사진 보내요.\n돌아가면 꼭 안아줘요!'
    },
	    {
	        id: 'mail10_dragon',
	        zoneId: 'dragon_lair',
	        missionId: 'boss',
	        img: 'assets/mail/mail10_dragon.jpg',
	        title: '📮 사진: 멀리서 본 고룡',
	        text: '엄마… 저 멀리서 진짜 큰 걸 봤어요.\n조금 무서웠지만, 눈을 못 떼겠더라고요.'
	    },
	    {
	        id: 'mail11_mentor',
	        zoneId: 'library',
	        missionId: 'gather',
	        img: 'assets/mail/mail11_mentor.jpg',
	        title: '📮 사진: 좋은 선생님',
	        text: '엄마! 오늘은 선생님 같은 분을 만났어요.\n짧게 배웠는데… 머리가 “띵” 했어요!'
	    },
	    {
	        id: 'mail12_friend',
	        zoneId: 'creek',
	        missionId: 'gather',
	        img: 'assets/mail/mail12_friend.jpg',
	        title: '📮 사진: 새 친구',
	        text: '엄마, 오늘 친구가 생겼어요.\n같이 웃다 보니까… 덜 무서웠어요.'
	    },
	    {
	        id: 'mail13_bandage',
	        zoneId: 'den',
	        missionId: 'hunt',
	        img: 'assets/mail/mail13_bandage.jpg',
	        title: '📮 사진: 괜찮아요',
	        text: '엄마… 살짝 긁혔는데 괜찮아요!\n조심해서 쉬고 다시 움직일게요.'
	    },
	    {
	        id: 'mail14_flower',
	        zoneId: 'meadow',
	        missionId: 'gather',
	        img: 'assets/mail/mail14_flower.jpg',
	        title: '📮 사진: 예쁜 꽃',
	        text: '엄마! 길에서 꽃이 너무 예뻐서요.\n집에 가져가면… 엄마가 좋아할 것 같았어요.'
	    },
	    {
	        id: 'mail15_map',
	        zoneId: 'ruins',
	        missionId: 'gather',
	        img: 'assets/mail/mail15_map.jpg',
	        title: '📮 사진: 지도',
	        text: '엄마, 길을 표시해뒀어요.\n다음에 오면… 더 잘 찾을 수 있을 것 같아요!'
	    },
	    {
	        id: 'mail16_library',
	        zoneId: 'library',
	        missionId: 'boss',
	        img: 'assets/mail/mail16_library.jpg',
	        title: '📮 사진: 오래된 도서관',
	        text: '엄마… 여기 책들이 조용히 숨 쉬는 것 같아요.\n괜히 목소리도 작아져요.'
	    },
	    {
	        id: 'mail17_ore',
	        zoneId: 'forge',
	        missionId: 'gather',
	        img: 'assets/mail/mail17_ore.jpg',
	        title: '📮 사진: 반짝이는 조각',
	        text: '엄마! 반짝이는 걸 찾았어요.\n이걸로… 뭐 만들 수 있을까요?'
	    },
	    {
	        id: 'mail18_rain',
	        zoneId: 'pass',
	        missionId: 'gather',
	        img: 'assets/mail/mail18_rain.jpg',
	        title: '📮 사진: 비 오는 길',
	        text: '엄마, 비가 와요.\n근데… 비 냄새가 좋아서 조금 마음이 편해졌어요.'
	    },
	    {
	        id: 'mail19_training',
	        zoneId: 'cliff',
	        missionId: 'hunt',
	        img: 'assets/mail/mail19_training.jpg',
	        title: '📮 사진: 연습 중!',
	        text: '엄마! 잠깐 연습했어요.\n나중에… 더 멋지게 보여줄게요!'
	    },
	    {
	        id: 'mail20_nest',
	        zoneId: 'aerie',
	        missionId: 'gather',
	        img: 'assets/mail/mail20_nest.jpg',
	        title: '📮 사진: 하늘의 둥지',
	        text: '엄마… 여기 둥지가 있었어요.\n가까이 가진 않았어요. 그냥… 조용히 보고 왔어요.'
	    }
	];

function pickName(list) {
    if (!Array.isArray(list) || list.length === 0) return '누군가';
    return list[Math.floor(Math.random() * list.length)];
}

function getPathLabel(path) {
    if (path === 'strength') return '근력';
    if (path === 'magic') return '마법';
    if (path === 'archery') return '사격';
    return '모험';
}

function addBuddyIfNone(buddy) {
    ensureNetworkState();
    const n = gameState.son.network;
    if (n.buddy) return false;
    if (!buddy || typeof buddy !== 'object' || !buddy.id || !buddy.name) return false;
    n.buddy = {
        id: String(buddy.id),
        name: String(buddy.name),
        desc: String(buddy.desc || ''),
        cpBonus: Math.max(0, Math.floor(buddy.cpBonus || 0)),
        adventuresLeft: Math.max(1, Math.floor(buddy.adventuresLeft || 1))
    };
    return true;
}

function consumeBuddyAfterAdventure() {
    ensureNetworkState();
    const n = gameState.son.network;
    if (!n.buddy) return null;
    const name = n.buddy.name || '동료';
    n.buddy.adventuresLeft = Math.max(0, Math.floor((n.buddy.adventuresLeft || 0) - 1));
    if (n.buddy.adventuresLeft <= 0) {
        n.buddy = null;
        showToast(`🧑‍🤝‍🧑 ${name}와의 동행이 끝났습니다.`, 'info');
        addMail(`📮 소식: ${name}와 헤어졌어요`, `엄마… ${name}랑은 여기까지 같이 하기로 했어요.<br>그래도… 다음에 또 만날 수 있겠죠?`);
        return { left: true, name };
    }
    return { left: false, name, remaining: n.buddy.adventuresLeft };
}

function maybeBuildAdventureStoryLetter(adv, ctx) {
    // Returns { title, textHtml, effects: [] } or null.
    if (!adv || typeof adv !== 'object') return null;
    ensureNetworkState();
    ensureSonGrowthState();

    if (!adv.storySeen || typeof adv.storySeen !== 'object') adv.storySeen = {};
    if (!Number.isFinite(adv.storyRiskMul)) adv.storyRiskMul = 1.0;
    if (!Number.isFinite(adv.storyLootMul)) adv.storyLootMul = 1.0;
    if (!Number.isFinite(adv.storyGoldMul)) adv.storyGoldMul = 1.0;
    if (typeof adv.storyInjuryApplied !== 'boolean') adv.storyInjuryApplied = false;
    const seen = adv.storySeen;
    const zone = ctx?.zone;
    const mission = ctx?.mission;
    const diffKey = ctx?.diffKey || 'normal';

    const p = gameState.son.personality || {};
    const a = gameState.son.affinity || {};
    const { topKey, margin } = getTrainingMasteryTop();
    const stage = getJobStage();
    const calm = clampInt(p.calmness ?? 50, 0, 100);
    const brave = clampInt(p.bravery ?? 50, 0, 100);
    const moral = clampInt(p.morality ?? 50, 0, 100);
    const flex = clampInt(p.flexibility ?? 50, 0, 100);
    const trust = clampInt(a.trust ?? 50, 0, 100);
    const affection = clampInt(a.affection ?? 50, 0, 100);

    const mentorIdOf = (path) => `mentor_${path}`;
    const hasMentor = (path) => (gameState.son.network?.contacts || []).some(c => c && c.id === mentorIdOf(path));

    const weights = [
        { id: 'mentor', w: 18 + (stage >= 1 ? 6 : 0) + (mission?.id === 'boss' ? 4 : 0) - (hasMentor(topKey) ? 10 : 0) },
        { id: 'friend', w: 16 + Math.floor((affection - 50) / 10) + Math.floor((flex - 50) / 10) },
        { id: 'kindness', w: 14 + Math.floor((moral - 50) / 10) + (mission?.id === 'gather' ? 2 : 0) },
        { id: 'treasure', w: 12 + (zone?.id === 'ruins' ? 6 : 0) + (mission?.id === 'boss' ? 2 : 0) },
        { id: 'rumor', w: 12 + (mission?.id === 'boss' ? 5 : 0) + (zone?.id === 'mountain' ? 2 : 0) },
        { id: 'homesick', w: 11 + Math.floor((affection - 50) / 10) + (diffKey === 'risky' ? 1 : 0) },
        { id: 'injury', w: 10 + (diffKey === 'risky' ? 8 : 0) + Math.floor((brave - 50) / 10) + Math.floor((50 - calm) / 10) - (adv.startedInjury ? 8 : 0) },
        { id: 'flower', w: 12 + Math.floor((moral - 50) / 10) + (zone?.id === 'meadow' ? 6 : 0) },
        { id: 'life', w: 14 + Math.floor((calm - 50) / 10) + (diffKey === 'risky' ? 2 : 0) },
        { id: 'career', w: 14 + (margin >= 3 ? 5 : 0) + (stage >= 1 ? 2 : 0) },
        { id: 'near_miss', w: 10 + (diffKey === 'risky' ? 6 : 0) + (brave >= 60 ? 2 : 0) }
    ].map(x => ({ ...x, w: Math.max(0, x.w) }))
        .filter(x => x.w > 0 && !seen[x.id]);

    if (!weights.length) return null;
    // Story should feel common, but not always.
    const baseStoryChance = 0.72;
    if (Math.random() > baseStoryChance) return null;

    const picked = rollFromWeights(weights);
    const storyId = picked?.id;
    if (!storyId) return null;
    seen[storyId] = true;

    const effects = [];
    const line = (s) => String(s || '').replace(/\n/g, '<br>');

    if (storyId === 'mentor') {
        const path = (topKey === 'strength' || topKey === 'magic' || topKey === 'archery') ? topKey : (Math.random() < 0.34 ? 'strength' : Math.random() < 0.67 ? 'magic' : 'archery');
        const mentorNames = {
            strength: ['검술 선생님 하르트', '방패술의 이렌', '노장 전사 브루노'],
            magic: ['마도사 세라', '정령술사 리브', '수도승 아드리안'],
            archery: ['명사수 라일', '사냥꾼 미아', '숲지기 로웰']
        };
        const mentorName = pickName(mentorNames[path] || mentorNames.magic);
        const mid = mentorIdOf(path);
        const existed = hasMentor(path);
        upsertNetworkContact({
            id: mid,
            kind: 'mentor',
            name: mentorName,
            desc: existed ? `가끔 조언을 해주는 선생님이에요.` : `모험 중 만난 ${getPathLabel(path)} 선생님이에요.`,
            tags: [path, 'mentor']
        });
        const tm = gameState.son.trainingMastery;
        const inc = existed ? 2 : 4;
        tm[path] = clampInt((tm[path] || 0) + inc, 0, 999);
        if (path === 'magic') {
            gameState.son.stats.magicAtk = clampInt((gameState.son.stats.magicAtk || 0) + (existed ? 0 : 1), 0, 999);
            p.intelligence = clampInt((p.intelligence ?? 50) + 2, 0, 100);
            p.calmness = clampInt((p.calmness ?? 50) + 1, 0, 100);
        } else if (path === 'strength') {
            gameState.son.stats.physAtk = clampInt((gameState.son.stats.physAtk || 0) + (existed ? 0 : 1), 0, 999);
            p.endurance = clampInt((p.endurance ?? 50) + 2, 0, 100);
            p.diligence = clampInt((p.diligence ?? 50) + 1, 0, 100);
        } else {
            gameState.son.stats.accuracy = clampInt((gameState.son.stats.accuracy || 0) + (existed ? 0 : 1), 0, 999);
            p.focus = clampInt((p.focus ?? 50) + 2, 0, 100);
            p.diligence = clampInt((p.diligence ?? 50) + 1, 0, 100);
        }
        adv.storyRiskMul *= 0.96;
        effects.push(`${getPathLabel(path)} 숙련 +${inc}`);
        if (!existed) effects.push('인맥 +1(선생님)');
        effects.push('부상위험 ↓');
        const title = `📮 사건: 좋은 선생님을 만났어요`;
        const text = `${mentorName}을(를) 만났어요.<br>“작은 팁 하나가, 큰 차이를 만든단다.”<br><br>엄마… 저도 조금은… 더 잘할 수 있을 것 같아요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'friend') {
        const friendNames = ['여행자 노아', '견습 모험가 레나', '상인집 아이 모리', '숲의 길잡이 소라', '도서관 소년 루카'];
        const fname = pickName(friendNames);
        const fid = `friend_${fname.replace(/\s+/g, '_')}`;
        upsertNetworkContact({
            id: fid,
            kind: 'friend',
            name: fname,
            desc: `모험 중에 친해진 친구예요.`,
            tags: ['friend']
        });
        p.flexibility = clampInt((p.flexibility ?? 50) + 1, 0, 100);
        a.trust = clampInt((a.trust ?? 50) + 1, 0, 100);
        a.affection = clampInt((a.affection ?? 50) + 1, 0, 100);
        effects.push('인맥 +1(친구)');

        // Sometimes: the friend joins for a few adventures.
        const cpBonus = 12 + Math.floor((trust + affection) / 20) * 2; // ~12~24
        const joined = (Math.random() < 0.55) && addBuddyIfNone({
            id: `buddy_${fid}`,
            name: fname,
            desc: '며칠만 같이 다니기로 했어요.',
            cpBonus,
            adventuresLeft: 3
        });
        if (joined) effects.push(`동료 합류(CP +${cpBonus})`);
        adv.storyLootMul *= 1.06;
        adv.storyRiskMul *= 0.96;
        effects.push('전리품 ↑');

        const title = `📮 사건: 친구가 생겼어요`;
        const text = `엄마, 오늘은 ${fname}을(를) 만났어요.<br>같이 길을 걷다 보니까… 이상하게 마음이 놓였어요.<br><br>다음에는… 더 무서운 곳도 같이 가볼 수 있을 것 같아요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'kindness') {
        const npcs = [
            { id: 'npc_healer', name: '약초꾼 할머니', desc: '길에서 만난 약초꾼이에요. 상처를 살짝 봐주셨어요.' },
            { id: 'npc_guard', name: '성문 경비 로엔', desc: '낯선 곳에서도 따뜻하게 말을 건네준 사람이에요.' },
            { id: 'npc_merchant', name: '떠돌이 상인 에리', desc: '필요한 것과 불필요한 것을 구분하는 법을 알려준 사람이에요.' }
        ];
        const npc = npcs[Math.floor(Math.random() * npcs.length)];
        upsertNetworkContact({ id: npc.id, kind: 'friend', name: npc.name, desc: npc.desc, tags: ['kindness'] });
        p.morality = clampInt((p.morality ?? 50) + 2, 0, 100);
        p.flexibility = clampInt((p.flexibility ?? 50) + 1, 0, 100);
        a.trust = clampInt((a.trust ?? 50) + 1, 0, 100);
        effects.push('선함 +2');
        effects.push('인맥 +1');

        // A tiny “thank you” material (helps crafting feel alive).
        const group = getZoneStageGroup(zone?.id);
        const giftPool = group === 'forest'
            ? ['wolf_fang', 'monster_bone', 'leather']
            : group === 'ruins'
                ? ['relic_fragment', 'magic_crystal', 'steel']
                : group === 'mountain'
                    ? ['wyvern_scale', 'steel', 'rare_hide']
                    : group === 'dragon'
                        ? ['magic_crystal', 'steel', 'wyvern_scale']
                        : ['herb', 'leather', 'monster_bone'];
        const giftKey = giftPool[Math.floor(Math.random() * giftPool.length)];
        ensureLootKey(giftKey);
        gameState.parent.loot[giftKey].count += 1;
        effects.push(`${gameState.parent.loot[giftKey].name} x1`);
        adv.storyGoldMul *= 1.02;

        const title = `📮 사건: 작은 친절을 배웠어요`;
        const text = `엄마… 오늘은 길에서 누군가를 조금 도와줬어요.<br>${npc.name}이(가) “너도 많이 컸구나”라고 말해줬어요.<br><br>이상하게… 마음이 따뜻해져서, 발걸음이 가벼웠어요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'treasure') {
        const lines = [
            '낡은 상자를 발견했어요. 열어보는 데 손이 떨렸어요.',
            '바닥에 반짝이는 게 보여서… 조심히 주웠어요.',
            '벽 틈에서 작은 빛이 새어 나왔어요. 이상했지만… 멈출 수가 없었어요.'
        ];
        const pickedLine = pickName(lines);
        const group = getZoneStageGroup(zone?.id);
        const pool = group === 'ruins'
            ? ['relic_fragment', 'magic_crystal', 'steel']
            : group === 'mountain'
                ? ['wyvern_scale', 'steel', 'rare_hide']
                : group === 'dragon'
                    ? ['magic_crystal', 'steel', 'wyvern_scale']
                    : group === 'forest'
                        ? ['wolf_fang', 'monster_bone', 'leather']
                        : ['herb', 'leather', 'monster_bone'];
        const key = pool[Math.floor(Math.random() * pool.length)];
        ensureLootKey(key);
        gameState.parent.loot[key].count += 1;
        adv.storyLootMul *= 1.10;
        p.bravery = clampInt((p.bravery ?? 50) + 1, 0, 100);
        effects.push(`${gameState.parent.loot[key].name} x1`);
        effects.push('전리품 ↑');
        const title = `📮 발견: 반짝이는 걸 찾았어요`;
        const text = `엄마! ${pickedLine}<br><br>무서웠지만… 손을 뻗었어요. 그리고, 진짜로 찾았어요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'rumor') {
        ensureWorldCodexState();
        const entry = zone?.id ? gameState.parent.worldCodex.zones[zone.id] : null;
        const gain = 4 + (mission?.id === 'boss' ? 3 : 0);
        if (entry) {
            entry.intel = Math.max(0, Math.min(100, Math.floor((entry.intel || 0) + gain)));
        }
        adv.storyRiskMul *= 0.96;
        effects.push(`도감 탐험도 +${gain}%`);
        effects.push('부상위험 ↓');
        const storyteller = pickName(['낯선 노인', '여행자', '수도원의 수련생', '광산의 노동자']);
        upsertNetworkContact({
            id: `inspiration_${zone?.id || 'unknown'}`,
            kind: 'inspiration',
            name: `${storyteller}의 이야기`,
            desc: '던전의 소문을 전해준 인연이에요.',
            tags: ['rumor']
        });
        const boss = zone?.id ? zoneBosses[zone.id] : null;
        const bossHint = boss ? `${boss.emoji} ${boss.name}` : '보스';
        const title = `📮 소문: ${zone?.name || '던전'} 이야기`;
        const text = `엄마, 쉬는 곳에서 ${storyteller}을(를) 만났어요.<br>${bossHint}에 대한 얘기를 들었어요.<br><br>“겁내지 말고, 먼저 주변을 잘 살펴.”<br>…나도 그렇게 해볼게요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'homesick') {
        const lines = [
            '엄마… 이상하게 오늘은 더 보고 싶었어요.',
            '엄마가 해준 말이 자꾸 생각났어요. 그래서 버틸 수 있었어요.',
            '엄마, 돌아가면… 꼭 같이 밥 먹어요.'
        ];
        const pickedLine = pickName(lines);
        a.affection = clampInt((a.affection ?? 50) + 2, 0, 100);
        p.calmness = clampInt((p.calmness ?? 50) + 1, 0, 100);
        effects.push('애정 +2');
        const title = `📮 안부: 엄마 생각`;
        const text = `${pickedLine}<br><br>모험은 멋지지만… 집이 더 멋진 것 같아요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'injury') {
        // Apply a light injury mid-adventure: it changes CP and makes “care at home” meaningful.
        const risky = diffKey === 'risky';
        const sev = (risky && Math.random() < 0.20) ? '중상' : '경미';
        applyInjury(sev);
        adv.storyInjuryApplied = true;
        adv.storyRiskMul *= 0.92; // becomes more careful
        adv.storyLootMul *= 0.95; // less capacity to loot
        p.bravery = clampInt((p.bravery ?? 50) - 1, 0, 100);
        p.diligence = clampInt((p.diligence ?? 50) + 1, 0, 100);
        effects.push(`부상: ${sev}`);
        effects.push('성실 +1');
        const lines = [
            '엄마… 조금 다쳤어요. 크게는 아니에요.',
            '엄마… 넘어졌는데, 괜찮아요. (진짜로!)',
            '엄마, 오늘은 무리하면 안 될 것 같아요…'
        ];
        const pickedLine = pickName(lines);
        const title = `📮 사건: 다쳤어요`;
        const text = `${pickedLine}<br><br>조금 쉬었다가… 다시 움직일게요. 걱정하지 마세요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'flower') {
        ensureLootKey('pretty_flower');
        gameState.parent.loot.pretty_flower.count += 1;
        a.affection = clampInt((a.affection ?? 50) + 2, 0, 100);
        p.morality = clampInt((p.morality ?? 50) + 1, 0, 100);
        p.calmness = clampInt((p.calmness ?? 50) + 1, 0, 100);
        effects.push('🌸 예쁜 꽃 x1');
        const title = `📮 선물: 예쁜 꽃을 찾았어요`;
        const text = `엄마… 예쁜 꽃을 발견했어요.<br>돌아가면… 엄마한테 꼭 드릴래요.<br><br>(오늘은 마음이 조금 따뜻해졌어요.)`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'life') {
        const lines = [
            '엄마, 오늘은… “어른이 되는 게 뭘까” 생각했어요.',
            '엄마… 모험은 멋지지만 가끔은 외로워요.',
            '엄마, 내가 잘하고 있는 걸까요?',
            '엄마, 사람들을 지키는 게… 생각보다 어렵네요.'
        ];
        const pickedLine = pickName(lines);
        p.calmness = clampInt((p.calmness ?? 50) + 1, 0, 100);
        p.diligence = clampInt((p.diligence ?? 50) + 1, 0, 100);
        a.trust = clampInt((a.trust ?? 50) + 1, 0, 100);
        effects.push('차분 +1');
        const title = `📮 고민: 인생에 대해 생각했어요`;
        const text = `${pickedLine}<br><br>그래도… 엄마가 믿어준다고 생각하면, 다시 한 걸음 나아갈 수 있어요.`;
        return { title, textHtml: line(text), effects };
    }

    if (storyId === 'career') {
        const roleToAsp = (k) => (k === 'strength' ? 'strength' : k === 'magic' ? 'magic' : 'archery');
        const asp = roleToAsp(topKey);
        gameState.son.network.aspiration = asp;
        const tm = gameState.son.trainingMastery;
        tm[asp] = clampInt((tm[asp] || 0) + 2, 0, 999);
        if (asp === 'archery') p.focus = clampInt((p.focus ?? 50) + 1, 0, 100);
        if (asp === 'magic') p.intelligence = clampInt((p.intelligence ?? 50) + 1, 0, 100);
        if (asp === 'strength') p.endurance = clampInt((p.endurance ?? 50) + 1, 0, 100);
        effects.push(`꿈: ${getPathLabel(asp)}`);
        const title = `📮 깨달음: 진로가 떠올랐어요`;
        const text = `엄마… 오늘 ${getPathLabel(asp)}를 정말 멋지게 하는 사람을 봤어요.<br>저도… 그런 사람이 되고 싶어졌어요!<br><br>조금씩, 그 길로 가볼게요.`;
        return { title, textHtml: line(text), effects };
    }

    // near_miss
    {
        const lines = [
            '엄마… 방금 큰 소리가 나서 심장이 철렁했어요.',
            '엄마! 거의 넘어질 뻔했는데, 침착하게 피했어요.',
            '엄마… 오늘은 무리하면 안 되겠다고 느꼈어요.',
            '엄마, 긴장했지만… 끝까지 버텼어요.'
        ];
        const pickedLine = pickName(lines);
        p.diligence = clampInt((p.diligence ?? 50) + 1, 0, 100);
        p.bravery = clampInt((p.bravery ?? 50) - 1, 0, 100);
        effects.push('성실 +1');
        const title = `📮 사건: 아찔한 순간이 있었어요`;
        const text = `${pickedLine}<br><br>그래도 괜찮아요. 엄마가 해준 말… 떠올리면서 버텼어요.`;
        return { title, textHtml: line(text), effects };
    }
}

function pickPhotoMailForAdventure(adv) {
    const zoneId = adv?.zoneId;
    const missionId = adv?.missionId;
    ensureMailPhotoHistory();
    const sent = adv?.photosSent || {};
    const recent = new Set((gameState.parent.mailPhotoHistory || []).slice(0, 5));

    const weights = sonPhotoMails.map(m => {
        let w = 1;
        const zMatch = !!(m.zoneId && zoneId && m.zoneId === zoneId);
        const mMatch = !!(m.missionId && missionId && m.missionId === missionId);
        if (zMatch) w *= 3.2;
        if (mMatch) w *= 2.0;
        if (zMatch && mMatch) w *= 1.4;
        if (sent[m.id]) w *= 0.01;
        if (recent.has(m.id)) w *= 0.25;
        return { mail: m, w };
    }).filter(x => x.w > 0);

    const picked = rollFromWeights(weights);
    return picked?.mail || sonPhotoMails[0];
}

function maybeSendAdventureMail(ticks, totalTicks) {
    if (gameState.son.state !== 'ADVENTURING') return;
    if (!gameState.son.adventure) return;
    const adv = gameState.son.adventure;
    if (adv.mailCount >= 2) return;
    if (!adv.mailSent || typeof adv.mailSent !== 'object') adv.mailSent = { a: false, b: false, c: false };
    if (!Number.isFinite(adv.mailCount)) adv.mailCount = 0;
    if (!adv.photosSent || typeof adv.photosSent !== 'object') adv.photosSent = {};

    const marks = [
        { key: 'a', at: Math.floor(totalTicks * 0.22) },
        { key: 'b', at: Math.floor(totalTicks * 0.5) },
        { key: 'c', at: Math.floor(totalTicks * 0.76) }
    ];
    // Use >= to avoid missing a mark after refresh/resume.
    const mark = marks.find(m => ticks >= m.at && !adv.mailSent[m.key]);
    if (!mark) return;
    adv.mailSent[mark.key] = true;

    const trust = gameState.son.affinity.trust;
    const affection = gameState.son.affinity.affection;
    const diligence = gameState.son.personality.diligence;
    const bravery = gameState.son.personality.bravery;
    const diffKey = adv.difficulty || 'normal';

    // 성실/애정/신뢰가 높을수록 소식이 자주 옴. 대담할수록 “안 보내도 괜찮지” 성향.
    let chance = 0.42;
    chance += (diligence - 50) / 100 * 0.25;
    chance += (affection - 50) / 100 * 0.18;
    chance += (trust - 50) / 100 * 0.12;
    chance -= (bravery - 50) / 100 * 0.10;
    if (diffKey === 'safe') chance += 0.08;
    if (diffKey === 'risky') chance -= 0.04;
    chance = clamp01(chance);
    // If the son didn't send any message until the last mark, force at least one letter.
    if (mark.key === 'c' && adv.mailCount <= 0) chance = 1.0;
    if (Math.random() > chance) return;

    const zone = getZoneById(adv.zoneId);
    const mission = getMissionById(adv.missionId);
    // Attach a photo more often, and guarantee at least one photo on the first letter.
    const photoSentCount = Object.keys(adv.photosSent || {}).length;
    const forcePhoto = (adv.mailCount === 0 && photoSentCount === 0) || (mark.key === 'c' && photoSentCount === 0);
    const attachPhoto = forcePhoto || (Math.random() < 0.45);

    const titles = [
        `📮 안부: ${zone.emoji} ${zone.name}`,
        `📮 소식: ${mission.emoji} ${mission.name}`,
        `📮 짧은 편지`,
        `📮 안부 편지`,
        `📮 오늘의 하늘`,
        `📮 작은 승리`,
        `📮 메모`,
        `📮 엄마에게`
    ];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const templates = [
        `엄마~ 저 무사하니 걱정하지 마세요! 지금 ${zone.name}에 있어요.`,
        `엄마! 오늘은 힘이 넘쳐요. ${mission.name} 계속 해볼게요!`,
        `엄마 보고 싶지만… 전 괜찮아요! 조금만 더 하고 갈게요.`,
        `엄마! 방금 몬스터를 몇 마리나 잡았는지 맞춰봐요? 헤헤.`,
        `엄마… 길이 좀 무서운데 그래도 해볼게요. 응원해줘요.`,
        `엄마, 오늘은 하늘이 예뻐요. ${zone.name}에서 잠깐 멈췄어요.`,
        `엄마! 나 진짜 조금씩 강해지는 것 같아요. 돌아가면 보여줄게요!`,
        `엄마, 잠깐 쉬는 중이에요. 물 마시고 다시 움직일게요.`,
        `엄마… 방금 지나가던 사람들이 “멋지다” 했어요. (진짜예요!)`,
        `엄마! 오늘은 발자국이 많아요. 뭔가… 큰 게 있는 것 같아요.`,
        `엄마, 냄새가 좋아서… 괜히 웃었어요. 집 생각나서요.`,
        `엄마! 제 배낭이 좀 무거워졌어요. 뭔가 챙겨갈 수 있을 것 같아요.`,
        `엄마… 조금 긴장되지만, 해낼게요. 엄마가 믿어주니까요.`,
        `엄마! ${mission.name} 하다 보니까… 생각보다 재미있어요.`
    ];

    const story = maybeBuildAdventureStoryLetter(adv, { zone, mission, diffKey });

    if (story) {
        let img = null;
        if (attachPhoto) {
            const p = pickPhotoMailForAdventure(adv);
            if (p && p.img) {
                adv.photosSent[p.id] = true;
                ensureMailPhotoHistory();
                gameState.parent.mailPhotoHistory.unshift(p.id);
                gameState.parent.mailPhotoHistory = gameState.parent.mailPhotoHistory.slice(0, 12);
                img = p.img;
            }
        }
        const effLine = (story.effects && story.effects.length)
            ? `<br><br><span style="color:#64748b; font-size:0.78rem;">성장: ${story.effects.join(' · ')}</span>`
            : '';
        addMail(story.title, `${story.textHtml}${effLine}`, img ? { img } : false);
    } else if (attachPhoto) {
        const p = pickPhotoMailForAdventure(adv);
        if (p && p.img) {
            adv.photosSent[p.id] = true;
            ensureMailPhotoHistory();
            gameState.parent.mailPhotoHistory.unshift(p.id);
            gameState.parent.mailPhotoHistory = gameState.parent.mailPhotoHistory.slice(0, 12);
            addMail(p.title, String(p.text || '').replace(/\n/g, '<br>'), { img: p.img });
        } else {
            const msg = templates[Math.floor(Math.random() * templates.length)];
            addMail(title, msg);
        }
    } else {
        const msg = templates[Math.floor(Math.random() * templates.length)];
        addMail(title, msg);
    }
    adv.lastContactTick = ticks;
    adv.mailCount++;
    showToast("📮 아들의 소식이 도착했습니다!", 'info');
}

function encourageSon() {
    if (gameState.son.adventureEncouraged) return;
    gameState.son.adventureEncouraged = true;
    if (els.btnEncourage) els.btnEncourage.disabled = true;
    showToast("💌 응원을 보냈습니다! (이번 모험 +20%)", 'info');
    gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 3);
    gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 2);
    updateUI();
}
window.encourageSon = encourageSon;

function completeAdventure() {
    const cp = getSonCombatPower();
    const adv = gameState.son.adventure || {};
    const diffKey = gameState.son.adventure?.difficulty || 'normal';
    const diff = difficultyData[diffKey] || difficultyData.normal;
    const zone = getZoneById(gameState.son.adventure?.zoneId);
    const mission = getMissionById(gameState.son.adventure?.missionId);
    const def = getSonDef();
    const legacyBuff = (!gameState.son.adventure?.buff && !!gameState.son.nextAdventureBuff) ? normalizeNextAdventureBuff(gameState.son.nextAdventureBuff) : null;
    const appliedBuff = normalizeNextAdventureBuff(gameState.son.adventure?.buff || legacyBuff);
    const job = gameState.son.adventure?.job || getAdventureJobPerks();
    const sendoff = gameState.son.adventure?.sendoff || null;
    const seals = getBossSealPerks();

    const injuryRiskMul = gameState.son.injury?.riskMul ?? 1.0;
    const effectiveCp = cp;
    const score = effectiveCp / Math.max(1, zone.recCP);

    let outcome = 'fail'; // great | success | partial | fail
    if (score >= 1.25) outcome = 'great';
    else if (score >= 1.0) outcome = 'success';
    else if (score >= 0.78) outcome = 'partial';

    const outcomeMul = outcome === 'great' ? 1.18 : outcome === 'success' ? 1.0 : outcome === 'partial' ? 0.65 : 0.35;

    const rebellionMaverick =
        diffKey === 'risky' &&
        gameState.son.affinity.rebellion >= 70 &&
        Math.random() < diff.maverickChance;
    const rebellionBonus = rebellionMaverick ? 1.08 : 1.0;

    const missionGoldMul = Number.isFinite(mission.goldMul) ? mission.goldMul : (Number.isFinite(mission.rewardMul) ? mission.rewardMul : 1.0);
    const missionLootMul = Number.isFinite(mission.lootMul) ? mission.lootMul : (Number.isFinite(mission.rewardMul) ? mission.rewardMul : 1.0);
    const earnedGold = Math.floor((zone.baseGold + cp * 3.2 + Math.random() * 160) * diff.goldMul * missionGoldMul * outcomeMul);
    const encourageBonus = gameState.son.adventureEncouraged ? 1.2 : 1.0;
    let finalGold = Math.floor(earnedGold * encourageBonus * rebellionBonus);
    if (appliedBuff?.goldMul) finalGold = Math.floor(finalGold * appliedBuff.goldMul);
    if (job?.goldMul) finalGold = Math.floor(finalGold * job.goldMul);
    if (sendoff?.goldMul) finalGold = Math.floor(finalGold * sendoff.goldMul);
    if (seals?.goldMul) finalGold = Math.floor(finalGold * seals.goldMul);
    // Story can shift rewards slightly (kept small to avoid balance swings).
    const storyGoldMul = Math.max(0.9, Math.min(1.1, Number.isFinite(adv.storyGoldMul) ? adv.storyGoldMul : 1.0));
    finalGold = Math.max(0, Math.floor(finalGold * storyGoldMul));

    const lootResults = [];
    const lootPasses = (rebellionMaverick ? 2 : 1) + (mission.id === 'gather' ? 1 : 0) + (outcome === 'great' ? 1 : 0);
    const storyLootMul = Math.max(0.9, Math.min(1.12, Number.isFinite(adv.storyLootMul) ? adv.storyLootMul : 1.0));
    const lootBuffMul = (appliedBuff?.lootMul ?? 1.0) * (job?.lootMul ?? 1.0) * (sendoff?.lootMul ?? 1.0) * (seals?.lootMul ?? 1.0) * storyLootMul;
    let zoneDropHits = 0;
    let nonSeedHits = 0;

    // Core loot table
    for (let pass = 0; pass < lootPasses; pass++) {
        for (const item of lootTable) {
            const passMul = pass === 0 ? 1.0 : pass === 1 ? 0.45 : 0.25;
            const prob = Math.min(95, item.prob * diff.lootMul * lootBuffMul * missionLootMul * passMul * outcomeMul);
            if (gameState.son.level >= item.minLv && Math.random() * 100 < prob) {
                const amount = 1 + Math.floor(Math.random() * 2);
                if (item.key === 'seed') {
                    ensureFarm();
                    gameState.parent.farm.seed += amount;
                    lootResults.push(`🌱 씨앗 x${amount}`);
                } else {
                    ensureLootKey(item.key);
                    gameState.parent.loot[item.key].count += amount;
                    lootResults.push(`${gameState.parent.loot[item.key]?.name || item.name} x${amount}`);
                }
            }
        }
    }

    // Zone drops
    if (zone?.drops?.length) {
        for (const drop of zone.drops) {
            const prob = Math.min(95, drop.prob * diff.lootMul * lootBuffMul * missionLootMul * outcomeMul);
            if (Math.random() * 100 < prob) {
                const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                if (drop.key === 'seed') {
                    ensureFarm();
                    gameState.parent.farm.seed += amount;
                    lootResults.push(`🌱 씨앗 x${amount}`);
                } else {
                    ensureLootKey(drop.key);
                    gameState.parent.loot[drop.key].count += amount;
                    lootResults.push(`${gameState.parent.loot[drop.key]?.name || drop.key} x${amount}`);
                }
                zoneDropHits++;
                if (drop.key !== 'seed') nonSeedHits++;
            }
        }
    }

    // Guarantee: bring home at least one zone material (helps crafting feel consistent)
    if (zone && (zoneDropHits === 0 || nonSeedHits === 0)) {
        const g = grantGuaranteedZoneDrop({ zone, mission, outcome });
        if (g) {
            if (g.key === 'seed') {
                ensureFarm();
                gameState.parent.farm.seed += g.amount;
                lootResults.push(`🌱 씨앗 x${g.amount}`);
            } else {
                ensureLootKey(g.key);
                gameState.parent.loot[g.key].count += g.amount;
                lootResults.push(`${gameState.parent.loot[g.key]?.name || g.key} x${g.amount}`);
            }
        }
    }

    // Parent's request: the son may remember and bring a bit extra (based on affinity).
    const reqBonus = tryGrantRequestedMaterialBonus(zone, mission, diffKey, outcome);
    if (reqBonus) lootResults.push(reqBonus.text);

    // Boss trophy (unique material) — gives “big moment” progression.
    if (mission?.id === 'boss' && zone) {
        const trophy = bossTrophiesByZone[zone.id];
        if (trophy) {
            let grant = 0;
            if (outcome === 'great' || outcome === 'success') grant = 1;
            else if (outcome === 'partial' && Math.random() < 0.25) grant = 1; // partial reward
            if (grant > 0) {
                if (outcome === 'great' && Math.random() < 0.22) grant += 1;
                ensureLootKey(trophy.key);
                gameState.parent.loot[trophy.key].count += grant;
                lootResults.push(`${gameState.parent.loot[trophy.key].name} x${grant}`);
            }
        }
    }

    const baseExp = 18 + (gameState.son.level * 5);
    let adventureExp = Math.floor(baseExp * diff.expMul * mission.expMul * (outcome === 'great' ? 1.1 : outcome === 'partial' ? 0.75 : outcome === 'fail' ? 0.55 : 1.0));
    if (appliedBuff?.expMul) adventureExp = Math.floor(adventureExp * appliedBuff.expMul);
    if (job?.expMul) adventureExp = Math.floor(adventureExp * job.expMul);
    if (seals?.expMul) adventureExp = Math.floor(adventureExp * seals.expMul);
    gameState.son.exp += adventureExp;

    const baseFatigueFloor = diff.fatigueFloor;
    let fatigueFloor = baseFatigueFloor;
    if (appliedBuff?.fatigueAdd) fatigueFloor = Math.min(0.55, fatigueFloor + appliedBuff.fatigueAdd);
    if (job?.fatigueAdd) fatigueFloor = Math.min(0.60, fatigueFloor + job.fatigueAdd);
    if (seals?.fatigueAdd) fatigueFloor = Math.min(0.62, fatigueFloor + seals.fatigueAdd);
    gameState.son.hp = Math.max(15, Math.floor(gameState.son.maxHp * fatigueFloor));
    gameState.son.hunger = Math.max(15, Math.floor(gameState.son.maxHunger * fatigueFloor));

    gameState.parent.gold += finalGold;
    gameState.son.state = 'IDLE';
    gameState.son.actionTimer = 0;
    gameState.son.adventure = null;
    if (els.sprite) els.sprite.style.display = 'block';
    if (legacyBuff) gameState.son.nextAdventureBuff = null;

    // World codex update (discover & records)
    ensureWorldCodexState();
    const codexResult = recordWorldRun(zone.id, mission.id, outcome, score);
    if (codexResult.firstDiscovery) {
        showToast(`🗺️ 도감 업데이트: ${zone.name}`, 'info');
    }
    if (codexResult.firstBoss) {
        const boss = zoneBosses[zone.id];
        showToast("👑 보스 격파 기록!", 'levelup');
    }

    // Injury roll
    const baseRisk = zone.injuryRisk * mission.riskMul * (diffKey === 'risky' ? 1.25 : diffKey === 'safe' ? 0.85 : 1.0);
    const outcomeRiskMul = outcome === 'great' ? 0.6 : outcome === 'success' ? 1.0 : outcome === 'partial' ? 1.35 : 1.75;
    const defMitigation = 1 / (1 + def * 0.12);
    const buffRiskMul = appliedBuff?.riskMul ?? 1.0;
    const jobRiskMul = job?.riskMul ?? 1.0;
    const sendoffRiskMul = sendoff?.riskMul ?? 1.0;
    const sealRiskMul = seals?.riskMul ?? 1.0;
    const storyRiskMul = Math.max(0.9, Math.min(1.25, Number.isFinite(adv.storyRiskMul) ? adv.storyRiskMul : 1.0));
    const storyInjuryDampen = (adv.storyInjuryApplied === true) ? 0.62 : 1.0;
    const finalRisk = Math.min(0.85, baseRisk * outcomeRiskMul * injuryRiskMul * defMitigation * buffRiskMul * jobRiskMul * sendoffRiskMul * sealRiskMul * storyRiskMul * storyInjuryDampen);
    if (Math.random() < finalRisk) {
        const severityRoll = Math.random();
        const deepFail = score < 0.7 ? 1 : 0;
        const sev =
            severityRoll < (0.55 - deepFail * 0.15) ? '경미' :
            severityRoll < (0.88 - deepFail * 0.05) ? '중상' :
            '심각';
        applyInjury(sev);
        showToast("🩹 아들이 다쳤습니다...", 'error');
    }

    const pct = Math.max(0, Math.min(150, Math.round(score * 100)));
    const outcomeText = outcomeLabel(outcome, pct);
    if (rebellionMaverick) {
        gameState.son.affinity.trust = Math.max(0, gameState.son.affinity.trust - 2);
        gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 2);
    }

    // Gold pop animation
    els.gold.classList.add('gold-pop');
    setTimeout(() => els.gold.classList.remove('gold-pop'), 500);

    if (!gameState.firstAdventureDone) {
        gameState.firstAdventureDone = true;
        showToast("💡 첫 모험 완료! 아들을 돌봐주세요", 'info');
    }

    checkLevelUp();
    updateUI();

    const zoneLine = `${zone.emoji} ${zone.name} · ${mission.emoji} ${mission.name}`;
    const diffLine = `${diff.name} · CP ${cp} (권장CP ${zone.recCP})`;
    const injuryLine = gameState.son.injury
        ? `🩹 부상: ${gameState.son.injury.label || '부상'} (${gameState.son.injury.severity || ''})`
        : `🩹 부상 없음`;
    const lootLine = lootResults.length ? `📦 전리품: ${lootResults.join(', ')}` : `📦 전리품 없음`;
    const sendoffLine =
        sendoff?.id === 'bye_warm' ? '👋 인사: 잘 다녀와 (골드 약간 증가)' :
        sendoff?.id === 'bye_careful' ? '👋 인사: 조심해 (부상 위험 감소)' :
        sendoff?.id === 'bye_cool' ? '👋 인사: 응(시크하게) (전리품 약간 증가)' :
        '';
    const buffLine = appliedBuff ? `✨ 버프: ${describeNextAdventureBuff(appliedBuff)}` : '';
    const jobLine = job ? `🧭 직업: ${job.name}${job.desc ? ` (${job.desc})` : ''}` : '';
    const sealShort = describeBossSealsShort();
    const sealLine = sealShort ? `🏆 인장: ${sealShort}` : '';
    const encourageLine = gameState.son.adventureEncouraged ? '💌 응원 보너스: 적용(+20%)' : '';
    const maverickLine = rebellionMaverick ? '🌟 고집이 발동해 예상 밖의 성과를 냈습니다.' : '';

    const summaryLines = [
        `<b>결과</b>\n${outcomeText}`,
        `<b>보상</b>\n💰 +${finalGold}G · ⭐ +${adventureExp} EXP`,
        lootLine,
        injuryLine,
        encourageLine,
        buffLine,
        sealLine,
        jobLine,
        sendoffLine,
        maverickLine
    ].filter(Boolean).join('\n\n');

    openTravelModal({
        title: '🏠 귀환',
        sub: `${zoneLine} · ${diffLine}`,
        imgSrc: 'assets/pixel/son_idle.png',
        dialogue: buildReturnDialogue(outcome, pct, { injured: !!gameState.son.injury }),
        summary: summaryLines,
        actions: [
            { id: 'welcome_praise', label: '고생했어~' },
            { id: 'welcome_check', label: '잘 다녀왔어?' },
            { id: 'welcome_food', label: '얼른 씻고 밥먹어', variant: 'secondary' }
        ],
        defaultId: 'welcome_praise',
        onResolve: (choiceId) => {
            if (choiceId === 'welcome_praise') {
                gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + 2, 0, 100);
                gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + 1, 0, 100);
                gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - 2, 0, 100);
                sonSpeech("헤헤… 고마워요!");
            } else if (choiceId === 'welcome_check') {
                gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + 2, 0, 100);
                gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + 1, 0, 100);
                sonSpeech("응! 괜찮아!");
            } else if (choiceId === 'welcome_food') {
                gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + 1, 0, 100);
                gameState.son.personality.diligence = clampInt((gameState.son.personality.diligence || 50) + 1, 0, 100);
                sonSpeech("알겠어요…!");
            }
            consumeBuddyAfterAdventure();
            updateUI();
        }
    });
}

// ============================================================
// Action & State Machine Logic
// ============================================================
function handleActionCompletion() {
    const healBonus = Math.floor(gameState.son.affinity.affection / 10);
    const bedLv = gameState.parent.upgrades.bed;
    const tableLv = gameState.parent.upgrades.table;
    const dummyLv = gameState.parent.upgrades.dummy;
    const deskLv = gameState.parent.upgrades.desk;
    const healMul = gameState.son.injury?.healMul ?? 1.0;

    if (gameState.son.state === 'SLEEPING') {
        const recovery = Math.floor((upgradeData.bed.effects[bedLv - 1] + healBonus) * healMul);
        sonSpeech("잘 잤다!");
        gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + recovery);
        showToast(`🛏️ 수면 회복 +${recovery}HP`, 'success');
        maybeProcFromBedAfterSleep();
    } else if (gameState.son.state === 'EATING') {
        const placed = gameState.rooms['room-table'].placedItem;
        let mealBuff = null;
        if (placed === 'steak') {
            sonSpeech("스테이크 최고!");
            gameState.son.hunger = gameState.son.maxHunger;
            gameState.son.exp += 30;
            showToast("🥩 스테이크: 허기 MAX · EXP +30", 'success');
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'homemade_meal') {
            sonSpeech("엄마 집밥 최고!!");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 80);
            gameState.son.exp += 15;
            gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 3);
            showToast("🍲 집밥: 허기 +80 · EXP +15 · 애정 +3", 'success');
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'herb_potion') {
            sonSpeech("약초 물약... 쓰다!");
            const hpGain = Math.floor(60 * healMul);
            gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + hpGain);
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 20);
            showToast(`🧪 약초 물약: HP +${hpGain} · 허기 +20`, 'success');
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'herb_tea') {
            sonSpeech("따뜻하다…");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 35);
            gameState.son.personality.calmness = clampInt((gameState.son.personality.calmness || 50) + 2, 0, 100);
            gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 50) + 1, 0, 100);
            showToast("🍵 허브티: 허기 +35 · 차분 +2 · 애정 +1", 'success');
            mealBuff = { id: 'herb_tea', name: '허브티', desc: '다음 모험에서 덜 다치고, 컨디션이 좋아져요.', riskMul: 0.90, fatigueAdd: 0.06, source: 'meal' };
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'wolf_jerky') {
            sonSpeech("든든해!");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 55);
            gameState.son.personality.bravery = clampInt((gameState.son.personality.bravery || 50) + 1, 0, 100);
            showToast("🥓 늑대 육포: 허기 +55 · 대담 +1", 'success');
            mealBuff = { id: 'wolf_jerky', name: '늑대 육포', desc: '다음 모험에서 전리품을 더 잘 챙겨옵니다.', lootMul: 1.14, source: 'meal' };
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'rune_cookie') {
            sonSpeech("머리가 맑아지는 느낌!");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 45);
            gameState.son.exp += 10;
            gameState.son.personality.intelligence = clampInt((gameState.son.personality.intelligence || 50) + 1, 0, 100);
            showToast("🍪 룬 쿠키: 허기 +45 · EXP +10 · 지능 +1", 'success');
            mealBuff = { id: 'rune_cookie', name: '룬 쿠키', desc: '다음 모험에서 EXP가 늘고, 부상 위험이 아주 조금 줄어듭니다.', expMul: 1.16, riskMul: 0.97, source: 'meal' };
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'wind_stew') {
            sonSpeech("몸이 가볍다!");
            const hpGain = Math.floor(20 * healMul);
            gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + hpGain);
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 75);
            gameState.son.personality.endurance = clampInt((gameState.son.personality.endurance || 50) + 1, 0, 100);
            showToast(`🍲 바람 스튜: HP +${hpGain} · 허기 +75 · 인내 +1`, 'success');
            mealBuff = { id: 'wind_stew', name: '바람 스튜', desc: '다음 모험에서 부상 위험이 줄고, 덜 지칩니다.', riskMul: 0.86, fatigueAdd: 0.05, source: 'meal' };
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else if (placed === 'dragon_broth') {
            sonSpeech("…엄청 진하다!");
            const hpGain = Math.floor(25 * healMul);
            gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + hpGain);
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 90);
            gameState.son.exp += 20;
            gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 50) + 1, 0, 100);
            showToast(`🍜 고룡 육수: HP +${hpGain} · 허기 +90 · EXP +20 · 신뢰 +1`, 'gold');
            mealBuff = { id: 'dragon_broth', name: '고룡 육수', desc: '다음 모험의 보상이 전반적으로 좋아집니다.', goldMul: 1.08, lootMul: 1.08, expMul: 1.12, riskMul: 0.92, fatigueAdd: 0.05, source: 'meal' };
            gameState.rooms['room-table'].placedItem = null;
            updateKitchenSlotUI();
        } else {
            const recovery = Math.floor((upgradeData.table.effects[tableLv - 1] + healBonus) * healMul);
            sonSpeech("밥 다 먹었다...");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + recovery);
            showToast(`🍽️ 기본 식사 허기 +${recovery}`, 'success');
        }
        maybeProcFromTableAfterMeal();
        if (mealBuff) setNextAdventureBuff(mealBuff);
    } else if (gameState.son.state === 'TRAINING') {
        const baseExp = upgradeData.dummy.effects[dummyLv - 1];
        const trainingType = resolveTrainingType();
        const toolBonus = gameState.rooms['room-dummy'].placedItem === 'sandbag';
        let gained = baseExp;
        if (gameState.rooms['room-dummy'].placedItem === 'sandbag') {
            sonSpeech("모래주머니 훈련 끝!");
            gained = baseExp + 50;
            gameState.son.exp += gained;
            gameState.rooms['room-dummy'].placedItem = null;
            els.slots['room-dummy'].innerHTML = `<span class="slot-label">빈 슬롯</span>➕`;
            els.slots['room-dummy'].classList.remove('filled');
        } else {
            sonSpeech("기본 훈련 끝!");
            gameState.son.exp += baseExp;
        }
        const growth = applyTrainingGrowth(trainingType, toolBonus);
        showToast(`${growth.label}: EXP +${gained}${growth.summary ? ' · ' + growth.summary : ''}`, 'levelup');
        const trustGain = toolBonus ? 2 : 1;
        const rebellionDown = toolBonus ? 2 : 1;
        gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + trustGain, 0, 100);
        gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - rebellionDown, 0, 100);
        gameState.son.personality.diligence = clampInt((gameState.son.personality.diligence || 50) + 1, 0, 100);
        maybeTriggerUnexpectedGrowthHome('TRAINING');
    } else if (gameState.son.state === 'STUDYING') {
        const baseExp = upgradeData.desk.effects[deskLv - 1];
        sonSpeech("공부 끝...");
        gameState.son.exp += baseExp;
        showToast(`📚 공부 EXP +${baseExp}`, 'levelup');
        const r = tryReadFromBookshelf();
        if (!r?.read) {
            // gentle hint, not every time
            if (r && Math.random() < 0.22) showToast("📖 책장은 봤지만… 아직 마음이 안 가나 봐요.", 'info');
        }
        maybeProcFromDeskAfterStudy();
        gameState.son.affinity.trust = clampInt((gameState.son.affinity.trust || 0) + 1, 0, 100);
        gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - 1, 0, 100);
        gameState.son.personality.diligence = clampInt((gameState.son.personality.diligence || 50) + 1, 0, 100);
        // Studying tends to make the son slightly more cautious over time
        gameState.son.personality.bravery = clampInt(gameState.son.personality.bravery - 1, 0, 100);
        maybeTriggerUnexpectedGrowthHome('STUDYING');
    } else if (gameState.son.state === 'RESTING') {
        sonSpeech("잠깐 쉬었다 가자...");
        const hpGain = Math.floor((Math.floor(upgradeData.bed.effects[bedLv - 1] * 0.25) + 8 + healBonus) * healMul);
        const hungerGain = Math.floor((Math.floor(upgradeData.table.effects[tableLv - 1] * 0.2) + 6) * healMul);
        gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + hpGain);
        gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + hungerGain);
        showToast(`🧸 휴식 +${hpGain}HP · 허기 +${hungerGain}`, 'success');
        const extraAffection = gameState.son.injury ? 1 : 0;
        gameState.son.affinity.affection = clampInt((gameState.son.affinity.affection || 0) + 1 + extraAffection, 0, 100);
        gameState.son.affinity.rebellion = clampInt((gameState.son.affinity.rebellion || 0) - 2, 0, 100);
        gameState.son.personality.diligence = clampInt((gameState.son.personality.diligence || 50) + 1, 0, 100);
        gameState.son.personality.calmness = clampInt((gameState.son.personality.calmness || 50) + 1, 0, 100);
        gameState.son.personality.flexibility = clampInt((gameState.son.personality.flexibility ?? 50) + 1, 0, 100);
        gameState.son.personality.bravery = clampInt(gameState.son.personality.bravery - 1, 0, 100);
        maybeTriggerUnexpectedGrowthHome('RESTING');
    }
    // Count one completed home action (including “아무것도 안 할래!” idle timer).
    ensureSonBehaviorState();
    gameState.son.homeActionCount = Math.min(999, (gameState.son.homeActionCount || 0) + 1);
    gameState.son.state = 'IDLE';
}

function maybeTriggerUnexpectedGrowthHome(lastAction) {
    const rebellion = gameState.son.affinity.rebellion;
    if (rebellion < 65) return;
    if (Math.random() > 0.035) return;
    const bonusExp = 12 + Math.floor(gameState.son.level * 3);
    gameState.son.exp += bonusExp;
    gameState.son.affinity.trust = Math.max(0, gameState.son.affinity.trust - 2);
    gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 1);
    addMail(
        "🌟 뜻밖의 성장",
        `아들이 ${lastAction === 'TRAINING' ? '몰래 특훈' : lastAction === 'STUDYING' ? '혼자 공부' : '스스로 정리'}로 성장했습니다. (EXP +${bonusExp})`
    );
    showToast("🌟 아들이 혼자서도 성장했습니다.", 'levelup');
}

function getBookshelfAttraction() {
    ensureLibraryState();
    const lib = gameState.parent.library;
    const shelf = lib?.shelf;
    if (!Array.isArray(shelf) || shelf.length === 0) return 0;
    let best = 0;
    for (let i = 0; i < shelf.length; i++) {
        const id = shelf[i];
        if (!id) continue;
        const book = bookById[id];
        if (!book) continue;
        const bias = lib.shelfBias?.[i] ?? 0;
        best = Math.max(best, computeBookInterest(book, bias));
    }
    return clamp01(best);
}

function getTrainingAttraction() {
    ensureSonGrowthState();
    const p = gameState.son.personality || {};
    const m = gameState.son.trainingMastery || {};
    const norm = (v) => Math.max(0, Math.min(1, (v || 0) / 100));
    const mastery = (v) => Math.max(0, Math.min(1, (v || 0) / 80));
    const toolPlaced = gameState.rooms?.['room-dummy']?.placedItem === 'sandbag';

    const type = getTrainingTypeFromDummyModel();
    let desire = 0.55;
    if (type === 'strength') desire = 0.55 * norm(p.endurance) + 0.45 * mastery(m.strength);
    else if (type === 'magic') desire = 0.55 * norm(p.intelligence) + 0.45 * mastery(m.magic);
    else if (type === 'archery') desire = 0.55 * norm(p.focus) + 0.45 * mastery(m.archery);
    else if (type === 'legend') desire = 0.65;
    else desire = 0.55; // random/basic

    if (toolPlaced) desire += 0.18;
    if (gameState.son.injury) desire -= 0.12;
    return clamp01(desire);
}

function sonAI() {
  try {
    // 1. Adventuring
    if (gameState.son.state === 'ADVENTURING') {
        return;
    }

    // 2. Action timer tick
    if (gameState.son.actionTimer > 0) {
        gameState.son.actionTimer--;
        const injuryDrain = gameState.son.injury?.hungerDrain ?? 0;
        if (gameState.son.state === 'TRAINING') { gameState.son.hp -= 1; gameState.son.hunger -= 1; }
        if (gameState.son.state === 'STUDYING') { gameState.son.hunger -= 0.5; }
        if (gameState.son.state === 'RESTING') { gameState.son.hunger -= 0.2; }
        if (injuryDrain > 0) gameState.son.hunger -= injuryDrain;

        if (Math.random() < 0.1 && gameState.son.actionTimer > 3) {
            const dialogues = sonDialogues[gameState.son.state] || sonDialogues['IDLE'];
            sonSpeech(dialogues[Math.floor(Math.random() * dialogues.length)]);
        }
        if (gameState.son.actionTimer <= 0) handleActionCompletion();
        if (gameState.son.hp < 0) gameState.son.hp = 0;
        if (gameState.son.hunger < 0) gameState.son.hunger = 0;
        checkLevelUp();
        updateUI();
        return;
    }

    // 3. Decision making
    // Rule: after enough routines at home, the son will prepare and 반드시 모험을 떠납니다 (when ready).
    ensureSonBehaviorState();
    const forcedByActions = (gameState.son.homeActionCount || 0) >= 10;
    const hpReady = gameState.son.hp >= (gameState.son.maxHp * 0.8);
    const hungerReady = gameState.son.hunger >= (gameState.son.maxHunger * 0.8);

    if (forcedByActions) {
        if (hpReady && hungerReady && !isWardrobeLocked()) {
            startAdventure();
            return;
        }
        // If not ready, focus on topping up to the threshold instead of drifting forever.
        if (!hpReady) {
            gameState.son.state = 'SLEEPING';
            moveToRoom('room-bed');
            gameState.son.actionTimer = 15;
            sonSpeech("다음 모험 준비… 잠깐만 잘게요.");
            updateUI();
            return;
        }
        if (!hungerReady) {
            gameState.son.state = 'EATING';
            moveToRoom('room-table');
            gameState.son.actionTimer = 10;
            sonSpeech("든든히 먹고 갈게요!");
            updateUI();
            return;
        }
    }

    // Default: Adventure only when 80% AND mom isn't touching the wardrobe
    if (hpReady && hungerReady) {
        if (!isWardrobeLocked()) {
            startAdventure();
            return;
        }
    }

    triggerRandomRequest();

    // Passive hunger/hp drain when idle
    const injuryDrainIdle = gameState.son.injury?.hungerDrain ?? 0;
    gameState.son.hunger = Math.max(0, gameState.son.hunger - 0.3 - injuryDrainIdle);

    if (gameState.son.hp <= 50) {
        gameState.son.state = 'SLEEPING';
        moveToRoom('room-bed');
        gameState.son.actionTimer = 15;
        sonSpeech("졸려... 자러 갈게요.");
    } else if (gameState.son.hunger <= 60) {
        gameState.son.state = 'EATING';
        moveToRoom('room-table');
        gameState.son.actionTimer = 10;
        sonSpeech("배고파! 밥 먹어야지.");
    } else {
        if (gameState.son.affinity.rebellion > 50 && Math.random() > 0.5) {
            sonSpeech("아 다 귀찮아! 아무것도 안 할래!");
            gameState.son.actionTimer = 5;
        } else {
            const p = gameState.son.personality || {};
            const a = gameState.son.affinity || {};
            const bravery = Number.isFinite(p.bravery) ? p.bravery : 50;
            const diligence = Number.isFinite(p.diligence) ? p.diligence : 50;
            const calmness = Number.isFinite(p.calmness) ? p.calmness : 50;
            const intelligence = Number.isFinite(p.intelligence) ? p.intelligence : 50;
            const endurance = Number.isFinite(p.endurance) ? p.endurance : 50;
            const rebellion = Number.isFinite(a.rebellion) ? a.rebellion : 0;

            const cautiousFactor = clamp01((50 - bravery) / 50);
            const braveFactor = clamp01((bravery - 50) / 50);
            const diligentFactor = clamp01((diligence - 50) / 50);
            const calmFactor = clamp01((calmness - 50) / 50);
            const smartFactor = clamp01((intelligence - 50) / 50);
            const toughFactor = clamp01((endurance - 50) / 50);
            const rebellionFactor = clamp01(rebellion / 100);
            const flexibility = Number.isFinite(p.flexibility) ? p.flexibility : 50;
            const flexFactor = clamp01(flexibility / 100);

            const bookshelfAttraction = getBookshelfAttraction();
            const trainingAttraction = getTrainingAttraction();
            const lureMul = (1 - rebellionFactor * 0.55) * (0.75 + flexFactor * 0.25);

            let wRest =
                0.26 +
                cautiousFactor * 0.14 +
                calmFactor * 0.10 +
                (gameState.son.injury ? 0.22 : 0);
            let wTrain =
                0.30 +
                braveFactor * 0.14 +
                toughFactor * 0.10 +
                (trainingAttraction * 0.22 * lureMul);
            let wStudy =
                0.28 +
                smartFactor * 0.14 +
                diligentFactor * 0.10 +
                (bookshelfAttraction * 0.22 * lureMul);

            // If injured, training becomes less appealing
            if (gameState.son.injury) wTrain -= 0.08;

            wRest = Math.max(0.05, wRest);
            wTrain = Math.max(0.05, wTrain);
            wStudy = Math.max(0.05, wStudy);
            const totalW = Math.max(0.01, wRest + wTrain + wStudy);
            const r = Math.random() * totalW;
            const pick =
                r < wRest ? 'RESTING' :
                r < wRest + wTrain ? 'TRAINING' :
                'STUDYING';

            const choiceReasons = [];
            if (rebellionFactor >= 0.65) choiceReasons.push('고집이 세서 엄마의 유도에 덜 끌려요');
            if (pick === 'RESTING') {
                if (gameState.son.injury) choiceReasons.push('부상이 있어서 쉬려 해요');
                if (calmness >= 60) choiceReasons.push('차분해서 휴식을 선호해요');
                if (bravery <= 40) choiceReasons.push('신중해서 무리하지 않으려 해요');
            } else if (pick === 'TRAINING') {
                if (trainingAttraction >= 0.68) choiceReasons.push('훈련장이 마음에 들어 보여요');
                if (gameState.rooms?.['room-dummy']?.placedItem === 'sandbag') choiceReasons.push('모래주머니가 있어서 더 신나 보여요');
                if (bravery >= 60) choiceReasons.push('대담해서 몸을 쓰고 싶어 해요');
            } else if (pick === 'STUDYING') {
                if (bookshelfAttraction >= 0.68) choiceReasons.push('책장에 관심이 생겼어요');
                if (intelligence >= 60) choiceReasons.push('호기심이 많아서 공부를 택했어요');
                if (diligence >= 60) choiceReasons.push('성실해서 책을 펼치려 해요');
            }
            gameState.son.lastChoice = {
                pick,
                tick: gameState.worldTick || 0,
                reasons: choiceReasons.slice(0, 3)
            };

            if (pick === 'RESTING') {
                gameState.son.state = 'RESTING';
                moveToRoom('room-bed');
                gameState.son.actionTimer = 14;
                sonSpeech("조금만 쉬고 할래요.");
            } else if (pick === 'TRAINING') {
                gameState.son.state = 'TRAINING';
                moveToRoom('room-dummy');
                gameState.son.actionTimer = 22;
                sonSpeech("훈련을 시작하지!");
            } else {
                gameState.son.state = 'STUDYING';
                moveToRoom('room-desk');
                gameState.son.actionTimer = 22;
                sonSpeech("책 좀 읽어볼까.");
            }
        }
    }
    updateUI();
  } catch(e) {
    console.error("CRASH IN sonAI:", e);
  }
}

function checkLevelUp() {
    if (gameState.son.exp >= gameState.son.maxExp) {
        gameState.son.level++;
        gameState.son.exp = 0;
        gameState.son.maxExp = Math.floor(gameState.son.maxExp * 1.5);
        gameState.son.maxHp += 20;
        gameState.son.maxHunger += 20;
        gameState.son.hp = gameState.son.maxHp;
        gameState.son.hunger = gameState.son.maxHunger;
        sonSpeech("레벨업 했어요!");
        addMail("🎉 레벨업!", `아들이 Lv.${gameState.son.level}이(가) 되었습니다!`);
        showToast(`🎉 Lv.${gameState.son.level} 레벨업!`, 'levelup');
    }
}

// ============================================================
// #5 — Farm System
// ============================================================
function rollFarmHarvest(level) {
    const lv = Math.max(1, Math.floor(level || 1));
    const table =
        lv <= 1
            ? [
                { key: 'carrot', emoji: '🥕', w: 70, min: 1, max: 1 },
                { key: 'tomato', emoji: '🍅', w: 30, min: 1, max: 1 }
            ]
            : lv === 2
                ? [
                    { key: 'carrot', emoji: '🥕', w: 55, min: 1, max: 2 },
                    { key: 'tomato', emoji: '🍅', w: 35, min: 1, max: 2 },
                    { key: 'herb', emoji: '🌿', w: 10, min: 1, max: 1 }
                ]
                : lv === 3
                    ? [
                        { key: 'carrot', emoji: '🥕', w: 45, min: 1, max: 3 },
                        { key: 'tomato', emoji: '🍅', w: 30, min: 1, max: 3 },
                        { key: 'herb', emoji: '🌿', w: 25, min: 1, max: 2 }
                    ]
                    : [
                        { key: 'carrot', emoji: '🥕', w: 40, min: 2, max: 4 },
                        { key: 'tomato', emoji: '🍅', w: 25, min: 2, max: 4 },
                        { key: 'herb', emoji: '🌿', w: 35, min: 1, max: 3 }
                    ];

    const total = table.reduce((acc, t) => acc + t.w, 0);
    let r = Math.random() * total;
    let chosen = table[0];
    for (const t of table) {
        r -= t.w;
        if (r <= 0) {
            chosen = t;
            break;
        }
    }
    const amount = chosen.min + Math.floor(Math.random() * (chosen.max - chosen.min + 1));
    return { key: chosen.key, emoji: chosen.emoji, amount };
}

function farmHarvestAtPlot(plotIndex) {
    ensureFarm();
    ensurePantry();
    const f = gameState.parent.farm;
    const plot = f.plots[plotIndex];
    if (!plot) return;

    if (plot.state === 'ready') {
        harvestFarmPlot(plotIndex);
        return;
    }
    if (plot.state === 'growing') {
        showToast(`🌱 자라는 중... (${Math.max(0, plot.timer || 0)}초 남음)`, 'info');
        return;
    }

    // empty -> start growing
    if ((f.seed || 0) <= 0) {
        showToast('씨앗이 없어요. (마을 상점에서 구매하거나 모험 전리품으로 얻어요)', 'error');
        return;
    }
    f.seed -= 1;
    const grow = 10 + Math.floor(Math.random() * 21); // 10~30s
    plot.state = 'growing';
    plot.timer = grow;
    showToast(`🌱 재배 시작! (${grow}초 후 수확) (씨앗 -1)`, 'success');
    updateUI();
}
window.farmHarvestAtPlot = farmHarvestAtPlot;

function harvestFarmPlot(plotIndex) {
    ensureFarm();
    ensurePantry();
    const f = gameState.parent.farm;
    const plot = f.plots[plotIndex];
    if (!plot || plot.state !== 'ready') return;

    const roll = rollFarmHarvest(f.level);
    if (!gameState.parent.harvestBag[roll.key]) gameState.parent.harvestBag[roll.key] = 0;
    gameState.parent.harvestBag[roll.key] += roll.amount;

    plot.state = 'empty';
    plot.timer = 0;

    addFarmXp(1);
    const nm = ingredientNames[roll.key] || roll.key;
    showToast(`${roll.emoji} 수확! ${nm} x${roll.amount}`, 'success');
    updateUI();
}

function updateFarmUI() {
    if (!els.farmGrid) return;
    ensureFarm();

    const f = gameState.parent.farm;
    const lvEl = document.getElementById('farm-lv');
    const xpTextEl = document.getElementById('farm-xp-text');
    const xpBarEl = document.getElementById('farm-xp-bar');
    const seedEl = document.getElementById('farm-seed');
    if (lvEl) lvEl.innerText = String(f.level);
    if (seedEl) seedEl.innerText = String(f.seed || 0);
    const need = getFarmXpToNext(f.level);
    const xp = f.xp || 0;
    if (xpTextEl) xpTextEl.innerText = `${xp}/${need}`;
    if (xpBarEl) {
        const pct = need > 0 ? Math.max(0, Math.min(100, Math.round((xp / need) * 100))) : 0;
        xpBarEl.style.width = `${pct}%`;
    }

    els.farmGrid.innerHTML = '';
    f.plots.forEach((plot, i) => {
        const div = document.createElement('div');
        div.className = 'farm-plot';
        if (plot.state === 'growing' && (plot.timer || 0) > 0) {
            div.classList.add('growing');
            div.innerHTML = `<div class="farm-plot-emoji">⏳</div><div class="farm-plot-timer">${plot.timer}초</div>`;
            div.onclick = () => farmHarvestAtPlot(i);
        } else if (plot.state === 'ready') {
            div.classList.add('ready');
            div.innerHTML = `<div class="farm-plot-emoji">✨</div><div style="font-size:0.7rem;color:#f59e0b;font-weight:bold;">수확!</div>`;
            div.onclick = () => harvestFarmPlot(i);
        } else {
            div.innerHTML = `<div class="farm-plot-emoji">🟫</div><div>재배 시작</div><div class="farm-plot-timer">씨앗 -1 · 10~30초</div>`;
            div.onclick = () => farmHarvestAtPlot(i);
        }
        els.farmGrid.appendChild(div);
    });
}

function farmTick() {
    ensureFarm();
    const f = gameState.parent.farm;
    f.plots.forEach(plot => {
        if (plot.state !== 'growing') return;
        plot.timer = Math.max(0, Math.floor((plot.timer || 0) - 1));
        if (plot.timer <= 0) plot.state = 'ready';
    });
}

function kitchenTick() {
    ensureKitchenState();
    const cooking = gameState.parent.kitchen.cooking;
    if (!cooking) return;
    cooking.remaining = Math.max(0, (cooking.remaining || 0) - 1);
    if (cooking.remaining > 0) {
        updateKitchenSlotUI();
        return;
    }

    const recipeId = cooking.recipeId;
    const recipe = recipes.find(r => r.id === recipeId);
    gameState.parent.kitchen.cooking = null;

    if (!gameState.rooms['room-table'].placedItem) {
        gameState.rooms['room-table'].placedItem = recipeId;
        showToast(`🍽️ ${recipe?.name || recipeId} 완성! 식탁에 올려두었습니다.`, 'success');
    } else {
        // Fallback: store in inventory if table is unexpectedly full
        if (gameState.parent.inventory?.[recipeId]) {
            gameState.parent.inventory[recipeId].count++;
        }
        showToast(`🍱 ${recipe?.name || recipeId} 완성! (보관)`, 'success');
    }
    updateKitchenSlotUI();
    updateUI();
}

// --- Cooking ---
function updateCookUI() {
    if (!els.cookList) return;
    els.cookList.innerHTML = '';
    if (!gameState.parent.harvestBag) gameState.parent.harvestBag = {};

    recipes.forEach(recipe => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px;';

        const needsText = Object.entries(recipe.needs).map(([k, v]) => {
            const have = gameState.parent.harvestBag[k] || 0;
            const color = have >= v ? '#10b981' : '#ef4444';
            const nm = ingredientNames[k] || k;
            return `<span style="color:${color}">${nm} ${have}/${v}</span>`;
        }).join(' ');

        const unlocked = isRecipeUnlocked(recipe);
        const canCook = Object.entries(recipe.needs).every(([k, v]) => (gameState.parent.harvestBag[k] || 0) >= v);
        const sealDef = recipe.requiresSeal ? bossSealDefs?.[recipe.requiresSeal] : null;
        const lockText = !unlocked ? `<div style="margin-top:4px; font-size:0.72rem; color:#f59e0b; font-weight:900;">🔒 ${sealDef?.name || '인장'} 제작 필요</div>` : '';

        div.innerHTML = `
            <div style="font-size:0.8rem;">
                <b>${recipe.name}</b> <span style="color:#64748b; font-size:0.75rem;">(${recipe.desc})</span><br>
                <span style="font-size:0.75rem;">${needsText}</span>
                ${lockText}
            </div>
            <button class="action-btn" style="width:auto; padding:4px 12px; margin:0; font-size:0.75rem; background:${(unlocked && canCook) ? '#10b981' : '#94a3b8'};" ${(!unlocked || !canCook) ? 'disabled' : ''} onclick="cookRecipe('${recipe.id}')">${!unlocked ? '잠김' : (canCook ? '조리 시작' : '재료 부족')}</button>
        `;
        els.cookList.appendChild(div);
    });
}

function cookRecipe(recipeId) {
    // Legacy hook: keep behavior consistent with the kitchen timer & table placement flow.
    startKitchenCooking(recipeId);
}
window.cookRecipe = cookRecipe;

// ============================================================
// Gacha & Work
// ============================================================
if (els.btnGacha) {
    els.btnGacha.addEventListener('click', () => performGacha('basic'));
}
if (els.btnGachaPremium) {
    els.btnGachaPremium.addEventListener('click', () => performGacha('premium'));
}
if (els.btnTemper) {
    els.btnTemper.addEventListener('click', () => temperSmithy());
}
if (els.btnSpecialOrder) {
    els.btnSpecialOrder.addEventListener('click', () => specialOrderSmithy());
}

if (els.btnWork) {
    els.btnWork.addEventListener('click', () => doSideJob());
}

// ============================================================
// Initialization
// ============================================================
console.log("Hero Mom Prototype v2 - Enhanced Loaded.");

const loaded = loadGame();
if (!loaded) {
    // #1 Fix: Son starts with lower HP/hunger, needing care before first adventure
    sonSpeech("엄마... 배고프고 졸려요...");
    showToast("📖 시작: 밥을 차리고 침대를 마련해주세요!", 'info');
} else {
    showToast("💾 저장 데이터를 불러왔습니다.", 'success');
}

initBgm();
moveToRoom(gameState.son.currentRoom);
updateUpgradeButtons(getActiveRoom());
updateUI();
initPixelAssets();
ensureAdventureInterval();
window.addEventListener('beforeunload', () => saveGame());

// Main game loop (1 second)
setInterval(() => {
    if (isGamePaused) return;
    gameState.worldTick = Math.max(0, Math.floor((gameState.worldTick || 0) + 1));
    ensureAdventureInterval();
    updateBookstoreRotation();
    sonAI();
    injuryTick();
    requestsTick();
    workTick();
    farmTick();
    kitchenTick();
    updateFarmUI();
    if ((gameState.worldTick || 0) % 10 === 0) saveGame();
}, 1000);
