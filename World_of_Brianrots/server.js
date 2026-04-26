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
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true }
}));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const GLOBAL_EXIST_FILE = path.join(DATA_DIR, 'globalExist.json');
const MARKET_OFFERS_FILE = path.join(DATA_DIR, 'marketOffers.json');
const MERCHANT_FILE = path.join(DATA_DIR, 'merchant.json');

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

function getUserDataFile(username) {
  return path.join(DATA_DIR, `${username}.json`);
}

function loadUserData(username) {
  const file = getUserDataFile(username);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    inventory: {}, personalExist: {}, shinyCount: 0, brainCoins: 200,
    cdLevel: 0, luckLevel: 0, gainLevel: 0, displayName: username,
    avatar: '/icons/Default.png', autoDeleteRarities: [], verified: false,
    equippedSlots: [null, null, null, null, null], lastIncomeTime: Date.now()
  };
}

function saveUserData(username, data) {
  writeJSON(getUserDataFile(username), data);
}

function getIncomePerSec(baseCoins) { return Math.max(1, Math.floor(baseCoins / 10)); }
function getGainMulti(userData) { return 1 + (userData.gainLevel * 0.1); }
function getCooldown(userData) { return Math.max(0.1, 5 - (userData.cdLevel * (4.9 / 50))); }
function getLuckMulti(userData) { return 1 + (userData.luckLevel * (9 / 50)); }
function getCdCost(userData) { return Math.floor(50 + userData.cdLevel * userData.cdLevel * 1.5); }
function getLuckCost(userData) { return Math.floor(60 + userData.luckLevel * userData.luckLevel * 2); }
function getGainCost(userData) { return Math.floor(70 + userData.gainLevel * userData.gainLevel * 2); }
function getCurrentChances(userData) { /* возвращаем шансы */ return []; }
function rollRarity(userData) { return RARITIES[0]; }
function getRandomItem(userData) { return BRAINROTS[0]; }
function incrementGlobalExist(itemName) {
  globalExist[itemName] = (globalExist[itemName] || 0) + 1;
  writeJSON(GLOBAL_EXIST_FILE, globalExist);
  return globalExist[itemName];
}
function getGlobalSerial(itemName) { return (globalExist[itemName] || 0) + 1; }
function cleanUserData(data) { return data; }
function ensureMerchant() { return merchantData; }

// API маршруты
app.get('/api/rarities', (req, res) => res.json(RARITIES));
app.get('/api/brainrots', (req, res) => res.json(BRAINROTS));
app.get('/api/baseChances', (req, res) => res.json(RARITIES.map(r => ({ name: r.name, chance: r.baseChance }))));

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || accounts[username]) return res.status(400).json({ error: 'Invalid' });
    const hashed = await bcrypt.hash(password, 10);
    accounts[username] = { password: hashed };
    writeJSON(ACCOUNTS_FILE, accounts);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const acc = accounts[username];
    if (!acc || !(await bcrypt.compare(password, acc.password))) return res.status(401).json({ error: 'Invalid' });
    req.session.user = username;
    let userData = loadUserData(username);
    res.json({ success: true, userData });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/income', (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    let userData = loadUserData(req.session.user);
    const now = Date.now();
    const last = userData.lastIncomeTime || now;
    const deltaSeconds = Math.max(0, Math.floor((now - last) / 1000));
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const userData = loadUserData(req.session.user);
  res.json({ userData });
});

app.post('/api/summon', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  let userData = loadUserData(req.session.user);
  const newItem = getRandomItem(userData);
  const serial = incrementGlobalExist(newItem.name);
  const gain = Math.floor(newItem.rarity.baseCoins * getGainMulti(userData));
  userData.brainCoins = Math.min(1e7, userData.brainCoins + gain);
  if (!userData.inventory[newItem.name]) userData.inventory[newItem.name] = [];
  const isShiny = Math.random() < 0.01;
  userData.inventory[newItem.name].push({ shiny: isShiny, serial });
  userData.personalExist[newItem.name] = (userData.personalExist[newItem.name] || 0) + 1;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData, lastCard: { item: newItem, serial, autoDeleted: false, shiny: isShiny } });
});

app.post('/api/equip', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { itemName, instanceIdx } = req.body;
  let userData = loadUserData(req.session.user);
  const instances = userData.inventory[itemName];
  if (!instances || !instances[instanceIdx]) return res.status(400).json({ error: 'Item not found' });
  const target = instances[instanceIdx];
  const brain = BRAINROTS.find(b => b.name === itemName);
  if (!brain) return res.status(400).json({ error: 'Invalid' });
  const emptyIdx = userData.equippedSlots.findIndex(s => s === null);
  if (emptyIdx === -1) return res.status(400).json({ error: 'All slots full' });
  const slotItem = { name: itemName, shiny: target.shiny, serial: target.serial, baseCoins: brain.rarity.baseCoins };
  instances.splice(instanceIdx, 1);
  userData.equippedSlots[emptyIdx] = slotItem;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});

app.post('/api/unequip', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { slotIdx } = req.body;
  let userData = loadUserData(req.session.user);
  const slot = userData.equippedSlots[slotIdx];
  if (!slot) return res.status(400).json({ error: 'Empty' });
  const newSerial = getGlobalSerial(slot.name);
  incrementGlobalExist(slot.name);
  if (!userData.inventory[slot.name]) userData.inventory[slot.name] = [];
  userData.inventory[slot.name].push({ shiny: slot.shiny, serial: newSerial });
  userData.equippedSlots[slotIdx] = null;
  saveUserData(req.session.user, userData);
  res.json({ success: true, userData });
});

app.get('/api/market/offers', (req, res) => res.json(marketOffers));
app.post('/api/market/offer', (req, res) => { /* реализуйте сами */ res.json({ success: true }); });
app.post('/api/market/buy', (req, res) => { res.json({ success: true }); });
app.get('/api/merchant', (req, res) => res.json({ items: [], resetTime: Date.now() + 60000 }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
