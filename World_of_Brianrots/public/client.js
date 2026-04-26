let currentUser = null, userData = null, marketOffers = [], merchantData = null, globalExist = {}, timerUpdate = null;

function formatNumberShort(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'b';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'm';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return num.toString();
}
function formatNumberComma(num) { return num ? num.toLocaleString() : '0'; }
function showToast(msg, dur = 3000) {
  let t = document.createElement('div');
  t.className = 'toast-notification';
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), dur);
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); }

async function apiCall(url, method, body = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = 'Request failed';
    try { const err = await res.json(); errMsg = err.error || errMsg; } catch(e) {}
    throw new Error(errMsg);
  }
  return res.json();
}

function renderInventory() {
  const grid = document.getElementById('inventoryGrid');
  if (!grid) return;
  if (!userData || !userData.inventory || Object.keys(userData.inventory).length === 0) {
    grid.innerHTML = '<div class="empty-message"><i class="fas fa-box-open"></i> No brainrots yet.. press SUMMON</div>';
    return;
  }
  let html = '';
  for (let [name, instances] of Object.entries(userData.inventory)) {
    const brain = window.brainrotsCache?.find(b => b.name === name);
    if (!brain) continue;
    const r = brain.rarity;
    const globalCnt = globalExist[name] || 0;
    const isEquipped = userData.equippedSlots?.some(slot => slot && slot.name === name);
    const slotsFull = userData.equippedSlots?.filter(s => s !== null).length >= 5;
    const disableEquip = isEquipped || slotsFull;
    const income = Math.max(1, Math.floor(r.baseCoins / 10));
    for (let idx = 0; idx < instances.length; idx++) {
      const inst = instances[idx];
      const shinyClass = inst.shiny ? 'shiny' : '';
      const iconHtml = brain.customImage ? `<img src="${brain.customImage}" style="width:54px;">` : `<i class="fas ${brain.icon}" style="color:${r.color}"></i>`;
      html += `<div class="brain-card ${shinyClass}" data-rarity="${r.name}" style="border-color:${r.color};">
                  <div class="delete-btn" onclick="event.stopPropagation(); deleteItem('${escapeHtml(name)}', ${idx})"><i class="fas fa-trash-alt"></i></div>
                  <div class="card-icon">${iconHtml}</div>
                  <div class="card-name">${escapeHtml(name)}</div>
                  <div class="card-rarity" style="--grad:${r.gradient};">${r.name}</div>
                  <div class="serial-number">#${formatNumberComma(inst.serial)}</div>
                  <button class="equip-btn" ${disableEquip ? 'style="opacity:0.4; pointer-events:none;"' : ''} onclick="event.stopPropagation(); equipItem('${escapeHtml(name)}', ${idx})"><i class="fas fa-brain yellow-coin"></i> +${income}/sec</button>
                </div>`;
    }
  }
  grid.innerHTML = html;
}

