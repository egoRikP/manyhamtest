const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Шлях до директорії з файлами
const secretsDir = '/etc/secrets/';

// Завантаження конфігурації
function loadConfig() {
    const configPath = path.join(secretsDir, 'config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

const config = loadConfig();
const games = config.games;

// Завантаження проксі
function loadProxies() {
    let proxies = [];
    if (config.use_proxies) {
        try {
            const proxyPath = path.join(secretsDir, 'proxies.txt');
            const proxyData = fs.readFileSync(proxyPath, 'utf-8');
            proxies = proxyData.split('\n').map(line => parseProxy(line.trim()));
        } catch (error) {
            console.log('proxies.txt not found');
        }
    }
    return proxies;
}

function parseProxy(proxyString, protocol = 'http') {
    const [auth, hostPort] = proxyString.split('@');
    const [username, password] = auth.split(':');
    const [host, port] = hostPort.split(':');

    if (protocol.toLowerCase() === 'socks5') {
        return `socks5://${username}:${password}@${host}:${port}`;
    } else {
        return `http://${username}:${password}@${host}:${port}`;
    }
}

function getProxy(proxies) {
    if (proxies.length > 0) {
        return proxies[Math.floor(Math.random() * proxies.length)];
    }
    return null;
}

function generateClientId() {
    const timestamp = Date.now();
    const randomNumbers = Array.from({ length: 19 }, () => Math.floor(Math.random() * 10)).join('');
    return `${timestamp}-${randomNumbers}`;
}

async function login(clientId, appToken, proxy = null) {
    try {
        const response = await axios.post('https://api.gamepromo.io/promo/login-client', {
            appToken: appToken,
            clientId: clientId,
            clientOrigin: 'deviceid'
        }, { proxy: proxy ? { host: proxy.split('@')[1].split(':')[0], port: proxy.split('@')[1].split(':')[1] } : undefined });

        return response.data.clientToken;
    } catch (error) {
        throw new Error('Failed to login');
    }
}

async function emulateProgress(clientToken, promoId, proxy = null) {
    try {
        const response = await axios.post('https://api.gamepromo.io/promo/register-event', {
            promoId: promoId,
            eventId: uuidv4(),
            eventOrigin: 'undefined'
        }, {
            headers: { 'Authorization': `Bearer ${clientToken}` },
            proxy: proxy ? { host: proxy.split('@')[1].split(':')[0], port: proxy.split('@')[1].split(':')[1] } : undefined
        });

        return response.data.hasCode;
    } catch (error) {
        return false;
    }
}

async function generateKey(clientToken, promoId, proxy = null) {
    try {
        const response = await axios.post('https://api.gamepromo.io/promo/create-code', {
            promoId: promoId
        }, {
            headers: { 'Authorization': `Bearer ${clientToken}` },
            proxy: proxy ? { host: proxy.split('@')[1].split(':')[0], port: proxy.split('@')[1].split(':')[1] } : undefined
        });

        return response.data.promoCode;
    } catch (error) {
        throw new Error('Failed to generate key');
    }
}

async function generateKeyProcess(game, proxies) {
    const clientId = generateClientId();
    let clientToken;
    try {
        clientToken = await login(clientId, game.appToken, getProxy(proxies));
    } catch (error) {
        console.log('Failed to login:', error.message);
        return null;
    }

    for (let i = 0; i < 11; i++) {
        await new Promise(resolve => setTimeout(resolve, 20000 + Math.random() * 3000));
        const hasCode = await emulateProgress(clientToken, game.promoId, getProxy(proxies));
        console.log(`Progress: ${(i + 1) / 11 * 100}% complete`);

        if (hasCode) break;
    }

    try {
        const key = await generateKey(clientToken, game.promoId, getProxy(proxies));
        return key;
    } catch (error) {
        console.log('Failed to generate key:', error.message);
        return null;
    }
}

async function mainGamePromo() {
    const proxies = loadProxies();
    const howMuch = config.key_count || 0;
    const countdownDelay = config.countdown_delay || 10;
    const randomSelection = config.random_selection || false;
    const selectedGameIds = config.selected_games || [];
    
    const selectedGames = randomSelection
        ? Object.values(games).sort(() => 0.5 - Math.random()).slice(0, howMuch)
        : selectedGameIds.map(gameId => games[gameId]).filter(Boolean);

    for (const game of selectedGames) {
        console.log(`Generating ${howMuch} promo codes for ${game.name}...`);
        const keys = await Promise.all(Array.from({ length: howMuch }, () => generateKeyProcess(game, proxies)));

        const validKeys = keys.filter(Boolean);
        if (validKeys.length > 0) {
            fs.appendFileSync(path.join(secretsDir, 'newPromo.txt'), validKeys.join('\n') + '\n');
        }

        console.log(`Generated ${validKeys.length} promo codes for ${game.name}. Sleeping for ${countdownDelay} seconds...`);
        await new Promise(resolve => setTimeout(resolve, countdownDelay * 1000));
    }
}

// Шляхи до файлів
const promoFilePath = path.join(secretsDir, 'promo.txt');
const tokensFilePath = path.join(secretsDir, 'tokens.txt');

// Завантаження токенів з файлу
function loadTokens() {
    const tokensData = fs.readFileSync(tokensFilePath, 'utf-8');
    return tokensData.split('\n').map(token => token.trim()).filter(Boolean);
}

// Завантаження промокодів з файлу
function loadPromoCodes() {
    const promoCodesData = fs.readFileSync(promoFilePath, 'utf-8');
    return promoCodesData.split('\n').map(code => code.trim()).filter(Boolean);
}

// Надсилання запиту
async function applyPromoCode(token, promoCode) {
    try {
        const response = await axios.post('https://api.hamsterkombatgame.io/clicker/apply-promo', 
            { promoCode: promoCode }, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return response.data;
    } catch (error) {
        console.error(`Error applying promo code ${promoCode} for token ${token}:`, error.message);
        return null;
    }
}

// Оновлення файлу з промокодами
function updatePromoCodes(promoCodes) {
    fs.writeFileSync(promoFilePath, promoCodes.join('\n') + '\n');
}

// Основна функція
async function mainApplyPromo() {
    const tokens = loadTokens();
    let promoCodes = loadPromoCodes();

    // Перевірка кількості промокодів
    if (promoCodes.length === 0) {
        console.log('No promo codes available.');
        return;
    }

    // Групування промокодів за типами
    const groupedPromoCodes = promoCodes.reduce((acc, code) => {
        const type = code.split('-')[0]; // Тип промокоду
        if (!acc[type]) {
            acc[type] = [];
        }
        acc[type].push(code);
        return acc;
    }, {});

    // Обробка кожного токену
    for (const token of tokens) {
        console.log(`Applying promo codes for token ${token}`);
        let promoTypes = Object.keys(groupedPromoCodes);
        let failedPromoTypes = new Set(); // Відстежування типів, для яких вже були помилки

        while (promoTypes.length > 0) {
            const promoType = promoTypes.shift();
            if (failedPromoTypes.has(promoType)) {
                console.log(`Skipping promo type ${promoType} for token ${token}`);
                continue; // Пропускаємо тип, якщо вже були помилки
            }

            const promoCodesOfType = groupedPromoCodes[promoType];
            let typeFailed = false;

            for (const promoCode of promoCodesOfType) {
                console.log(`Applying promo code ${promoCode} for token ${token}`);
                const result = await applyPromoCode(token, promoCode);

                if (result) {
                    console.log(`Successfully applied promo code ${promoCode} for token ${token}`);
                    // Видалення активованого промокоду
                    promoCodes = promoCodes.filter(code => code !== promoCode);
                    updatePromoCodes(promoCodes);
                    // Продовжуємо перевіряти інші промокоди для цього типу
                } else {
                    console.log(`Failed to apply promo code ${promoCode} for token ${token}`);
                    typeFailed = true;
                    break; // Припиняємо перевірку цього типу промокоду
                }

                await new Promise(resolve => setTimeout(resolve, 2000)); // Затримка 2 секунди між запитами
            }

            if (typeFailed) {
                failedPromoTypes.add(promoType); // Додаємо тип до списку невдалих типів
            }
        }
    }
}

// Виконання скриптів кожні 5 годин за допомогою node-cron
cron.schedule('0 */5 * * *', async () => {
    console.log('Запуск процесу перевірки промокодів та ігор...');
    await mainGamePromo();
    await mainApplyPromo();
    console.log('Процес завершено. Очікування наступного запуску.');
});
