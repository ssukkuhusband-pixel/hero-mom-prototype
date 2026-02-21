// ============================================================
// Hero Mom Prototype - Enhanced Version
// 1. 초반 흐름 + 토스트   2. 전리품 다양화
// 3. 가구 업그레이드      4. 모험 실황 뷰
// 5. 농사 시스템
// ============================================================

// --- Toast System (replaces all alert()) ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2600);
}

// --- Game State ---
const gameState = {
    parent: {
        gold: 500,
        upgrades: { bed: 1, table: 1, dummy: 1, desk: 1 },
        inventory: {
            'steak': { name: '🥩 최고급 스테이크', count: 0, type: 'kitchen' },
            'homemade_meal': { name: '🍲 집밥 정식', count: 0, type: 'kitchen' },
            'herb_potion': { name: '🧪 약초 물약', count: 0, type: 'kitchen' },
            'book_hero': { name: '📘 영웅학 개론', count: 0, type: 'study' },
            'sandbag': { name: '🏋️ 모래주머니', count: 0, type: 'training' }
        },
        weaponInventory: {
            'C': { name: '낡은 목검', atk: 2, count: 1 },
            'B': { name: '강철 단검', atk: 5, count: 0 },
            'A': { name: '기사의 장검', atk: 20, count: 0 },
            'S': { name: '🗡️ 드래곤 슬레이어', atk: 100, count: 0 }
        },
        // Loot storage from adventures
        loot: {
            'herb': { name: '🌿 약초', count: 2 },
            'monster_bone': { name: '🦴 몬스터 뼈', count: 0 },
            'magic_crystal': { name: '💎 마법 결정', count: 0 },
            'rare_hide': { name: '🧶 희귀 가죽', count: 0 }
        },
        // Farm system
        farm: {
            plots: [
                { state: 'empty', seedType: null, timer: 0 },
                { state: 'empty', seedType: null, timer: 0 },
                { state: 'empty', seedType: null, timer: 0 }
            ],
            seeds: {
                'carrot': { name: '🥕 당근 씨앗', count: 3, growTime: 20, emoji: '🥕' },
                'tomato': { name: '🍅 토마토 씨앗', count: 2, growTime: 30, emoji: '🍅' },
                'herb_seed': { name: '🌿 약초 씨앗', count: 1, growTime: 25, emoji: '🌿' }
            }
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
        weapon: { name: '몽둥이', atk: 1, tier: 'C' },
        actionTimer: 0,
        affinity: { trust: 50, affection: 50, rebellion: 0 },
        quest: null,
        adventureEncouraged: false
    },
    firstAdventureDone: false
};

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

// --- Recipe System ---
const recipes = [
    { id: 'homemade_meal', name: '🍲 집밥 정식', desc: '허기 +80', needs: { carrot: 2, tomato: 1 }, type: 'kitchen' },
    { id: 'herb_potion', name: '🧪 약초 물약', desc: 'HP +60', needs: { herb_seed: 2 }, type: 'kitchen' }
];

// --- Loot Table (by adventure tier) ---
const lootTable = [
    { name: '🌿 약초', key: 'herb', prob: 40, minLv: 1 },
    { name: '🦴 몬스터 뼈', key: 'monster_bone', prob: 30, minLv: 1 },
    { name: '💎 마법 결정', key: 'magic_crystal', prob: 15, minLv: 2 },
    { name: '🧶 희귀 가죽', key: 'rare_hide', prob: 15, minLv: 3 },
    // Seeds as adventure loot!
    { name: '🥕 당근 씨앗', key: 'seed_carrot', prob: 25, minLv: 1 },
    { name: '🍅 토마토 씨앗', key: 'seed_tomato', prob: 15, minLv: 1 },
    { name: '🌿 약초 씨앗', key: 'seed_herb', prob: 20, minLv: 2 }
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
    roomTabs: document.querySelectorAll('.room-tab'),
    roomViews: {
        'room-bed': document.getElementById('view-room-bed'),
        'room-desk': document.getElementById('view-room-desk'),
        'room-table': document.getElementById('view-room-table'),
        'room-dummy': document.getElementById('view-room-dummy')
    },
    slots: {
        'room-table': document.getElementById('slot-kitchen'),
        'room-desk': document.getElementById('slot-study'),
        'room-dummy': document.getElementById('slot-training'),
        'room-bed': document.getElementById('slot-wardrobe')
    },
    invModal: document.getElementById('inv-modal'),
    invList: document.getElementById('inv-list'),
    weaponInventoryList: document.getElementById('weapon-inventory-list'),
    sysTabs: document.querySelectorAll('.sys-tab'),
    sysContents: document.querySelectorAll('.sys-content'),
    btnWork: document.getElementById('btn-work'),
    btnGacha: document.getElementById('btn-gacha'),
    gachaResult: document.getElementById('gacha-result'),
    mailList: document.querySelector('.mail-list'),
    questAlert: document.getElementById('quest-alert'),
    questTimer: document.getElementById('quest-timer'),
    questModal: document.getElementById('quest-modal'),
    questModalTimer: document.getElementById('quest-modal-timer'),
    questDesc: document.getElementById('quest-desc'),
    btnQuestAccept: document.getElementById('btn-quest-accept'),
    sonStateLabel: document.getElementById('son-state-label'),
    // New elements
    adventureView: document.getElementById('adventure-view'),
    advSceneEmoji: document.getElementById('adv-scene-emoji'),
    advSceneText: document.getElementById('adv-scene-text'),
    advSceneSub: document.getElementById('adv-scene-sub'),
    advProgress: document.getElementById('adv-progress'),
    btnEncourage: document.getElementById('btn-encourage'),
    farmGrid: document.getElementById('farm-grid'),
    cookList: document.getElementById('cook-list')
};

const weaponsList = [
    { name: '낡은 목검', atk: 2, tier: 'C', prob: 50 },
    { name: '강철 단검', atk: 5, tier: 'B', prob: 30 },
    { name: '기사의 장검', atk: 20, tier: 'A', prob: 15 },
    { name: '🗡️ 드래곤 슬레이어', atk: 100, tier: 'S', prob: 5 }
];

// --- Son Dialogues ---
const sonDialogues = {
    'SLEEPING': ["zzZ...", "음냐음냐...", "5분만 더..."],
    'EATING': ["냠냠!", "맛있다~", "엄마 요리 최고!"],
    'TRAINING': ["하앗!", "이얍!", "더 강해져야 해!"],
    'STUDYING': ["음... 이건 뭐지?", "머리가 아파...", "아 재밌다!"],
    'IDLE': ["심심해~", "뭐 할 거 없나...", "엄마 뭐해?", "모험 가고 싶다!"],
    'ADVENTURING': ["모험 중!", "몬스터다!", "앞으로!"]
};

// --- Adventure Scenes ---
const adventureScenes = [
    { tick: 0, emoji: '🚶', text: '아들이 모험을 떠났습니다', sub: '마을을 벗어나는 중...' },
    { tick: 8, emoji: '🌲', text: '숲 입구에 도착!', sub: '조심조심 들어가는 중' },
    { tick: 15, emoji: '🐺', text: '늑대 무리와 조우!', sub: '전투 중...' },
    { tick: 22, emoji: '⚔️', text: '늑대를 물리쳤다!', sub: '전리품을 줍는 중' },
    { tick: 30, emoji: '🏔️', text: '산 중턱에 도달', sub: '더 깊이 탐험하는 중...' },
    { tick: 38, emoji: '🐉', text: '강적 등장!', sub: '필사적으로 싸우는 중!' },
    { tick: 48, emoji: '🏆', text: '승리! 보물 발견!', sub: '귀환 준비 중...' },
    { tick: 55, emoji: '🏠', text: '집으로 돌아오는 중', sub: '곧 도착합니다...' }
];

// ============================================================
// UI Navigation
// ============================================================
els.roomTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        els.roomTabs.forEach(t => t.classList.remove('active'));
        Object.values(els.roomViews).forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        const roomId = tab.getAttribute('data-room');
        els.roomViews[roomId].classList.add('active');
        updateUpgradeButtons(roomId);
    });
});
els.sysTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        els.sysTabs.forEach(t => t.classList.remove('active'));
        els.sysContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.getAttribute('data-sys')).classList.add('active');
    });
});

