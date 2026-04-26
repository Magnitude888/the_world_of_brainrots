import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { RARITIES, BRAINROTS } from './brainrots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'brainrot-ultimate-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: false }
}));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const GLOBAL_EXIST_FILE = path.join(DATA_DIR, 'globalExist.json');
const MARKET_OFFERS_FILE = path.join(DATA_DIR, 'marketOffers.json');
const MERCHANT_FILE = path.join(DATA_DIR, 'merchant.json');
const BANNED_IPS_FILE = path.join(DATA_DIR, 'banned_ips.json');

function readJSON(file, def) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify(def, null, 2));
  return def;
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let accounts = readJSON(ACCOUNTS_FILE, {});
let globalExist = readJSON(GLOBAL_EXIST_FILE, {});
let marketOffers = readJSON(MARKET_OFFERS_FILE, []);
let merchantData = readJSON(MERCHANT_FILE, { items: [], resetTime: 0 });
let bannedIPs = readJSON(BANNED_IPS_FILE, []);

function saveBannedIPs() { writeJSON(BANNED_IPS_FILE, bannedIPs); }

function getUserDataFile(username) {
  return path.join(DATA_DIR, `${username}.json`);
}

function loadUserData(username) {
  const file = getUserDataFile(username);
  let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!data) {
    data = {
      inventory: {}, personalExist: {}, shinyCount: 0, brainCoins: 200,
      cdLevel: 0, luckLevel: 0, gainLevel: 0, displayName: username,
      avatar: '/icons/Default.png',
      autoDeleteRarities: [], verified: false,
      equippedSlots: [null, null, null, null, null], lastIncomeTime: Date.now()
    };
  }
  if (!data.avatar) data.avatar = '/icons/Default.png';
  if (data.isAdmin === undefined) data.isAdmin = (username === 'Magnitude');
  if (username === 'Magnitude') {
    data.isAdmin = true;
    if (!data.avatar) data.avatar = '/icons/Default.png';
  }
  saveUserData(username, data);
  return data;
}

function saveUserData(username, data) {
  writeJSON(getUserDataFile(username), data);
}

function getIncomePerSec(baseCoins) { return Math.max(1, Math.floor(baseCoins / 10)); }
function getCooldown(userData) { return Math.max(0.1, 5 - (userData.cdLevel * (4.9 / 50))); }
function getLuckMulti(userData) { return 1 + (userData.luckLevel * (9 / 50)); }
function getGainMulti(userData) { return 1 + (userData.gainLevel * (5 / 50)); }
function getCdCost(userData) { return Math.floor(50 + userData.cdLevel * userData.cdLevel * 1.5); }
function getLuckCost(userData) { return Math.floor(60 + userData.luckLevel * userData.luckLevel * 2); }
function getGainCost(userData) { return Math.floor(70 + userData.gainLevel * userData.gainLevel * 2); }

