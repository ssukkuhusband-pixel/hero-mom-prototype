// --- Game State ---
const gameState = {
    parent: { gold: 1500, upgrades: { bed: 1, table: 1, dummy: 1 },
        inventory: {
            'steak': { name: '🥩 최고급 스테이크', count: 0, type: 'kitchen' },
            'book_hero': { name: '📘 영웅학 개론', count: 0, type: 'study' },
            'sandbag': { name: '🏋️ 모래주머니', count: 0, type: 'training' }
        }
    },
    rooms: { 'room-bed': { placedItem: null }, 'room-table': { placedItem: null }, 'room-desk': { placedItem: null }, 'room-dummy': { placedItem: null } },
    son: {
        level: 1, exp: 0, maxExp: 100, hp: 100, maxHp: 100, hunger: 100, maxHunger: 100,
        state: 'IDLE', currentRoom: 'room-desk', weapon: { name: '몽둥이', atk: 1, tier: 'C' }, actionTimer: 0,
        affinity: { trust: 50, affection: 50, rebellion: 0 },
        quest: null // { active: false, type: '', timer: 0, desc: '' }
    }
};

// --- DOM Elements ---
const els = {
    gold: document.getElementById('res-gold'), sonLevel: document.getElementById('son-level'), sonWeapon: document.getElementById('son-weapon'),
    barHp: document.getElementById('bar-hp'), barHunger: document.getElementById('bar-hunger'), barExp: document.getElementById('bar-exp'),
    affTrust: document.getElementById('aff-trust'), affAffection: document.getElementById('aff-affection'), affRebellion: document.getElementById('aff-rebellion'),
    sprite: document.getElementById('son-sprite'), speech: document.getElementById('son-speech'),
    roomTabs: document.querySelectorAll('.room-tab'), roomViews: { 'room-bed': document.getElementById('view-room-bed'), 'room-desk': document.getElementById('view-room-desk'), 'room-table': document.getElementById('view-room-table'), 'room-dummy': document.getElementById('view-room-dummy') },
    slots: { 'room-table': document.getElementById('slot-kitchen'), 'room-desk': document.getElementById('slot-study'), 'room-dummy': document.getElementById('slot-training') },
    invModal: document.getElementById('inv-modal'), invList: document.getElementById('inv-list'),
    sysTabs: document.querySelectorAll('.sys-tab'), sysContents: document.querySelectorAll('.sys-content'),
    btnWork: document.getElementById('btn-work'), btnGacha: document.getElementById('btn-gacha'), gachaResult: document.getElementById('gacha-result'), mailList: document.querySelector('.mail-list'),
    questAlert: document.getElementById('quest-alert'), questTimer: document.getElementById('quest-timer'),
    questModal: document.getElementById('quest-modal'), questModalTimer: document.getElementById('quest-modal-timer'), questDesc: document.getElementById('quest-desc'), btnQuestAccept: document.getElementById('btn-quest-accept')
};

const weaponsList = [ { name: '낡은 목검', atk: 2, tier: 'C', prob: 50 }, { name: '강철 단검', atk: 5, tier: 'B', prob: 30 }, { name: '기사의 장검', atk: 20, tier: 'A', prob: 15 }, { name: '🗡️ 드래곤 슬레이어', atk: 100, tier: 'S', prob: 5 } ];

// --- UI Navigation ---
els.roomTabs.forEach(tab => { tab.addEventListener('click', () => { els.roomTabs.forEach(t => t.classList.remove('active')); Object.values(els.roomViews).forEach(v => v.classList.remove('active')); tab.classList.add('active'); els.roomViews[tab.getAttribute('data-room')].classList.add('active'); }); });
els.sysTabs.forEach(tab => { tab.addEventListener('click', () => { els.sysTabs.forEach(t => t.classList.remove('active')); els.sysContents.forEach(c => c.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.getAttribute('data-sys')).classList.add('active'); }); });