// ============================================================
// Toast-based Buy / Inventory
// ============================================================
let currentTargetRoom = null;

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

function openInventory(roomType) {
    currentTargetRoom = roomType === 'kitchen' ? 'room-table' : roomType === 'study' ? 'room-desk' : roomType === 'training' ? 'room-dummy' : 'room-bed';
    els.invList.innerHTML = '';
    let hasItems = false;

    if (roomType === 'weapon') {
        Object.keys(gameState.parent.weaponInventory).forEach(tier => {
            const item = gameState.parent.weaponInventory[tier];
            if (item.count > 0) {
                hasItems = true;
                const btn = document.createElement('button');
                btn.className = 'item-btn';
                btn.innerText = `[${tier}급] ${item.name} (보유: ${item.count})`;
                btn.onclick = () => equipWeapon(tier);
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

function equipWeapon(tier) {
    if (gameState.parent.weaponInventory[tier].count > 0) {
        gameState.parent.weaponInventory[tier].count--;
        const currentTier = gameState.son.weapon.tier;
        gameState.parent.weaponInventory[currentTier].count++;
        gameState.son.weapon = { name: gameState.parent.weaponInventory[tier].name, atk: gameState.parent.weaponInventory[tier].atk, tier: tier };
        closeInventory();
        updateUI();
        sonSpeech("우와 새 장비다!!");
        showToast(`${gameState.parent.weaponInventory[tier].name} 장착!`, 'success');
    }
}

function closeInventory() { els.invModal.style.display = 'none'; }
window.closeInventory = closeInventory;

function placeItem(itemId) {
    if (gameState.parent.inventory[itemId].count > 0) {
        gameState.parent.inventory[itemId].count--;
        gameState.rooms[currentTargetRoom].placedItem = itemId;
        const slotEl = els.slots[currentTargetRoom];
        slotEl.innerHTML = `<div>${gameState.parent.inventory[itemId].name.split(' ')[0]}</div>`;
        slotEl.classList.add('filled');
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
        let html = `<span style="font-size:0.85rem">[${tier}] ${item.name}: ${item.count}개</span>`;
        if (nextTier && item.count >= 3) {
            html += `<button class="action-btn" style="width:auto; padding:4px 10px; margin:0; font-size:0.75rem; background:#8b5cf6;" onclick="synthesizeWeapon('${tier}', '${nextTier}')">합성 (3개)</button>`;
        } else if (nextTier) {
            html += `<span style="font-size:0.7rem; color:#94a3b8">${item.count}/3</span>`;
        }
        div.innerHTML = html;
        els.weaponInventoryList.appendChild(div);
    });
}
window.synthesizeWeapon = function(currentTier, nextTier) {
    if (gameState.parent.weaponInventory[currentTier].count >= 3) {
        gameState.parent.weaponInventory[currentTier].count -= 3;
        gameState.parent.weaponInventory[nextTier].count++;
        showToast(`[${nextTier}급] ${gameState.parent.weaponInventory[nextTier].name} 합성 성공!`, 'gold');
        updateUI();
    }
};

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
    const cost = data.costs[currentLv]; // cost for NEXT level
    if (gameState.parent.gold >= cost) {
        gameState.parent.gold -= cost;
        gameState.parent.upgrades[type]++;
        const newLv = gameState.parent.upgrades[type];
        showToast(`${data.emoji} ${data.names[newLv]} (으)로 업그레이드! Lv.${newLv}`, 'gold');
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
        btn.innerText = `⬆️ ${data.names[lv + 1]} 업그레이드 (${data.costs[lv]}G)`;
        btn.style.display = 'block';
    }
}

// ============================================================
// Quest System
// ============================================================
const questDB = [
    { type: 'money', desc: "엄마, 저 용돈 100골드만 주세요!", timer: 15, reqGold: 100 },
    { type: 'food', desc: "엄마 배고파요. 뭐 좀 먹을 거 주세요!", timer: 30, reqItem: 'steak' }
];

function triggerRandomQuest() {
    if (gameState.son.quest || Math.random() > 0.1) return;
    const q = questDB[Math.floor(Math.random() * questDB.length)];
    gameState.son.quest = { ...q, active: true };
    sonSpeech("엄마!! 부탁이 있어요!");
    updateUI();
}

function handleQuestTick() {
    if (!gameState.son.quest) return;
    gameState.son.quest.timer--;
    if (gameState.son.quest.timer <= 0) {
        sonSpeech("치.. 엄마 미워!");
        addMail("부탁 거절", "아들의 부탁을 들어주지 않아 ⚡반항심이 올랐습니다.");
        gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 15);
        gameState.son.affinity.affection = Math.max(0, gameState.son.affinity.affection - 5);
        closeQuestModal();
        gameState.son.quest = null;
    }
    updateUI();
}

function openQuestModal() {
    const q = gameState.son.quest;
    if (!q) return;
    els.questDesc.innerText = q.desc;
    els.btnQuestAccept.onclick = acceptQuest;
    els.questModal.style.display = 'flex';
}
window.openQuestModal = openQuestModal;

function closeQuestModal() { els.questModal.style.display = 'none'; }

function acceptQuest() {
    const q = gameState.son.quest;
    let success = false;
    if (q.type === 'money' && gameState.parent.gold >= q.reqGold) {
        gameState.parent.gold -= q.reqGold;
        success = true;
    } else if (q.type === 'food') {
        // Check inventory for any kitchen item
        const kitchenItems = Object.keys(gameState.parent.inventory).filter(k => gameState.parent.inventory[k].type === 'kitchen' && gameState.parent.inventory[k].count > 0);
        if (kitchenItems.length > 0) {
            gameState.parent.inventory[kitchenItems[0]].count--;
            success = true;
        } else if (gameState.rooms['room-table'].placedItem) {
            gameState.rooms['room-table'].placedItem = null;
            els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`;
            els.slots['room-table'].classList.remove('filled');
            success = true;
        }
    }
    if (success) {
        sonSpeech("우와! 엄마 최고 사랑해요!!");
        gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 10);
        gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 5);
        gameState.son.affinity.rebellion = Math.max(0, gameState.son.affinity.rebellion - 10);
        showToast("아들의 부탁을 들어줬습니다! ❤️", 'success');
        closeQuestModal();
        gameState.son.quest = null;
        updateUI();
    } else {
        showToast("조건을 만족하지 못했습니다!", 'error');
    }
}

function rejectQuest() {
    sonSpeech("엄마 미워!!");
    gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 10);
    showToast("아들이 실망했습니다... ⚡반항심 +10", 'warning');
    closeQuestModal();
    gameState.son.quest = null;
    updateUI();
}
window.rejectQuest = rejectQuest;

// ============================================================
// Core UI Update
// ============================================================
function updateUI() {
    try {
        els.gold.innerText = gameState.parent.gold;
        els.sonLevel.innerText = `(Lv. ${gameState.son.level})`;
        els.sonWeapon.innerText = `${gameState.son.weapon.name} (공+${gameState.son.weapon.atk})`;
        els.sonWeapon.className = `weapon-badge tier-${gameState.son.weapon.tier}`;
        els.barHp.style.width = `${(gameState.son.hp / gameState.son.maxHp) * 100}%`;
        els.barHunger.style.width = `${(gameState.son.hunger / gameState.son.maxHunger) * 100}%`;
        els.barExp.style.width = `${(gameState.son.exp / gameState.son.maxExp) * 100}%`;

        // Affinity
        els.affTrust.innerText = gameState.son.affinity.trust;
        els.affAffection.innerText = gameState.son.affinity.affection;
        els.affRebellion.innerText = gameState.son.affinity.rebellion;

        // Quest Alert
        if (gameState.son.quest) {
            els.questAlert.style.display = 'block';
            els.questTimer.innerText = gameState.son.quest.timer;
            if (els.questModal && els.questModal.style.display === 'flex' && els.questModalTimer) {
                els.questModalTimer.innerText = gameState.son.quest.timer;
            }
        } else {
            if (els.questAlert) els.questAlert.style.display = 'none';
        }

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
                'ADVENTURING': '🏃‍♂️ 모험 중!',
                'IDLE': '대기 중'
            };
            els.sonStateLabel.innerText = shortStates[gameState.son.state] || '대기 중';
        }

        // Furniture levels
        ['bed', 'desk', 'table', 'dummy'].forEach(t => {
            const el = document.getElementById(`lvl-${t}`);
            if (el) el.innerText = gameState.parent.upgrades[t];
        });

        // Adventure view toggle
        if (gameState.son.state === 'ADVENTURING') {
            if (els.adventureView) els.adventureView.classList.add('active');
        } else {
            if (els.adventureView) els.adventureView.classList.remove('active');
        }

        // Refresh sub-UIs
        if (typeof updateSynthesisUI !== 'undefined') updateSynthesisUI();
        updateUpgradeButtons(getActiveRoom());
        updateFarmUI();
        updateCookUI();
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

function addMail(title, text, isGold = false) {
    const li = document.createElement('li');
    li.className = 'mail-item';
    li.style.cssText = 'padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px;';
    li.innerHTML = `<strong style="color: ${isGold ? '#eab308' : '#334155'}">${title}</strong><br><span style="font-size: 0.85rem">${text}</span>`;
    els.mailList.prepend(li);
    if (els.mailList.children.length > 15) els.mailList.removeChild(els.mailList.lastChild);
}

// ============================================================
// #4 — Dynamic Adventure with Live View + Loot + Encourage
// ============================================================
let adventureInterval = null;

function startAdventure() {
    gameState.son.state = 'ADVENTURING';
    gameState.son.adventureEncouraged = false;
    if (els.sprite) els.sprite.style.display = 'none';
    if (els.btnEncourage) els.btnEncourage.disabled = false;

    const cp = gameState.son.level * gameState.son.weapon.atk;
    addMail("🏃‍♂️ 외출", `아들이 모험을 떠났습니다! (전투력: ${cp})`);
    updateUI();

    // Update scene on first tick
    updateAdventureScene(0);

    let ticks = 0;
    const totalTicks = 60;

    adventureInterval = setInterval(() => {
        ticks++;
        // Update progress bar
        if (els.advProgress) els.advProgress.style.width = `${(ticks / totalTicks) * 100}%`;

        // Update scene based on tick
        updateAdventureScene(ticks);

        if (ticks >= totalTicks) {
            clearInterval(adventureInterval);
            adventureInterval = null;
            completeAdventure(cp);
        }
    }, 1000);
}

function updateAdventureScene(tick) {
    let scene = adventureScenes[0];
    for (const s of adventureScenes) {
        if (tick >= s.tick) scene = s;
    }
    if (els.advSceneEmoji) els.advSceneEmoji.innerText = scene.emoji;
    if (els.advSceneText) els.advSceneText.innerText = scene.text;
    if (els.advSceneSub) els.advSceneSub.innerText = scene.sub;
}

function encourageSon() {
    if (gameState.son.adventureEncouraged) return;
    gameState.son.adventureEncouraged = true;
    if (els.btnEncourage) els.btnEncourage.disabled = true;
    showToast("💌 아들에게 응원 편지를 보냈습니다!", 'info');
    gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 3);
    gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 2);
    addMail("💌 응원 편지", "아들에게 응원 편지를 보냈습니다. 다음 모험에서 더 좋은 결과가...");
}
window.encourageSon = encourageSon;

function completeAdventure(cp) {
    // --- #2 Loot diversification ---
    const earnedGold = Math.floor(cp * 5) + Math.floor(Math.random() * 200) + 50;
    const encourageBonus = gameState.son.adventureEncouraged ? 1.2 : 1.0;
    const finalGold = Math.floor(earnedGold * encourageBonus);

    // Roll loot
    const lootResults = [];
    for (const item of lootTable) {
        if (gameState.son.level >= item.minLv && Math.random() * 100 < item.prob) {
            const amount = 1 + Math.floor(Math.random() * 2);
            // Seeds go to farm
            if (item.key.startsWith('seed_')) {
                const seedType = item.key.replace('seed_', '');
                const seedMap = { 'carrot': 'carrot', 'tomato': 'tomato', 'herb': 'herb_seed' };
                const seedKey = seedMap[seedType];
                if (seedKey && gameState.parent.farm.seeds[seedKey]) {
                    gameState.parent.farm.seeds[seedKey].count += amount;
                }
            } else {
                gameState.parent.loot[item.key].count += amount;
            }
            lootResults.push(`${item.name} x${amount}`);
        }
    }

    // EXP from adventure
    const adventureExp = 20 + (gameState.son.level * 5);
    gameState.son.exp += adventureExp;

    gameState.son.hp = Math.max(15, Math.floor(gameState.son.maxHp * 0.2));
    gameState.son.hunger = Math.max(15, Math.floor(gameState.son.maxHunger * 0.2));
    gameState.parent.gold += finalGold;
    gameState.son.state = 'IDLE';
    gameState.son.actionTimer = 0;
    if (els.sprite) els.sprite.style.display = 'block';

    // Build loot message
    let lootMsg = `<b>💰 +${finalGold} 골드</b> | ⭐ +${adventureExp} EXP`;
    if (lootResults.length > 0) {
        lootMsg += `<br>📦 전리품: ${lootResults.join(', ')}`;
    }
    if (gameState.son.adventureEncouraged) {
        lootMsg += `<br>💌 응원 보너스 적용! (+20%)`;
    }
    addMail("🏆 귀환 완료!", lootMsg, true);
    showToast(`귀환! +${finalGold}G ${lootResults.length > 0 ? '+ 전리품 ' + lootResults.length + '종' : ''}`, 'gold');

    // Gold pop animation
    els.gold.classList.add('gold-pop');
    setTimeout(() => els.gold.classList.remove('gold-pop'), 500);

    if (!gameState.firstAdventureDone) {
        gameState.firstAdventureDone = true;
        showToast("💡 첫 모험 완료! 아들을 돌봐주세요", 'info');
    }

    checkLevelUp();
    updateUI();
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

    if (gameState.son.state === 'SLEEPING') {
        const recovery = upgradeData.bed.effects[bedLv - 1] + healBonus;
        sonSpeech("잘 잤다!");
        gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + recovery);
    } else if (gameState.son.state === 'EATING') {
        const placed = gameState.rooms['room-table'].placedItem;
        if (placed === 'steak') {
            sonSpeech("스테이크 최고!");
            gameState.son.hunger = gameState.son.maxHunger;
            gameState.son.exp += 30;
            gameState.rooms['room-table'].placedItem = null;
            els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`;
            els.slots['room-table'].classList.remove('filled');
        } else if (placed === 'homemade_meal') {
            sonSpeech("엄마 집밥 최고!!");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 80);
            gameState.son.exp += 15;
            gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 3);
            gameState.rooms['room-table'].placedItem = null;
            els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`;
            els.slots['room-table'].classList.remove('filled');
        } else if (placed === 'herb_potion') {
            sonSpeech("약초 물약... 쓰다!");
            gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + 60);
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 20);
            gameState.rooms['room-table'].placedItem = null;
            els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`;
            els.slots['room-table'].classList.remove('filled');
        } else {
            const recovery = upgradeData.table.effects[tableLv - 1] + healBonus;
            sonSpeech("밥 다 먹었다...");
            gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + recovery);
        }
    } else if (gameState.son.state === 'TRAINING') {
        const baseExp = upgradeData.dummy.effects[dummyLv - 1];
        if (gameState.rooms['room-dummy'].placedItem === 'sandbag') {
            sonSpeech("모래주머니 훈련 끝!");
            gameState.son.exp += baseExp + 50;
            gameState.rooms['room-dummy'].placedItem = null;
            els.slots['room-dummy'].innerHTML = `<span class="slot-label">빈 슬롯</span>➕`;
            els.slots['room-dummy'].classList.remove('filled');
        } else {
            sonSpeech("기본 훈련 끝!");
            gameState.son.exp += baseExp;
        }
    } else if (gameState.son.state === 'STUDYING') {
        const baseExp = upgradeData.desk.effects[deskLv - 1];
        if (gameState.rooms['room-desk'].placedItem === 'book_hero') {
            sonSpeech("영웅학 개론 독파!");
            gameState.son.exp += baseExp + 80;
            gameState.rooms['room-desk'].placedItem = null;
            els.slots['room-desk'].innerHTML = `<span class="slot-label">빈 슬롯</span>➕`;
            els.slots['room-desk'].classList.remove('filled');
        } else {
            sonSpeech("공부 끝...");
            gameState.son.exp += baseExp;
        }
    }
    gameState.son.state = 'IDLE';
}