function renderHotbar() {
  const container = document.getElementById('hotbarSlotsContainer');
  if (!container) return;
  let slots = userData.equippedSlots || [null, null, null, null, null];
  let html = '';
  for (let i = 0; i < 5; i++) {
    let slot = slots[i];
    if (!slot) { html += `<div class="hotbar-slot empty-slot"><span>SLOT ${i+1}</span><small>empty</small></div>`; continue; }
    const brain = window.brainrotsCache?.find(b => b.name === slot.name);
    if (!brain) continue;
    const r = brain.rarity;
    const iconHtml = brain.customImage ? `<img src="${brain.customImage}" style="width:54px;">` : `<i class="fas ${brain.icon}" style="color:${r.color}"></i>`;
    const gen = Math.max(1, Math.floor(slot.baseCoins / 10));
    html += `<div class="brain-card" data-rarity="${r.name}" style="border-color:${r.color};">
                <div class="card-icon">${iconHtml}</div>
                <div class="card-name">${escapeHtml(slot.name)}</div>
                <div class="card-rarity" style="--grad:${r.gradient};">${r.name}</div>
                <div class="serial-number">#${formatNumberComma(slot.serial)}</div>
                <button class="unequip-btn" data-slot="${i}"><i class="fas fa-brain yellow-coin"></i> +${gen}/sec</button>
              </div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.unequip-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const slotIdx = parseInt(btn.getAttribute('data-slot')); unequipItem(slotIdx); };
  });
}

function renderCollection() {
  const container = document.getElementById('collectionRoot');
  if (!container) return;
  if (!window.brainrotsCache || !window.raritiesCache) { container.innerHTML = '<div class="empty-message">Loading collection...</div>'; return; }
  const groups = new Map();
  for (let br of window.brainrotsCache) { let rn = br.rarity.name; if (!groups.has(rn)) groups.set(rn, []); groups.get(rn).push(br); }
  let html = '';
  const ownedSet = new Set(Object.keys(userData.inventory || {}));
  for (let rarity of window.raritiesCache) {
    let items = groups.get(rarity.name) || [];
    if (items.length === 0) continue;
    html += `<div style="margin-bottom:48px;"><div style="font-size:26px; font-weight:800; margin-bottom:22px; display:flex; gap:12px; background:${rarity.gradient}; -webkit-background-clip:text; background-clip:text; color:transparent;"><i class="fas ${rarity.icon}"></i> ✦ ${rarity.name} ✦</div><div class="cards-grid" style="justify-content:flex-start;">`;
    for (let b of items) {
      let owned = ownedSet.has(b.name);
      let lockedClass = owned ? '' : 'locked';
      let displayName = owned ? b.name : '???';
      let iconHtml = (owned && b.customImage) ? `<img src="${b.customImage}" style="width:54px;">` : `<i class="fas ${owned ? b.icon : 'fa-question-circle'}" style="color:${owned ? b.rarity.color : '#555'}"></i>`;
      let borderColor = owned ? b.rarity.color : '#555';
      let globalCnt = globalExist[b.name] || 0;
      html += `<div class="brain-card ${lockedClass}" style="border-color:${borderColor};" onclick="${owned ? `alert('🧠 ${escapeHtml(b.name)}\\nRarity: ${b.rarity.name}')` : `alert('❓ Not obtained yet!')`}">
                  <div class="card-icon">${iconHtml}</div>
                  <div class="card-name">${escapeHtml(displayName)}</div>
                  <div class="card-rarity" style="--grad:${b.rarity.gradient};">${b.rarity.name}</div>
                  <div class="exist-count"><i class="fas fa-globe"></i> Exist: ${formatNumberShort(globalCnt)}</div>
                </div>`;
    }
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

function renderUpgrades() {
  const container = document.getElementById('upgradeGrid');
  if (!container) return;
  const cdLevel = userData.cdLevel || 0;
  const luckLevel = userData.luckLevel || 0;
  const gainLevel = userData.gainLevel || 0;
  function cdCost() { return Math.floor(50 + cdLevel * cdLevel * 1.5); }
  function luckCost() { return Math.floor(60 + luckLevel * luckLevel * 2); }
  function gainCost() { return Math.floor(70 + gainLevel * gainLevel * 2); }
  function cdCooldown() { return Math.max(0.1, 5 - (cdLevel * (4.9 / 50))); }
  function luckMulti() { return 1 + (luckLevel * (9 / 50)); }
  function gainMulti() { return 1 + (gainLevel * (5 / 50)); }
  container.innerHTML = `
    <div class="upgrade-card"><div class="upgrade-title"><i class="fas fa-hourglass-half"></i> Summon Cooldown</div><div class="upgrade-stats"><span>Level: ${cdLevel}/50</span><span>Current: ${cdCooldown().toFixed(2)} sec</span><span>Next: ${(cdLevel<50 ? cdCooldown() - 4.9/50 : cdCooldown()).toFixed(2)} sec</span></div><div class="progress-bar-bg"><div class="progress-fill" style="width:${cdLevel/50*100}%"></div></div><button class="upgrade-btn" id="upgradeCdBtn"><i class="fas fa-clock"></i> UPGRADE (${formatNumberShort(cdCost())} 🧠)</button></div>
    <div class="upgrade-card"><div class="upgrade-title"><i class="fas fa-chart-line"></i> Luck Multiplier</div><div class="upgrade-stats"><span>Level: ${luckLevel}/50</span><span>Current: x${luckMulti().toFixed(2)}</span><span>Next: x${(luckLevel<50 ? 1 + (luckLevel+1)*9/50 : luckMulti()).toFixed(2)}</span></div><div class="progress-bar-bg"><div class="progress-fill" style="width:${luckLevel/50*100}%"></div></div><button class="upgrade-btn" id="upgradeLuckBtn"><i class="fas fa-dice"></i> UPGRADE (${formatNumberShort(luckCost())} 🧠)</button></div>
    <div class="upgrade-card"><div class="upgrade-title"><i class="fas fa-coins"></i> Coin Gain</div><div class="upgrade-stats"><span>Level: ${gainLevel}/50</span><span>Current: x${gainMulti().toFixed(2)}</span><span>Next: x${(gainLevel<50 ? 1 + (gainLevel+1)*5/50 : gainMulti()).toFixed(2)}</span></div><div class="progress-bar-bg"><div class="progress-fill" style="width:${gainLevel/50*100}%"></div></div><button class="upgrade-btn" id="upgradeGainBtn"><i class="fas fa-money-bill-wave"></i> UPGRADE (${formatNumberShort(gainCost())} 🧠)</button></div>
  `;
  document.getElementById('upgradeCdBtn').onclick = () => upgrade('cd');
  document.getElementById('upgradeLuckBtn').onclick = () => upgrade('luck');
  document.getElementById('upgradeGainBtn').onclick = () => upgrade('gain');
}

function renderChances() {
  apiCall('/api/baseChances', 'GET').then(data => {
    const container = document.getElementById('chancesList');
    if (container) {
      let rows = '';
      for (let r of data) rows += `<div class="table-row"><span style="color:${r.color}">${r.name}</span><span>${r.chance}%</span></div>`;
      container.innerHTML = rows;
    }
  }).catch(e => console.error(e));
}

function renderLeaderboard() {
  apiCall('/api/leaderboard', 'GET').then(scores => {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;
    if (!scores.length) { container.innerHTML = '<div class="empty-message">No players yet</div>'; return; }
    let html = '';
    for (let i = 0; i < Math.min(100, scores.length); i++) {
      const s = scores[i];
      const avatarStyle = s.avatar ? `src="${s.avatar}"` : `src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%238b5cf6'/%3E%3Ctext x='50' y='67' text-anchor='middle' fill='white' font-size='40' dy='.3em'%3E😺%3C/text%3E%3C/svg%3E"`;
      html += `<div class="global-item"><div class="global-rank">#${i+1}</div><img class="global-avatar" ${avatarStyle}><div class="global-info"><div class="global-displayname">${escapeHtml(s.displayName)}${s.verified ? ' <i class="fas fa-check-circle verified-badge-icon"></i>' : ''}</div><div class="global-username">@${escapeHtml(s.username)}</div></div><div class="global-value"><i class="fas fa-brain yellow-coin"></i> ${formatNumberShort(s.value)}</div></div>`;
    }
    container.innerHTML = html;
  }).catch(e => console.error(e));
}