function getCurrentChances(userData) {
  const luck = getLuckMulti(userData);
  const mod = RARITIES.map(r => ({ ...r, chance: r.baseChance * luck }));
  const total = mod.reduce((s, r) => s + r.chance, 0);
  return mod.map(r => ({ ...r, chance: (r.chance / total) * 100 }));
}
function rollRarity(userData) {
  const chances = getCurrentChances(userData);
  const total = chances.reduce((s, r) => s + r.chance, 0);
  let rand = Math.random() * total, acc = 0;
  for (const r of chances) { acc += r.chance; if (rand <= acc) return r; }
  return chances[0];
}
function getRandomItem(userData) {
  const sel = rollRarity(userData);
  let candidates = BRAINROTS.filter(b => b.rarity.name === sel.name);
  if (!candidates.length) candidates = BRAINROTS.filter(b => b.rarity.name === 'Common');
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function incrementGlobalExist(itemName) {
  globalExist[itemName] = (globalExist[itemName] || 0) + 1;
  writeJSON(GLOBAL_EXIST_FILE, globalExist);
  return globalExist[itemName];
}
function getGlobalSerial(itemName) {
  return (globalExist[itemName] || 0) + 1;
}
function cleanUserData(data) {
  if (data.inventory) {
    for (const name in data.inventory) if (!BRAINROTS.some(b => b.name === name)) delete data.inventory[name];
  }
  if (data.equippedSlots && Array.isArray(data.equippedSlots)) {
    for (let i = 0; i < data.equippedSlots.length; i++) {
      const slot = data.equippedSlots[i];
      if (slot && !BRAINROTS.some(b => b.name === slot.name)) data.equippedSlots[i] = null;
    }
  }
  if (data.personalExist) {
    for (const name in data.personalExist) if (!BRAINROTS.some(b => b.name === name)) delete data.personalExist[name];
  }
  return data;
}
function generateMerchantItems() {
  const shuffled = [...BRAINROTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 3);
  const items = selected.map(item => ({
    name: item.name,
    price: Math.floor(item.rarity.baseCoins * 15 + Math.random() * 50),
    icon: item.icon,
    rarity: item.rarity
  }));
  const resetTime = Date.now() + 20 * 60 * 1000;
  merchantData = { items, resetTime };
  writeJSON(MERCHANT_FILE, merchantData);
  return merchantData;
}
function ensureMerchant() {
  if (!merchantData.items || merchantData.resetTime < Date.now()) return generateMerchantItems();
  return merchantData;
}

// ========== API ==========
app.get('/api/rarities', (req, res) => res.json(RARITIES));
app.get('/api/brainrots', (req, res) => res.json(BRAINROTS));
app.get('/api/baseChances', (req, res) => {
  const base = RARITIES.map(r => ({ name: r.name, chance: r.baseChance, color: r.color, gradient: r.gradient, icon: r.icon }));
  res.json(base);
});
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || accounts[username]) return res.status(400).json({ error: 'Invalid username or already exists' });
  const hashed = await bcrypt.hash(password, 10);
  accounts[username] = { password: hashed, verified: false };
  writeJSON(ACCOUNTS_FILE, accounts);
  res.json({ success: true });
});
app.post('/api/login', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  if (bannedIPs.includes(clientIP)) return res.status(403).json({ error: 'Your IP is banned' });
  const { username, password } = req.body;
  const acc = accounts[username];
  if (!acc || !(await bcrypt.compare(password, acc.password))) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = username;
  let userData = loadUserData(username);
  userData = cleanUserData(userData);
  saveUserData(username, userData);
  res.json({ success: true, userData });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.post('/api/income', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  let userData = loadUserData(req.session.user);
  const now = Date.now();
  const last = userData.lastIncomeTime || now;
  const deltaSeconds = Math.floor((now - last) / 1000);
  let gained = 0;
  if (deltaSeconds > 0) {
    let totalIncome = 0;
    for (let slot of userData.equippedSlots) if (slot) totalIncome += Math.max(1, Math.floor(slot.baseCoins / 10));
    gained = totalIncome * deltaSeconds;
    userData.brainCoins = Math.min(1e7, userData.brainCoins + gained);
    userData.lastIncomeTime = now;
    saveUserData(req.session.user, userData);
  }
  res.json({ success: true, userData, gained });
});
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  let userData = loadUserData(req.session.user);
  userData = cleanUserData(userData);
  res.json({ userData });
});
app.post('/api/summon', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  let userData = loadUserData(req.session.user);
  const autoRarities = userData.autoDeleteRarities || [];
  const newItem = getRandomItem(userData);
  const serial = incrementGlobalExist(newItem.name);
  const gain = Math.floor(newItem.rarity.baseCoins * getGainMulti(userData));
  userData.brainCoins = Math.min(1e7, userData.brainCoins + gain);
  if (autoRarities.includes(newItem.rarity.name)) {
    saveUserData(req.session.user, userData);
    return res.json({ success: true, userData, lastCard: { item: newItem, serial, autoDeleted: true } });
  }
  const isShiny = Math.random() < 0.01;
  if (!userData.inventory[newItem.name]) userData.inventory[newItem.name] = [];
  userData.inventory[newItem.name].push({ shiny: isShiny, serial });
  userData.personalExist[newItem.name] = (userData.personalExist[newItem.name] || 0) + 1;
  if (isShiny) userData.shinyCount++;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData, lastCard: { item: newItem, serial, autoDeleted: false, shiny: isShiny } });
});
app.post('/api/equip', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { itemName, instanceIdx } = req.body;
  let userData = loadUserData(req.session.user);
  const instances = userData.inventory[itemName];
  if (!instances || !instances[instanceIdx]) return res.status(400).json({ error: 'Item not found' });
  const equippedNames = userData.equippedSlots.filter(s => s !== null).map(s => s.name);
  if (equippedNames.includes(itemName)) return res.status(400).json({ error: 'Already equipped' });
  const emptyIdx = userData.equippedSlots.findIndex(s => s === null);
  if (emptyIdx === -1) return res.status(400).json({ error: 'All slots full' });
  const target = instances[instanceIdx];
  const brain = BRAINROTS.find(b => b.name === itemName);
  const slotItem = { name: itemName, shiny: target.shiny, serial: target.serial, baseCoins: brain.rarity.baseCoins };
  instances.splice(instanceIdx, 1);
  if (instances.length === 0) delete userData.inventory[itemName];
  userData.equippedSlots[emptyIdx] = slotItem;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.post('/api/unequip', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { slotIdx } = req.body;
  let userData = loadUserData(req.session.user);
  const slot = userData.equippedSlots[slotIdx];
  if (!slot) return res.status(400).json({ error: 'Slot empty' });
  const brain = BRAINROTS.find(b => b.name === slot.name);
  if (!brain) {
    userData.equippedSlots[slotIdx] = null;
    saveUserData(req.session.user, userData);
    return res.json({ success: true, userData });
  }
  const newSerial = getGlobalSerial(slot.name);
  incrementGlobalExist(slot.name);
  if (!userData.inventory[slot.name]) userData.inventory[slot.name] = [];
  userData.inventory[slot.name].push({ shiny: slot.shiny, serial: newSerial });
  userData.personalExist[slot.name] = (userData.personalExist[slot.name] || 0) + 1;
  userData.equippedSlots[slotIdx] = null;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.post('/api/upgrade', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { type } = req.body;
  let userData = loadUserData(req.session.user);
  let cost, maxed = false;
  switch (type) {
    case 'cd':
      if (userData.cdLevel >= 50) maxed = true;
      else cost = getCdCost(userData);
      break;
    case 'luck':
      if (userData.luckLevel >= 50) maxed = true;
      else cost = getLuckCost(userData);
      break;
    case 'gain':
      if (userData.gainLevel >= 50) maxed = true;
      else cost = getGainCost(userData);
      break;
    default: return res.status(400).json({ error: 'Invalid type' });
  }
  if (maxed) return res.status(400).json({ error: 'Max level reached' });
  if (userData.brainCoins < cost) return res.status(400).json({ error: 'Not enough coins' });
  userData.brainCoins -= cost;
  if (type === 'cd') userData.cdLevel++;
  else if (type === 'luck') userData.luckLevel++;
  else if (type === 'gain') userData.gainLevel++;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.get('/api/merchant', (req, res) => {
  const data = ensureMerchant();
  res.json(data);
});
app.post('/api/merchant/buy', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { itemName } = req.body;
  const merchant = ensureMerchant();
  const item = merchant.items.find(i => i.name === itemName);
  if (!item) return res.status(404).json({ error: 'Item not available' });
  let userData = loadUserData(req.session.user);
  if (userData.brainCoins < item.price) return res.status(400).json({ error: 'Not enough coins' });
  userData.brainCoins -= item.price;
  const serial = getGlobalSerial(itemName);
  incrementGlobalExist(itemName);
  if (!userData.inventory[itemName]) userData.inventory[itemName] = [];
  userData.inventory[itemName].push({ shiny: false, serial });
  userData.personalExist[itemName] = (userData.personalExist[itemName] || 0) + 1;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.get('/api/market/offers', (req, res) => { res.json(marketOffers); });
app.post('/api/market/offer', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { itemName, price, serial } = req.body;
  if (!itemName || !price || price < 1 || price > 1e11) return res.status(400).json({ error: 'Invalid price' });
  let userData = loadUserData(req.session.user);
  const instances = userData.inventory[itemName];
  if (!instances || instances.length === 0) return res.status(400).json({ error: 'Not owned' });
  let idx = instances.findIndex(i => i.serial === serial);
  if (idx === -1) idx = instances.length - 1;
  const removed = instances.splice(idx, 1)[0];
  if (instances.length === 0) delete userData.inventory[itemName];
  saveUserData(req.session.user, userData);
  const offerId = Date.now() + Math.floor(Math.random() * 10000);
  marketOffers.push({ offerId, itemName, sellerUsername: req.session.user, price, timestamp: Date.now(), serial: removed.serial });
  writeJSON(MARKET_OFFERS_FILE, marketOffers);
  res.json({ success: true, marketOffers });
});
app.post('/api/market/buy', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { offerId } = req.body;
  const idx = marketOffers.findIndex(o => o.offerId === offerId);
  if (idx === -1) return res.status(404).json({ error: 'Offer not found' });
  const offer = marketOffers[idx];
  if (offer.sellerUsername === req.session.user) return res.status(400).json({ error: 'Cannot buy own offer' });
  let buyer = loadUserData(req.session.user);
  if (buyer.brainCoins < offer.price) return res.status(400).json({ error: 'Not enough coins' });
  buyer.brainCoins -= offer.price;
  let seller = loadUserData(offer.sellerUsername);
  const commission = Math.floor(offer.price * 0.2);
  seller.brainCoins += offer.price - commission;
  saveUserData(offer.sellerUsername, seller);
  const newSerial = getGlobalSerial(offer.itemName);
  incrementGlobalExist(offer.itemName);
  if (!buyer.inventory[offer.itemName]) buyer.inventory[offer.itemName] = [];
  buyer.inventory[offer.itemName].push({ shiny: false, serial: newSerial });
  buyer.personalExist[offer.itemName] = (buyer.personalExist[offer.itemName] || 0) + 1;
  saveUserData(req.session.user, buyer);
  marketOffers.splice(idx, 1);
  writeJSON(MARKET_OFFERS_FILE, marketOffers);
  res.json({ success: true, marketOffers });
});
app.post('/api/deleteItem', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { itemName, idx } = req.body;
  let userData = loadUserData(req.session.user);
  const instances = userData.inventory[itemName];
  if (!instances || !instances[idx]) return res.status(400).json({ error: 'Item not found' });
  instances.splice(idx, 1);
  if (instances.length === 0) delete userData.inventory[itemName];
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.post('/api/autoDelete', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { rarities } = req.body;
  let userData = loadUserData(req.session.user);
  userData.autoDeleteRarities = rarities;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.post('/api/user/settings', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { displayName, avatar } = req.body;
  let userData = loadUserData(req.session.user);
  if (displayName) userData.displayName = displayName;
  if (avatar !== undefined) userData.avatar = avatar;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});
app.get('/api/globalExist', (req, res) => { res.json(globalExist); });
app.get('/api/chances', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const userData = loadUserData(req.session.user);
  const chances = getCurrentChances(userData);
  res.json({ chances });
});
app.get('/api/leaderboard', (req, res) => {
  const allUsers = Object.keys(accounts);
  const scores = [];
  for (const user of allUsers) {
    const data = loadUserData(user);
    let total = data.brainCoins || 0;
    for (const [name, instances] of Object.entries(data.inventory || {})) {
      const brain = BRAINROTS.find(b => b.name === name);
      if (brain) total += brain.rarity.value * instances.length;
    }
    for (const slot of data.equippedSlots || []) {
      if (slot) {
        const brain = BRAINROTS.find(b => b.name === slot.name);
        if (brain) total += brain.rarity.value;
      }
    }
    scores.push({ username: user, displayName: data.displayName || user, value: total, avatar: data.avatar, verified: data.verified });
  }
  scores.sort((a, b) => b.value - a.value);
  res.json(scores.slice(0, 100));
});

// ========== АДМИН-ЭНДПОИНТЫ ==========
function ensureAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const userData = loadUserData(req.session.user);
  if (!userData.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}
app.get('/api/admin/players', ensureAdmin, (req, res) => res.json(Object.keys(accounts)));
app.get('/api/admin/player/:username', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (!accounts[username]) return res.status(404).json({ error: 'Player not found' });
  const userData = loadUserData(username);
  res.json({ username, verified: userData.verified, isAdmin: userData.isAdmin || false, brainCoins: userData.brainCoins, inventory: userData.inventory, displayName: userData.displayName, avatar: userData.avatar });
});
app.post('/api/admin/player/:username/coins', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot modify Magnitude' });
  const { amount } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });
  let userData = loadUserData(username);
  userData.brainCoins = Math.min(1e7, (userData.brainCoins || 0) + amount);
  saveUserData(username, userData);
  res.json({ success: true, coins: userData.brainCoins });
});
app.post('/api/admin/player/:username/giveItem', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot modify Magnitude' });
  const { itemName } = req.body;
  if (!itemName) return res.status(400).json({ error: 'Item name required' });
  const brain = BRAINROTS.find(b => b.name === itemName);
  if (!brain) return res.status(400).json({ error: 'Invalid item name' });
  let userData = loadUserData(username);
  const serial = incrementGlobalExist(itemName);
  if (!userData.inventory[itemName]) userData.inventory[itemName] = [];
  userData.inventory[itemName].push({ shiny: false, serial });
  userData.personalExist[itemName] = (userData.personalExist[itemName] || 0) + 1;
  saveUserData(username, userData);
  res.json({ success: true, serial });
});
app.post('/api/admin/player/:username/toggleVerify', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot modify Magnitude' });
  let userData = loadUserData(username);
  userData.verified = !userData.verified;
  saveUserData(username, userData);
  res.json({ success: true, verified: userData.verified });
});
app.post('/api/admin/player/:username/clearInventory', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot modify Magnitude' });
  let userData = loadUserData(username);
  userData.inventory = {};
  userData.personalExist = {};
  userData.shinyCount = 0;
  saveUserData(username, userData);
  res.json({ success: true });
});
app.post('/api/admin/player/:username/ban', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot ban Magnitude' });
  const currentAdmin = loadUserData(req.session.user);
  const targetData = loadUserData(username);
  if (targetData.isAdmin && currentAdmin.username !== 'Magnitude') return res.status(403).json({ error: 'You cannot ban another admin' });
  let userData = loadUserData(username);
  userData.inventory = {};
  userData.personalExist = {};
  userData.shinyCount = 0;
  userData.brainCoins = 0;
  userData.cdLevel = 0;
  userData.luckLevel = 0;
  userData.gainLevel = 0;
  userData.autoDeleteRarities = [];
  userData.equippedSlots = [null, null, null, null, null];
  userData.verified = false;
  userData.isAdmin = false;
  userData.avatar = '/icons/Default.png';
  saveUserData(username, userData);
  res.json({ success: true });
});
app.post('/api/admin/player/:username/settings', ensureAdmin, (req, res) => {
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot modify Magnitude' });
  const { displayName, avatar } = req.body;
  let userData = loadUserData(username);
  if (displayName) userData.displayName = displayName;
  if (avatar !== undefined) userData.avatar = avatar;
  saveUserData(username, userData);
  res.json({ success: true });
});
app.post('/api/admin/player/:username/toggleAdmin', ensureAdmin, (req, res) => {
  const currentAdmin = loadUserData(req.session.user);
  if (currentAdmin.username !== 'Magnitude') return res.status(403).json({ error: 'Only Magnitude can assign admin rights' });
  const { username } = req.params;
  if (username === 'Magnitude') return res.status(403).json({ error: 'Cannot change Magnitude\'s admin status' });
  let userData = loadUserData(username);
  userData.isAdmin = !userData.isAdmin;
  saveUserData(username, userData);
  res.json({ success: true, isAdmin: userData.isAdmin });
});
app.get('/api/admin/bannedIPs', ensureAdmin, (req, res) => { res.json(bannedIPs); });
app.post('/api/admin/banIP', ensureAdmin, (req, res) => {
  const currentAdmin = loadUserData(req.session.user);
  if (currentAdmin.username !== 'Magnitude') return res.status(403).json({ error: 'Only Magnitude can ban IPs' });
  const { ip } = req.body;
  if (!bannedIPs.includes(ip)) bannedIPs.push(ip);
  saveBannedIPs();
  res.json({ success: true, bannedIPs });
});
app.post('/api/admin/unbanIP', ensureAdmin, (req, res) => {
  const currentAdmin = loadUserData(req.session.user);
  if (currentAdmin.username !== 'Magnitude') return res.status(403).json({ error: 'Only Magnitude can unban IPs' });
  const { ip } = req.body;
  bannedIPs = bannedIPs.filter(i => i !== ip);
  saveBannedIPs();
  res.json({ success: true, bannedIPs });
});
app.get('/api/admin/marketOffers', ensureAdmin, (req, res) => { res.json(marketOffers); });
app.post('/api/admin/marketOffers/delete', ensureAdmin, (req, res) => {
  const { offerId } = req.body;
  const idx = marketOffers.findIndex(o => o.offerId === offerId);
  if (idx === -1) return res.status(404).json({ error: 'Offer not found' });
  marketOffers.splice(idx, 1);
  writeJSON(MARKET_OFFERS_FILE, marketOffers);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));