function sonAI() {
    // 1. Adventuring
    if (gameState.son.state === 'ADVENTURING') {
        if (gameState.son.quest) handleQuestTick();
        return;
    }

    // 2. Action timer tick
    if (gameState.son.actionTimer > 0) {
        gameState.son.actionTimer--;
        if (gameState.son.state === 'TRAINING') { gameState.son.hp -= 1; gameState.son.hunger -= 1; }
        if (gameState.son.state === 'STUDYING') { gameState.son.hunger -= 0.5; }

        if (Math.random() < 0.1 && gameState.son.actionTimer > 3) {
            const dialogues = sonDialogues[gameState.son.state] || sonDialogues['IDLE'];
            sonSpeech(dialogues[Math.floor(Math.random() * dialogues.length)]);
        }
        if (gameState.son.actionTimer <= 0) handleActionCompletion();
        if (gameState.son.hp < 0) gameState.son.hp = 0;
        if (gameState.son.hunger < 0) gameState.son.hunger = 0;
        checkLevelUp();
        if (gameState.son.quest) handleQuestTick();
        updateUI();
        return;
    }

    // 3. Decision making
    if (gameState.son.quest) handleQuestTick();

    // #1 fix: Adventure only when 80% AND first cycle done (son needs care first)
    if (gameState.son.hp >= (gameState.son.maxHp * 0.8) && gameState.son.hunger >= (gameState.son.maxHunger * 0.8)) {
        startAdventure();
        return;
    }

    triggerRandomQuest();

    // Passive hunger/hp drain when idle
    gameState.son.hunger = Math.max(0, gameState.son.hunger - 0.3);

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
            if (Math.random() > 0.5) {
                gameState.son.state = 'TRAINING';
                moveToRoom('room-dummy');
                gameState.son.actionTimer = 20;
                sonSpeech("훈련을 시작하지!");
            } else {
                gameState.son.state = 'STUDYING';
                moveToRoom('room-desk');
                gameState.son.actionTimer = 20;
                sonSpeech("책 좀 읽어볼까.");
            }
        }
    }
    updateUI();
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
const seedShopItems = [
    { key: 'carrot', name: '🥕 당근 씨앗', cost: 30 },
    { key: 'tomato', name: '🍅 토마토 씨앗', cost: 50 },
    { key: 'herb_seed', name: '🌿 약초 씨앗', cost: 80 }
];