function renderShop() {
  const container = document.getElementById('shopGrid');
  if (!container) return;
  if (!merchantData || !merchantData.items) { container.innerHTML = '<div class="empty-message">Loading...</div>'; return; }
  let html = '';
  for (let item of merchantData.items) {
    html += `<div class="shop-card"><div class="shop-title"><i class="fas ${item.icon}"></i> ${escapeHtml(item.name)}</div><div class="shop-stats"><span>Rarity: <span style="background:${item.rarity.gradient}; -webkit-background-clip:text; background-clip:text; color:transparent;">${item.rarity.name}</span></span><span><i class="fas fa-brain yellow-coin"></i> ${formatNumberShort(item.price)}</span></div><button class="shop-btn" data-name="${escapeHtml(item.name)}" data-price="${item.price}"><i class="fas fa-shopping-cart"></i> PURCHASE</button></div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.shop-btn').forEach(btn => {
    btn.onclick = () => {
      const name = btn.getAttribute('data-name');
      const price = parseInt(btn.getAttribute('data-price'));
      apiCall('/api/merchant/buy', 'POST', { itemName: name }).then(() => {
        showToast(`Purchased ${name} for ${formatNumberShort(price)} 🧠`);
        refreshUserData();
        renderShop();
      }).catch(err => showToast(err.message));
    };
  });
}

function renderMarketMyOffers() {
  const container = document.getElementById('myOffersGrid');
  if (!container) return;
  const myOffers = marketOffers.filter(o => o.sellerUsername === currentUser);
  let html = '';
  if (myOffers.length < 25) {
    html += `<div class="brain-card add-offer-card" id="addOfferMainBtn"><i class="fas fa-plus-circle"></i><span>Add new offer</span><small style="color:#aaa;">${myOffers.length}/25 active</small></div>`;
  }
  for (let offer of myOffers) {
    const brain = window.brainrotsCache?.find(b => b.name === offer.itemName);
    if (!brain) continue;
    const r = brain.rarity;
    const iconHtml = brain.customImage ? `<img src="${brain.customImage}" style="width:54px;">` : `<i class="fas ${brain.icon}" style="color:${r.color}"></i>`;
    html += `<div class="brain-card" data-rarity="${r.name}" style="border-color:${r.color};">
                <div class="card-icon">${iconHtml}</div>
                <div class="card-name">${escapeHtml(offer.itemName)}</div>
                <div class="card-rarity" style="--grad:${r.gradient};">${r.name}</div>
                <div class="serial-number">#${formatNumberComma(offer.serial)}</div>
                <button class="buy-btn" disabled style="cursor:default; opacity:0.7;"><i class="fas fa-brain yellow-coin"></i> ${formatNumberShort(offer.price)}</button>
                <button class="delete-btn" data-offer-id="${offer.offerId}" style="opacity:1; background:#ff4444; top:10px; right:10px;"><i class="fas fa-trash-alt"></i></button>
              </div>`;
  }
  if (myOffers.length === 0 && html === '') html = '<div class="empty-message">No offers yet. Click + to list an item.</div>';
  container.innerHTML = html;
  document.querySelectorAll('#myOffersGrid .delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const offerId = parseInt(btn.getAttribute('data-offer-id'));
      marketOffers = marketOffers.filter(o => o.offerId !== offerId);
      await apiCall('/api/market/offers', 'GET').then(data => marketOffers = data);
      renderMarketMyOffers();
      renderMarketOthersOffers();
      showToast(`Offer removed, item not returned (to be implemented)`);
    };
  });
  const addBtn = document.getElementById('addOfferMainBtn');
  if (addBtn) addBtn.onclick = () => openSellModal();
}

function renderMarketOthersOffers() {
  const container = document.getElementById('othersOffersGrid');
  if (!container) return;
  const searchTerm = document.getElementById('marketSearch')?.value.toLowerCase() || '';
  const othersOffers = marketOffers.filter(o => o.sellerUsername !== currentUser && o.itemName.toLowerCase().includes(searchTerm));
  if (othersOffers.length === 0) { container.innerHTML = '<div class="empty-message">No offers from other players</div>'; return; }
  let html = '';
  for (let offer of othersOffers) {
    const brain = window.brainrotsCache?.find(b => b.name === offer.itemName);
    if (!brain) continue;
    const r = brain.rarity;
    const iconHtml = brain.customImage ? `<img src="${brain.customImage}" style="width:54px;">` : `<i class="fas ${brain.icon}" style="color:${r.color}"></i>`;
    html += `<div class="brain-card" data-rarity="${r.name}" style="border-color:${r.color};">
                <div class="card-icon">${iconHtml}</div>
                <div class="card-name">${escapeHtml(offer.itemName)}</div>
                <div class="card-rarity" style="--grad:${r.gradient};">${r.name}</div>
                <div class="serial-number">#${formatNumberComma(offer.serial)}</div>
                <div class="seller-info">Seller: @${escapeHtml(offer.sellerUsername)}${offer.sellerVerified ? ' <i class="fas fa-check-circle verified-badge-icon"></i>' : ''}</div>
                <button class="buy-btn" data-offer-id="${offer.offerId}"><i class="fas fa-brain yellow-coin"></i> ${formatNumberShort(offer.price)}</button>
              </div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('#othersOffersGrid .buy-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const offerId = parseInt(btn.getAttribute('data-offer-id'));
      try {
        await apiCall('/api/market/buy', 'POST', { offerId });
        showToast(`Purchase successful!`);
        await refreshUserData();
        await fetchMarketOffers();
        renderMarketMyOffers();
        renderMarketOthersOffers();
        renderInventory();
        renderLeaderboard();
      } catch(err) {
        showToast(err.message);
      }
    };
  });
}