// --- Inventory ---
let currentTargetRoom = null;
function buyItem(itemId, cost) { if (gameState.parent.gold >= cost) { gameState.parent.gold -= cost; gameState.parent.inventory[itemId].count++; updateUI(); alert(`${gameState.parent.inventory[itemId].name} 구매 완료!`); } else alert("골드가 부족합니다!"); } window.buyItem = buyItem;
function openInventory(roomType) { currentTargetRoom = roomType === 'kitchen' ? 'room-table' : roomType === 'study' ? 'room-desk' : 'room-dummy'; els.invList.innerHTML = ''; let hasItems = false; Object.keys(gameState.parent.inventory).forEach(key => { const item = gameState.parent.inventory[key]; if (item.type === roomType && item.count > 0) { hasItems = true; const btn = document.createElement('button'); btn.className = 'item-btn'; btn.innerText = `${item.name} (보유: ${item.count})`; btn.onclick = () => placeItem(key); els.invList.appendChild(btn); } }); if(!hasItems) els.invList.innerHTML = '<p style="color:#ef4444; font-weight:bold;">배치할 수 있는 아이템이 없습니다.</p>'; els.invModal.style.display = 'flex'; } window.openInventory = openInventory;
function closeInventory() { els.invModal.style.display = 'none'; } window.closeInventory = closeInventory;
function placeItem(itemId) { if(gameState.parent.inventory[itemId].count > 0) { gameState.parent.inventory[itemId].count--; gameState.rooms[currentTargetRoom].placedItem = itemId; const slotEl = els.slots[currentTargetRoom]; slotEl.innerHTML = `<div>${gameState.parent.inventory[itemId].name.split(' ')[0]}</div>`; slotEl.classList.add('filled'); closeInventory(); updateUI(); } }

// --- Quest System ---
const questDB = [
    { type: 'money', desc: "엄마, 저 용돈 100골드만 주세요!", timer: 15, reqGold: 100 },
    { type: 'food', desc: "엄마 배고파요. 인벤토리에 '스테이크' 하나만 사주세요!", timer: 30, reqItem: 'steak' }
];

function triggerRandomQuest() {
    if (gameState.son.quest || Math.random() > 0.1) return; // 10% chance per tick when IDLE
    const q = questDB[Math.floor(Math.random() * questDB.length)];
    gameState.son.quest = { ...q, active: true };
    sonSpeech("엄마!! 부탁이 있어요!");
    updateUI();
}