function updateFarmUI() {
    if (!els.farmGrid) return;
    els.farmGrid.innerHTML = '';
    gameState.parent.farm.plots.forEach((plot, i) => {
        const div = document.createElement('div');
        div.className = 'farm-plot';
        if (plot.state === 'growing') {
            div.classList.add('growing');
            const seed = gameState.parent.farm.seeds[plot.seedType];
            div.innerHTML = `<div class="farm-plot-emoji">🌱</div><div class="farm-plot-timer">${plot.timer}초</div>`;
        } else if (plot.state === 'ready') {
            div.classList.add('ready');
            const seed = gameState.parent.farm.seeds[plot.seedType];
            div.innerHTML = `<div class="farm-plot-emoji">${seed.emoji}</div><div style="font-size:0.7rem;color:#f59e0b;font-weight:bold;">수확!</div>`;
            div.onclick = () => harvestPlot(i);
        } else {
            div.innerHTML = `<div class="farm-plot-emoji">🟫</div><div>빈 밭</div>`;
            div.onclick = () => showSeedPicker(i);
        }
        els.farmGrid.appendChild(div);
    });

    // Show seed inventory below
    const seedInfo = document.createElement('div');
    seedInfo.style.cssText = 'margin-top:8px; font-size:0.75rem; color:#64748b; display:flex; gap:10px; flex-wrap:wrap;';
    Object.keys(gameState.parent.farm.seeds).forEach(k => {
        const s = gameState.parent.farm.seeds[k];
        seedInfo.innerHTML += `<span>${s.emoji || '🌱'} ${s.name.split(' ')[1] || k}: ${s.count}개</span>`;
    });
    els.farmGrid.appendChild(seedInfo);
}