function renderAutoDeleteCheckboxes() {
  const container = document.getElementById('rarityCheckboxes');
  if (!container) return;
  if (!window.raritiesCache) return;
  const selected = userData.autoDeleteRarities || [];
  let html = '';
  for (let r of window.raritiesCache) {
    const checked = selected.includes(r.name) ? 'checked' : '';
    html += `<label class="rarity-check"><input type="checkbox" value="${r.name}" ${checked}> <i class="fas ${r.icon}" style="color:${r.color}"></i> ${r.name}</label>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('input').forEach(chk => {
    chk.addEventListener('change', async () => {
      const newSelected = Array.from(container.querySelectorAll('input:checked')).map(inp => inp.value);
      await apiCall('/api/autoDelete', 'POST', { rarities: newSelected });
      refreshUserData();
    });
  });
}

async function refreshUserData() {
  const data = await apiCall('/api/me', 'GET');
  userData = data.userData;
  document.getElementById('brainCoins').innerText = formatNumberShort(userData.brainCoins);
  document.getElementById('currentUsername').innerText = userData.displayName || currentUser;
  if (userData.avatar) document.getElementById('avatarImg').src = userData.avatar;
  if (userData.verified) {
    document.getElementById('verifiedBadge').style.display = 'inline-block';
  } else {
    document.getElementById('verifiedBadge').style.display = 'none';
  }
  renderInventory();
  renderHotbar();
  renderUpgrades();
  renderAutoDeleteCheckboxes();
  renderLeaderboard();
  renderChances();
}

async function fetchMarketOffers() {
  const data = await apiCall('/api/market/offers', 'GET');
  const enriched = [];
  for (let offer of data) {
    let sellerData = null;
    try {
      const res = await fetch(`/api/admin/player/${offer.sellerUsername}`, { credentials: 'include' });
      if (res.ok) sellerData = await res.json();
    } catch(e) {}
    enriched.push({ ...offer, sellerVerified: sellerData?.verified || false });
  }
  marketOffers = enriched;
  renderMarketMyOffers();
  renderMarketOthersOffers();
}

async function fetchMerchant() {
  const data = await apiCall('/api/merchant', 'GET');
  merchantData = data;
  renderShop();
  const timerDiv = document.getElementById('shopTimer');
  if (timerDiv && merchantData.resetTime) {
    setInterval(() => {
      const rem = Math.max(0, merchantData.resetTime - Date.now());
      const mins = Math.floor(rem / 60000);
      const secs = Math.floor((rem % 60000) / 1000);
      timerDiv.innerHTML = `<i class="fas fa-clock"></i> New offers in ${mins}:${secs.toString().padStart(2,'0')}`;
    }, 1000);
  }
}

async function fetchGlobalExist() {
  const data = await apiCall('/api/globalExist', 'GET');
  globalExist = data;
}

async function fetchBrainrotsData() {
  const rarRes = await fetch('/api/rarities', { credentials: 'include' });
  const brainRes = await fetch('/api/brainrots', { credentials: 'include' });
  window.raritiesCache = await rarRes.json();
  window.brainrotsCache = await brainRes.json();
}

async function summon() {
  try {
    const data = await apiCall('/api/summon', 'POST');
    userData = data.userData;
    document.getElementById('brainCoins').innerText = formatNumberShort(userData.brainCoins);
    const last = data.lastCard;
    const container = document.getElementById('lastCardContainer');
    let brain = last.item;
    let r = brain.rarity;
    let iconHtml = brain.customImage ? `<img src="${brain.customImage}" style="width:54px;">` : `<i class="fas ${brain.icon}" style="color:${r.color}"></i>`;
    let autoText = last.autoDeleted ? '<div style="margin-top:20px;color:#ff8888;">🗑️ AUTO-DELETED</div>' : `<div style="margin-top:20px;color:#ffcc44;"><i class="fas fa-brain yellow-coin"></i> +${Math.max(1, Math.floor(r.baseCoins/10))}/sec</div>`;
    container.innerHTML = `<div class="brain-card" data-rarity="${r.name}" style="border-color:${r.color};"><div class="card-icon">${iconHtml}</div><div class="card-name">${escapeHtml(brain.name)}</div><div class="card-rarity" style="--grad:${r.gradient};">${r.name}</div><div class="serial-number">#${formatNumberComma(last.serial)}</div>${autoText}</div>`;
    container.classList.remove('fly-animation'); void container.offsetWidth; container.classList.add('fly-animation');
    setTimeout(() => container.classList.remove('fly-animation'), 500);
    renderInventory();
    renderHotbar();
    renderLeaderboard();
    renderChances();
    updateCooldownIndicator(data.userData.cdLevel);
  } catch (err) {
    showToast(err.message);
  }
}