function handleQuestTick() {
    if (!gameState.son.quest) return;
    gameState.son.quest.timer--;
    if (gameState.son.quest.timer <= 0) {
        // Fail
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
    if(!q) return;
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
        gameState.parent.gold -= q.reqGold; success = true;
    } else if (q.type === 'food' && gameState.parent.inventory['steak'].count > 0) {
        gameState.parent.inventory['steak'].count--; success = true;
    } else if (q.type === 'food' && gameState.rooms['room-table'].placedItem === 'steak') {
        gameState.rooms['room-table'].placedItem = null; // Eat it from table
        els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`; els.slots['room-table'].classList.remove('filled');
        success = true;
    }
    
    if (success) {
        sonSpeech("우와! 엄마 최고 사랑해요!!");
        gameState.son.affinity.affection = Math.min(100, gameState.son.affinity.affection + 10);
        gameState.son.affinity.trust = Math.min(100, gameState.son.affinity.trust + 5);
        gameState.son.affinity.rebellion = Math.max(0, gameState.son.affinity.rebellion - 10);
        closeQuestModal();
        gameState.son.quest = null;
        updateUI();
    } else {
        alert("조건을 만족하지 못했습니다! (돈 부족 또는 아이템 없음)");
    }
}

function rejectQuest() {
    sonSpeech("엄마 미워!!");
    gameState.son.affinity.rebellion = Math.min(100, gameState.son.affinity.rebellion + 10);
    closeQuestModal();
    gameState.son.quest = null;
    updateUI();
}
window.rejectQuest = rejectQuest;

// --- Core UI Update ---
function updateUI() {
    els.gold.innerText = gameState.parent.gold; els.sonLevel.innerText = `(Lv. ${gameState.son.level})`;
    els.sonWeapon.innerText = `${gameState.son.weapon.name} (공+${gameState.son.weapon.atk})`; els.sonWeapon.className = `weapon-badge tier-${gameState.son.weapon.tier}`;
    els.barHp.style.width = `${(gameState.son.hp / gameState.son.maxHp) * 100}%`; els.barHunger.style.width = `${(gameState.son.hunger / gameState.son.maxHunger) * 100}%`; els.barExp.style.width = `${(gameState.son.exp / gameState.son.maxExp) * 100}%`;
    
    // Affinity
    els.affTrust.innerText = gameState.son.affinity.trust;
    els.affAffection.innerText = gameState.son.affinity.affection;
    els.affRebellion.innerText = gameState.son.affinity.rebellion;
    
    // Quest Alert
    if (gameState.son.quest) {
        els.questAlert.style.display = 'block';
        els.questTimer.innerText = gameState.son.quest.timer;
        if(els.questModal.style.display === 'flex') els.questModalTimer.innerText = gameState.son.quest.timer;
    } else {
        els.questAlert.style.display = 'none';
    }

    els.roomTabs.forEach(tab => {
        if(tab.getAttribute('data-room') === gameState.son.currentRoom && gameState.son.state !== 'ADVENTURING') tab.classList.add('has-son');
        else tab.classList.remove('has-son');
    });

    const stateMessages = { 'SLEEPING': `상태: 침대에서 자는 중 (${gameState.son.actionTimer}초)`, 'EATING': `상태: 식탁에서 밥 먹는 중 (${gameState.son.actionTimer}초)`, 'TRAINING': `상태: 훈련 중 (${gameState.son.actionTimer}초)`, 'STUDYING': `상태: 서재에서 공부 중 (${gameState.son.actionTimer}초)`, 'ADVENTURING': `상태: 외출 중!` };
    els.actionText.innerText = stateMessages[gameState.son.state] || '상태: 아들이 대기 중입니다.';
}

function moveToRoom(roomId) { if (gameState.son.currentRoom !== roomId) { gameState.son.currentRoom = roomId; els.roomViews[roomId].appendChild(els.sprite); updateUI(); } }
function sonSpeech(text) { els.speech.innerText = text; els.speech.style.opacity = '1'; setTimeout(() => { els.speech.style.opacity = '0'; }, 3000); }
els.sprite.addEventListener('click', () => { if(gameState.son.state !== 'ADVENTURING') sonSpeech("엄마 사랑해요!"); });
function addMail(title, text, isGold = false, photoData = null) {
    const li = document.createElement('li'); li.className = 'mail-item';
    let htmlContent = `<strong style="color: ${isGold ? '#eab308' : '#334155'}">${title}</strong><br><span style="font-size: 0.85rem">${text}</span>`;
    if (photoData) { const imgUrl = `https://picsum.photos/seed/${photoData.seed}/300/150`; htmlContent += `<div class="polaroid" style="--rand: ${Math.random()}"><div class="polaroid-img" style="background-image: url('${imgUrl}')"></div><div class="polaroid-caption">${photoData.caption}</div></div>`; }
    li.innerHTML = htmlContent; els.mailList.prepend(li); if (els.mailList.children.length > 10) els.mailList.removeChild(els.mailList.lastChild);
}

// --- Dynamic Adventure ---
function startAdventure() {
    gameState.son.state = 'ADVENTURING'; els.sprite.style.display = 'none';
    const cp = gameState.son.level * gameState.son.weapon.atk; addMail("🏃‍♂️ 외출", `아들이 모험을 떠났습니다!`); updateUI();
    let ticks = 0;
    const advInt = setInterval(() => {
        ticks++;
        if(ticks === 15) addMail("📸 숲속에서", "안전하게 도착!", false, { caption: "평화로운 출발", seed: "forest," + Math.random() });
        else if(ticks === 35) addMail("⚔️ 전투 발생!", "몬스터 등장!", false, { caption: "싸우자!", seed: "monster," + Math.random() });
        else if(ticks === 60) {
            clearInterval(advInt); const earnedGold = (cp * 10) + Math.floor(Math.random() * 500);
            gameState.son.hp = 20; gameState.son.hunger = 20; gameState.parent.gold += earnedGold;
            gameState.son.state = 'IDLE'; els.sprite.style.display = 'block'; gameState.son.actionTimer = 0;
            addMail("🏆 귀환 완료!", `<b>보상: +${earnedGold} 골드</b>`, true); updateUI();
        }
    }, 1000);
}

// --- Action & State Machine Logic ---
function handleActionCompletion() {
    // Affinity Effects
    const healBonus = Math.floor(gameState.son.affinity.affection / 10); // +0 to +10 bonus

    if (gameState.son.state === 'SLEEPING') {
        sonSpeech("잘 잤다!"); gameState.son.hp = Math.min(gameState.son.maxHp, gameState.son.hp + 50 + healBonus);
    } else if (gameState.son.state === 'EATING') {
        if(gameState.rooms['room-table'].placedItem === 'steak') {
            sonSpeech("스테이크 최고!"); gameState.son.hunger = gameState.son.maxHunger; gameState.son.exp += 30;
            gameState.rooms['room-table'].placedItem = null; els.slots['room-table'].innerHTML = `<span class="slot-label">빈 접시</span>➕`; els.slots['room-table'].classList.remove('filled');
        } else {
            sonSpeech("밥 다 먹었다..."); gameState.son.hunger = Math.min(gameState.son.maxHunger, gameState.son.hunger + 40 + healBonus);
        }
    } else if (gameState.son.state === 'TRAINING') {
        if(gameState.rooms['room-dummy'].placedItem === 'sandbag') {
            sonSpeech("모래주머니 훈련 끝!"); gameState.son.exp += 80;
            gameState.rooms['room-dummy'].placedItem = null; els.slots['room-dummy'].innerHTML = `<span class="slot-label">빈 슬롯</span>➕`; els.slots['room-dummy'].classList.remove('filled');
        } else {
            sonSpeech("기본 훈련 끝!"); gameState.son.exp += 30;
        }
    } else if (gameState.son.state === 'STUDYING') {
        if(gameState.rooms['room-desk'].placedItem === 'book_hero') {
            sonSpeech("영웅학 개론 독파!"); gameState.son.exp += 100;
            gameState.rooms['room-desk'].placedItem = null; els.slots['room-desk'].innerHTML = `<span class="slot-label">빈 슬롯</span>➕`; els.slots['room-desk'].classList.remove('filled');
        } else {
            sonSpeech("공부 끝..."); gameState.son.exp += 20;
        }
    }
    gameState.son.state = 'IDLE';
}

function sonAI() {
    if (gameState.son.state === 'ADVENTURING') return;
    
    // Process Quest Timeout
    if (gameState.son.quest) handleQuestTick();
    
    if (gameState.son.actionTimer > 0) {
        gameState.son.actionTimer--;
        if (gameState.son.state === 'TRAINING') { gameState.son.hp -= 1; gameState.son.hunger -= 1; }
        if (gameState.son.state === 'STUDYING') { gameState.son.hunger -= 0.5; }
        if (gameState.son.actionTimer <= 0) handleActionCompletion();
        
        if (gameState.son.hp < 0) gameState.son.hp = 0; if (gameState.son.hunger < 0) gameState.son.hunger = 0;
        checkLevelUp(); updateUI(); return; 
    }
    
    // IDLE AI
    if (gameState.son.hp >= (gameState.son.maxHp * 0.8) && gameState.son.hunger >= (gameState.son.maxHunger * 0.8)) { startAdventure(); return; }

    // Random Quest Trigger
    triggerRandomQuest();

    if (gameState.son.hp <= 40) {
        gameState.son.state = 'SLEEPING'; moveToRoom('room-bed'); gameState.son.actionTimer = 15; sonSpeech("졸려... 자러 갈게요.");
    } else if (gameState.son.hunger <= 50) {
        gameState.son.state = 'EATING'; moveToRoom('room-table'); gameState.son.actionTimer = 10; sonSpeech("배고파! 밥 먹어야지.");
    } else {
        // Rebellion Effect: Refuse to train/study
        if (gameState.son.affinity.rebellion > 50 && Math.random() > 0.5) {
            sonSpeech("아 다 귀찮아! 아무것도 안 할래!");
            gameState.son.actionTimer = 5; // Idles for 5 seconds
        } else {
            if (Math.random() > 0.5) {
                gameState.son.state = 'TRAINING'; moveToRoom('room-dummy'); gameState.son.actionTimer = 20; sonSpeech("훈련을 시작하지!");
            } else {
                gameState.son.state = 'STUDYING'; moveToRoom('room-desk'); gameState.son.actionTimer = 20; sonSpeech("책 좀 읽어볼까.");
            }
        }
    }
    updateUI();
}

function checkLevelUp() {
    if (gameState.son.exp >= gameState.son.maxExp) {
        gameState.son.level++; gameState.son.exp = 0; gameState.son.maxExp = Math.floor(gameState.son.maxExp * 1.5);
        gameState.son.maxHp += 20; gameState.son.maxHunger += 20; gameState.son.hp = gameState.son.maxHp; gameState.son.hunger = gameState.son.maxHunger;
        sonSpeech("레벨업 했어요!"); addMail("레벨업!", `아들이 Lv.${gameState.son.level}이(가) 되었습니다!`);
    }
}

// Gacha Setup
els.btnGacha.addEventListener('click', () => {
    if (gameState.parent.gold >= 1000) {
        gameState.parent.gold -= 1000;
        const rand = Math.floor(Math.random() * 100); let picked = weaponsList[0]; let curProb = 0;
        for(let w of weaponsList) { curProb += w.prob; if (rand < curProb) { picked = w; break; } }
        if(picked.atk > gameState.son.weapon.atk) gameState.son.weapon = picked;
        els.gachaResult.style.display = 'block'; els.gachaResult.innerHTML = `망치질을 하는 중... 🔨`; els.btnGacha.disabled = true;
        setTimeout(() => { els.gachaResult.innerHTML = `[${picked.tier}급] ${picked.name} 획득!`; els.gachaResult.className = `gacha-result tier-${picked.tier}`; els.btnGacha.disabled = false; updateUI(); }, 1500);
    }
});

els.btnWork.addEventListener('click', () => { gameState.parent.gold += 10; updateUI(); });
console.log("Hero Mom Prototype - Affinity & Quests Loaded.");
moveToRoom(gameState.son.currentRoom); updateUI(); setInterval(sonAI, 1000);