function showSeedPicker(plotIndex) {
    els.invList.innerHTML = '<h4 style="margin-bottom:10px;">씨앗 선택</h4>';
    let hasSeeds = false;

    Object.keys(gameState.parent.farm.seeds).forEach(key => {
        const seed = gameState.parent.farm.seeds[key];
        if (seed.count > 0) {
            hasSeeds = true;
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.innerText = `${seed.name} (보유: ${seed.count}) - ${seed.growTime}초`;
            btn.onclick = () => plantSeed(plotIndex, key);
            els.invList.appendChild(btn);
        }
    });

    // Buy seeds option
    const buyHeader = document.createElement('h4');
    buyHeader.style.cssText = 'margin-top:12px; margin-bottom:8px; font-size:0.85rem; color:#475569;';
    buyHeader.innerText = '씨앗 구매';
    els.invList.appendChild(buyHeader);

    seedShopItems.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'item-btn';
        btn.style.fontSize = '0.8rem';
        btn.innerText = `${item.name} 구매 (${item.cost}G)`;
        btn.onclick = () => {
            if (gameState.parent.gold >= item.cost) {
                gameState.parent.gold -= item.cost;
                gameState.parent.farm.seeds[item.key].count++;
                showToast(`${item.name} 구매!`, 'success');
                showSeedPicker(plotIndex); // Refresh
                updateUI();
            } else {
                showToast('골드 부족!', 'error');
            }
        };
        els.invList.appendChild(btn);
    });

    if (!hasSeeds) {
        const p = document.createElement('p');
        p.style.cssText = 'color:#ef4444; font-size:0.85rem; margin-bottom:8px;';
        p.innerText = '보유 중인 씨앗이 없습니다.';
        els.invList.prepend(p);
    }

    els.invModal.style.display = 'flex';
}