let cdInterval = null;
function updateCooldownIndicator(cdLevel) {
  if (cdInterval) clearInterval(cdInterval);
  const cdTime = Math.max(0.1, 5 - (cdLevel * (4.9 / 50)));
  const btn = document.getElementById('summonBtn');
  const ind = document.getElementById('cdIndicator');
  let endTime = Date.now() + cdTime * 1000;
  btn.disabled = true;
  const interval = setInterval(() => {
    const rem = Math.max(0, (endTime - Date.now()) / 1000);
    if (rem <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      ind.innerText = '';
      cdInterval = null;
    } else {
      ind.innerText = `Cooldown: ${rem.toFixed(1)}s`;
    }
  }, 100);
  cdInterval = interval;
}

async function equipItem(itemName, idx) {
  try {
    await apiCall('/api/equip', 'POST', { itemName, instanceIdx: idx });
    await refreshUserData();
    showToast(`Equipped ${itemName}`);
  } catch(err) { showToast(err.message); }
}
async function unequipItem(slotIdx) {
  try {
    await apiCall('/api/unequip', 'POST', { slotIdx });
    await refreshUserData();
    showToast(`Unequipped`);
  } catch(err) { showToast(err.message); }
}
async function upgrade(type) {
  try {
    await apiCall('/api/upgrade', 'POST', { type });
    await refreshUserData();
    showToast(`Upgraded ${type}`);
  } catch(err) { showToast(err.message); }
}
async function deleteItem(itemName, idx) {
  try {
    await apiCall('/api/deleteItem', 'POST', { itemName, idx });
    await refreshUserData();
    showToast(`Deleted ${itemName}`);
  } catch(err) { showToast(err.message); }
}
function openSellModal() {
  const select = document.getElementById('offerItemSelect');
  select.innerHTML = '<option value="">-- Select item --</option>';
  for (let name in userData.inventory) {
    if (userData.inventory[name].length) {
      select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)} (serial #${userData.inventory[name][0].serial})</option>`;
    }
  }
  document.getElementById('offerPrice').value = '';
  document.getElementById('sellModal').style.display = 'flex';
}
async function confirmOffer() {
  const itemName = document.getElementById('offerItemSelect').value;
  const price = parseInt(document.getElementById('offerPrice').value);
  if (!itemName || !price || price < 1 || price > 1e11) {
    showToast('Invalid item or price');
    return;
  }
  try {
    await apiCall('/api/market/offer', 'POST', { itemName, price });
    showToast(`Item listed for ${formatNumberShort(price)} 🧠`);
    await refreshUserData();
    await fetchMarketOffers();
    document.getElementById('sellModal').style.display = 'none';
  } catch(err) { showToast(err.message); }
}

async function loginUser(username, password) {
  try {
    const data = await apiCall('/api/login', 'POST', { username, password });
    currentUser = username;
    userData = data.userData;
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    await fetchBrainrotsData();
    await fetchGlobalExist();
    await fetchMarketOffers();
    await fetchMerchant();
    await refreshUserData();
    attachGameEvents();
    updateCooldownIndicator(userData.cdLevel);
    startIncomeTimer();
    if (userData.isAdmin) {
      addAdminTab();
      renderAdminPanel();
    } else {
      const existingAdminBtn = document.querySelector('.tab-btn[data-tab="admin"]');
      if (existingAdminBtn) existingAdminBtn.remove();
      const adminPane = document.getElementById('adminPane');
      if (adminPane) adminPane.remove();
    }
  } catch(err) { showToast('Invalid credentials'); }
}

function startIncomeTimer() {
  if (timerUpdate) clearInterval(timerUpdate);
  timerUpdate = setInterval(async () => {
    if (!currentUser) return;
    try {
      const response = await fetch('/api/income', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.userData) {
          userData = data.userData;
          document.getElementById('brainCoins').innerText = formatNumberShort(userData.brainCoins);
          renderHotbar();
        }
      } else if (response.status === 401) logout();
    } catch(e) { console.error('income error', e); }
  }, 1000);
}

async function registerUser(username, password, confirm) {
  if (password !== confirm) { showToast('Passwords do not match'); return; }
  try {
    await apiCall('/api/register', 'POST', { username, password });
    showToast('Registered! Please login.');
    document.getElementById('showLogin').click();
  } catch(err) { showToast(err.message); }
}

function openSettings() {
  document.getElementById('modalUsername').innerText = currentUser;
  document.getElementById('modalPassword').innerText = '••••••';
  document.getElementById('displayNameInput').value = userData.displayName || currentUser;
  document.getElementById('settingsModal').style.display = 'flex';
}
async function saveSettings() {
  const newName = document.getElementById('displayNameInput').value.trim();
  if (newName) {
    await apiCall('/api/user/settings', 'POST', { displayName: newName });
    await refreshUserData();
    showToast('Settings saved');
  }
  document.getElementById('settingsModal').style.display = 'none';
}
function logout() {
  apiCall('/api/logout', 'POST').then(() => { localStorage.removeItem('brainrot_last_user'); location.reload(); });
}

async function loadAdminPlayerList() {
  const select = document.getElementById('adminPlayerSelect');
  if (!select) return;
  const players = await apiCall('/api/admin/players', 'GET');
  select.innerHTML = '<option value="">-- Choose player --</option>';
  for (let p of players) {
    select.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
  }
  select.onchange = async () => {
    const username = select.value;
    if (!username) return;
    const data = await apiCall(`/api/admin/player/${username}`, 'GET');
    const infoDiv = document.getElementById('adminPlayerInfo');
    infoDiv.innerHTML = `<strong>${escapeHtml(username)}</strong> | Coins: ${formatNumberShort(data.brainCoins)} | Verified: ${data.verified ? '✓' : '✗'} | Admin: ${data.isAdmin ? 'Yes' : 'No'}`;
    window.selectedAdminUser = username;
    const invView = document.getElementById('adminInventoryView');
    const inv = data.inventory || {};
    if (Object.keys(inv).length === 0) invView.innerHTML = '<div>Empty inventory</div>';
    else {
      let invHtml = '';
      for (let [name, instances] of Object.entries(inv)) {
        invHtml += `<div><strong>${escapeHtml(name)}</strong> x${instances.length} (serials: ${instances.map(i => '#' + i.serial).join(', ')})</div>`;
      }
      invView.innerHTML = invHtml;
    }
  };
}
async function adminGiveCoins() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot modify Magnitude');
  const amount = prompt('Amount of coins:');
  if (!amount || isNaN(amount)) return;
  await apiCall(`/api/admin/player/${username}/coins`, 'POST', { amount: parseInt(amount) });
  alert('Coins added');
  loadAdminPlayerList();
  const select = document.getElementById('adminPlayerSelect');
  if (select && select.value === username) select.dispatchEvent(new Event('change'));
}
async function adminGiveItem() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot modify Magnitude');
  const itemName = prompt('Item name exactly (case-sensitive):');
  if (!itemName) return;
  await apiCall(`/api/admin/player/${username}/giveItem`, 'POST', { itemName });
  alert('Item given');
  if (document.getElementById('adminPlayerSelect')?.value === username) {
    const data = await apiCall(`/api/admin/player/${username}`, 'GET');
    const invView = document.getElementById('adminInventoryView');
    const inv = data.inventory || {};
    if (Object.keys(inv).length === 0) invView.innerHTML = '<div>Empty inventory</div>';
    else {
      let invHtml = '';
      for (let [name, instances] of Object.entries(inv)) invHtml += `<div><strong>${escapeHtml(name)}</strong> x${instances.length} (serials: ${instances.map(i => '#' + i.serial).join(', ')})</div>`;
      invView.innerHTML = invHtml;
    }
  }
}
async function adminToggleVerify() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot modify Magnitude');
  const data = await apiCall(`/api/admin/player/${username}/toggleVerify`, 'POST');
  alert(`Verified now: ${data.verified}`);
  if (document.getElementById('adminPlayerSelect')?.value === username) {
    const fresh = await apiCall(`/api/admin/player/${username}`, 'GET');
    const infoDiv = document.getElementById('adminPlayerInfo');
    infoDiv.innerHTML = `<strong>${escapeHtml(username)}</strong> | Coins: ${formatNumberShort(fresh.brainCoins)} | Verified: ${fresh.verified ? '✓' : '✗'} | Admin: ${fresh.isAdmin ? 'Yes' : 'No'}`;
  }
}
async function adminClearInventory() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot modify Magnitude');
  if (!confirm(`Clear inventory of ${username}?`)) return;
  await apiCall(`/api/admin/player/${username}/clearInventory`, 'POST');
  alert('Inventory cleared');
  if (document.getElementById('adminPlayerSelect')?.value === username) {
    document.getElementById('adminInventoryView').innerHTML = '<div>Empty inventory</div>';
  }
}
async function adminBan() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot ban Magnitude');
  if (!confirm(`Ban ${username}? All progress reset, admin rights removed.`)) return;
  try {
    await apiCall(`/api/admin/player/${username}/ban`, 'POST');
    alert('Player banned');
    loadAdminPlayerList();
    document.getElementById('adminPlayerInfo').innerHTML = '';
    document.getElementById('adminInventoryView').innerHTML = '';
  } catch(e) { alert(e.message); }
}
async function adminToggleAdmin() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot change Magnitude\'s admin status');
  try {
    const data = await apiCall(`/api/admin/player/${username}/toggleAdmin`, 'POST');
    alert(`Admin status: ${data.isAdmin ? 'granted' : 'revoked'}`);
    if (document.getElementById('adminPlayerSelect')?.value === username) {
      const fresh = await apiCall(`/api/admin/player/${username}`, 'GET');
      const infoDiv = document.getElementById('adminPlayerInfo');
      infoDiv.innerHTML = `<strong>${escapeHtml(username)}</strong> | Coins: ${formatNumberShort(fresh.brainCoins)} | Verified: ${fresh.verified ? '✓' : '✗'} | Admin: ${fresh.isAdmin ? 'Yes' : 'No'}`;
    }
  } catch(e) { alert(e.message); }
}
async function adminSaveProfile() {
  const username = window.selectedAdminUser;
  if (!username) return alert('Select player');
  if (username === 'Magnitude') return alert('Cannot modify Magnitude');
  const displayName = document.getElementById('adminDisplayName').value;
  const avatar = document.getElementById('adminAvatarUrl').value;
  const body = {};
  if (displayName) body.displayName = displayName;
  if (avatar) body.avatar = avatar;
  await apiCall(`/api/admin/player/${username}/settings`, 'POST', body);
  alert('Profile updated');
}
async function loadAdminMarketOffers() {
  const offers = await apiCall('/api/admin/marketOffers', 'GET');
  const container = document.getElementById('adminMarketOffersList');
  if (!container) return;
  if (offers.length === 0) { container.innerHTML = '<div>No offers</div>'; return; }
  let html = '';
  for (let offer of offers) {
    html += `<div style="background:#2a1e3a; border-radius:24px; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${escapeHtml(offer.itemName)}</strong> | Seller: ${escapeHtml(offer.sellerUsername)} | Price: ${formatNumberShort(offer.price)} | Serial: #${offer.serial}</div>
                <button class="delete-offer-btn" data-id="${offer.offerId}" style="background:#dc2626; border:none; border-radius:40px; padding:6px 12px;">Delete</button>
              </div>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.delete-offer-btn').forEach(btn => {
    btn.onclick = async () => {
      const offerId = parseInt(btn.getAttribute('data-id'));
      await apiCall('/api/admin/marketOffers/delete', 'POST', { offerId });
      loadAdminMarketOffers();
    };
  });
}
function renderAdminPanel() {
  const container = document.getElementById('adminPane');
  if (!container) return;
  container.innerHTML = `
    <div class="section-title"><i class="fas fa-shield-alt"></i> Admin Panel</div>
    <div style="display: flex; flex-direction: column; gap: 30px;">
      <div class="upgrade-card">
        <div class="upgrade-title">Player Management</div>
        <select id="adminPlayerSelect" style="background:#2a1e3a; border-radius:40px; padding:10px; width:100%;"></select>
        <div id="adminPlayerInfo" style="margin-top:10px; font-size:14px;"></div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px;">
          <button id="adminGiveCoinsBtn" class="shop-btn">Give coins</button>
          <button id="adminGiveItemBtn" class="shop-btn">Give item</button>
          <button id="adminToggleVerifyBtn" class="shop-btn">Toggle ✓</button>
          <button id="adminClearInventoryBtn" class="shop-btn">Clear inventory</button>
          <button id="adminBanBtn" class="shop-btn">Ban player</button>
          ${userData.username === 'Magnitude' ? '<button id="adminToggleAdminBtn" class="shop-btn">Toggle admin</button>' : ''}
        </div>
        <div id="adminInventoryView" style="background:#1e1628; border-radius:24px; padding:16px; margin-top:20px; max-height:300px; overflow:auto;"></div>
      </div>
      <div class="upgrade-card">
        <div class="upgrade-title">Market offers</div>
        <div id="adminMarketOffersList"></div>
      </div>
      <div class="upgrade-card">
        <div class="upgrade-title">Edit player profile</div>
        <input type="text" id="adminDisplayName" placeholder="New display name" style="background:#2a1e3a; border-radius:40px; padding:10px; width:100%; margin:5px 0;">
        <input type="text" id="adminAvatarUrl" placeholder="Avatar image URL" style="background:#2a1e3a; border-radius:40px; padding:10px; width:100%; margin:5px 0;">
        <button id="adminSaveProfileBtn" class="shop-btn">Save profile</button>
      </div>
    </div>
  `;
  loadAdminPlayerList();
  loadAdminMarketOffers();
  document.getElementById('adminGiveCoinsBtn')?.addEventListener('click', adminGiveCoins);
  document.getElementById('adminGiveItemBtn')?.addEventListener('click', adminGiveItem);
  document.getElementById('adminToggleVerifyBtn')?.addEventListener('click', adminToggleVerify);
  document.getElementById('adminClearInventoryBtn')?.addEventListener('click', adminClearInventory);
  document.getElementById('adminBanBtn')?.addEventListener('click', adminBan);
  if (userData.username === 'Magnitude') {
    document.getElementById('adminToggleAdminBtn')?.addEventListener('click', adminToggleAdmin);
  }
  document.getElementById('adminSaveProfileBtn')?.addEventListener('click', adminSaveProfile);
}
function addAdminTab() {
  const tabBar = document.getElementById('tabBar');
  if (!tabBar || document.querySelector('.tab-btn[data-tab="admin"]')) return;
  const adminBtn = document.createElement('button');
  adminBtn.className = 'tab-btn';
  adminBtn.setAttribute('data-tab', 'admin');
  adminBtn.innerHTML = '<i class="fas fa-shield-alt"></i> Admin';
  tabBar.appendChild(adminBtn);
  const content = document.querySelector('.content');
  if (content && !document.getElementById('adminPane')) {
    const adminPane = document.createElement('div');
    adminPane.id = 'adminPane';
    adminPane.className = 'tab-pane';
    content.appendChild(adminPane);
  }
  const tabs = document.querySelectorAll('#tabBar .tab-btn');
  const panes = ['summonPane','inventoryPane','hotbarPane','indexPane','upgradePane','shopPane','marketPane','globalPane','chancesPane','adminPane'];
  tabs.forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-tab');
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panes.forEach(p => document.getElementById(p)?.classList.remove('active'));
      const activePane = document.getElementById(tab + 'Pane');
      if (activePane) activePane.classList.add('active');
      if (tab === 'inventory') renderInventory();
      if (tab === 'hotbar') renderHotbar();
      if (tab === 'index') renderCollection();
      if (tab === 'shop') renderShop();
      if (tab === 'market') { renderMarketMyOffers(); renderMarketOthersOffers(); }
      if (tab === 'global') renderLeaderboard();
      if (tab === 'chances') renderChances();
      if (tab === 'admin') renderAdminPanel();
    };
  });
}

function attachGameEvents() {
  document.getElementById('summonBtn').onclick = summon;
  document.getElementById('settingsBtn').onclick = openSettings;
  document.getElementById('saveSettingsBtn').onclick = saveSettings;
  document.getElementById('closeModalBtn').onclick = () => document.getElementById('settingsModal').style.display = 'none';
  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('confirmOfferBtn').onclick = confirmOffer;
  document.getElementById('cancelOfferBtn').onclick = () => document.getElementById('sellModal').style.display = 'none';
  document.getElementById('marketSearch').oninput = () => renderMarketOthersOffers();
  document.getElementById('avatarClickArea').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          await apiCall('/api/user/settings', 'POST', { avatar: ev.target.result });
          await refreshUserData();
          showToast('Avatar updated');
        };
        reader.readAsDataURL(file);
      }
    };
    inp.click();
  };
  const tabs = document.querySelectorAll('#tabBar .tab-btn');
  const panes = ['summonPane','inventoryPane','hotbarPane','indexPane','upgradePane','shopPane','marketPane','globalPane','chancesPane'];
  if (userData?.isAdmin) panes.push('adminPane');
  tabs.forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-tab');
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panes.forEach(p => document.getElementById(p)?.classList.remove('active'));
      const activePane = document.getElementById(tab + 'Pane');
      if (activePane) activePane.classList.add('active');
      if (tab === 'inventory') renderInventory();
      if (tab === 'hotbar') renderHotbar();
      if (tab === 'index') renderCollection();
      if (tab === 'shop') renderShop();
      if (tab === 'market') { renderMarketMyOffers(); renderMarketOthersOffers(); }
      if (tab === 'global') renderLeaderboard();
      if (tab === 'chances') renderChances();
      if (tab === 'admin' && userData?.isAdmin) renderAdminPanel();
    };
  });
  const marketTabs = document.querySelectorAll('.market-subtab');
  if (marketTabs.length) {
    marketTabs[0].onclick = () => {
      marketTabs.forEach(t => t.classList.remove('active'));
      marketTabs[0].classList.add('active');
      document.getElementById('myOffersPanel').style.display = 'block';
      document.getElementById('othersOffersPanel').style.display = 'none';
      renderMarketMyOffers();
    };
    marketTabs[1].onclick = () => {
      marketTabs.forEach(t => t.classList.remove('active'));
      marketTabs[1].classList.add('active');
      document.getElementById('myOffersPanel').style.display = 'none';
      document.getElementById('othersOffersPanel').style.display = 'block';
      renderMarketOthersOffers();
    };
  }
}

document.getElementById('loginBtn').onclick = async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  await loginUser(username, password);
};
document.getElementById('registerBtn').onclick = async () => {
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  await registerUser(username, password, confirm);
};
document.getElementById('showRegister').onclick = () => {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
};
document.getElementById('showLogin').onclick = () => {
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('loginForm').style.display = 'block';
};

(async () => {
  try {
    const data = await apiCall('/api/me', 'GET');
    if (data.userData) {
      currentUser = data.userData.displayName;
      userData = data.userData;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      await fetchBrainrotsData();
      await fetchGlobalExist();
      await fetchMarketOffers();
      await fetchMerchant();
      await refreshUserData();
      attachGameEvents();
      updateCooldownIndicator(userData.cdLevel);
      startIncomeTimer();
      if (userData.isAdmin) {
        addAdminTab();
        renderAdminPanel();
      }
    }
  } catch(e) {}
})();

window.equipItem = equipItem;
window.deleteItem = deleteItem;