function plantSeed(plotIndex, seedKey) {
    const seed = gameState.parent.farm.seeds[seedKey];
    if (seed.count <= 0) return;
    seed.count--;
    gameState.parent.farm.plots[plotIndex] = { state: 'growing', seedType: seedKey, timer: seed.growTime };
    closeInventory();
    showToast(`${seed.name} 심기 완료!`, 'success');
    updateUI();
}

function harvestPlot(plotIndex) {
    const plot = gameState.parent.farm.plots[plotIndex];
    if (plot.state !== 'ready') return;

    const seed = gameState.parent.farm.seeds[plot.seedType];
    // Harvest gives the ingredient (stored in loot for recipes)
    const harvestMap = {
        'carrot': { lootKey: null, invKey: null, name: '🥕 당근' },
        'tomato': { lootKey: null, invKey: null, name: '🍅 토마토' },
        'herb_seed': { lootKey: 'herb', invKey: null, name: '🌿 약초' }
    };

    // For carrot/tomato, we store harvest count in seeds themselves as "harvest"
    // Simpler: add to a harvestBag
    if (!gameState.parent.harvestBag) gameState.parent.harvestBag = {};
    const bagKey = plot.seedType;
    if (!gameState.parent.harvestBag[bagKey]) gameState.parent.harvestBag[bagKey] = 0;
    const amount = 1 + Math.floor(Math.random() * 2);
    gameState.parent.harvestBag[bagKey] += amount;

    // Herb also adds to loot
    if (plot.seedType === 'herb_seed') {
        gameState.parent.loot.herb.count += amount;
    }

    showToast(`${seed.emoji} 수확! x${amount}`, 'success');
    gameState.parent.farm.plots[plotIndex] = { state: 'empty', seedType: null, timer: 0 };
    updateUI();
}

function farmTick() {
    gameState.parent.farm.plots.forEach((plot, i) => {
        if (plot.state === 'growing') {
            plot.timer--;
            if (plot.timer <= 0) {
                plot.state = 'ready';
            }
        }
    });
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
            const seedName = gameState.parent.farm.seeds[k]?.name?.split(' ')[1] || k;
            return `<span style="color:${color}">${seedName} ${have}/${v}</span>`;
        }).join(' ');

        const canCook = Object.entries(recipe.needs).every(([k, v]) => (gameState.parent.harvestBag[k] || 0) >= v);

        div.innerHTML = `
            <div style="font-size:0.8rem;">
                <b>${recipe.name}</b> <span style="color:#64748b; font-size:0.75rem;">(${recipe.desc})</span><br>
                <span style="font-size:0.75rem;">${needsText}</span>
            </div>
            ${canCook ? `<button class="action-btn" style="width:auto; padding:4px 12px; margin:0; font-size:0.75rem; background:#10b981;" onclick="cookRecipe('${recipe.id}')">요리</button>` : ''}
        `;
        els.cookList.appendChild(div);
    });
}

function cookRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    const canCook = Object.entries(recipe.needs).every(([k, v]) => (gameState.parent.harvestBag[k] || 0) >= v);
    if (!canCook) {
        showToast("재료가 부족합니다!", 'error');
        return;
    }
    // Consume ingredients
    Object.entries(recipe.needs).forEach(([k, v]) => {
        gameState.parent.harvestBag[k] -= v;
    });
    // Add to inventory
    gameState.parent.inventory[recipeId].count++;
    showToast(`${recipe.name} 요리 완료!`, 'success');
    updateUI();
}
window.cookRecipe = cookRecipe;

// ============================================================
// Gacha & Work
// ============================================================
els.btnGacha.addEventListener('click', () => {
    if (gameState.parent.gold >= 1000) {
        gameState.parent.gold -= 1000;
        const rand = Math.floor(Math.random() * 100);
        let picked = weaponsList[0];
        let curProb = 0;
        for (let w of weaponsList) { curProb += w.prob; if (rand < curProb) { picked = w; break; } }
        gameState.parent.weaponInventory[picked.tier].count++;
        els.gachaResult.style.display = 'block';
        els.gachaResult.innerHTML = `망치질을 하는 중... 🔨`;
        els.btnGacha.disabled = true;
        setTimeout(() => {
            els.gachaResult.innerHTML = `[${picked.tier}급] ${picked.name} 획득! → 옷장에 보관됨`;
            els.gachaResult.className = `gacha-result tier-${picked.tier}`;
            els.btnGacha.disabled = false;
            showToast(`[${picked.tier}급] ${picked.name} 획득!`, picked.tier === 'S' ? 'gold' : picked.tier === 'A' ? 'levelup' : 'info');
            updateUI();
        }, 1500);
    } else {
        showToast("골드 부족! (1,000G 필요)", 'error');
    }
});

els.btnWork.addEventListener('click', () => {
    gameState.parent.gold += 10;
    els.gold.classList.add('gold-pop');
    setTimeout(() => els.gold.classList.remove('gold-pop'), 500);
    updateUI();
});

// ============================================================
// Initialization
// ============================================================
console.log("Hero Mom Prototype v2 - Enhanced Loaded.");

// #1 Fix: Son starts with lower HP/hunger, needing care before first adventure
sonSpeech("엄마... 배고프고 졸려요...");
addMail("📖 시작", "아들이 피곤하고 배고파합니다. 밥을 차리고 침대를 마련해주세요!");

moveToRoom(gameState.son.currentRoom);
updateUpgradeButtons(getActiveRoom());
updateUI();

// Main game loop (1 second)
setInterval(() => {
    sonAI();
    farmTick();
    updateFarmUI();
}, 1000);
