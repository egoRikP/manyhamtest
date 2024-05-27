console.log("START HTSTR_LOGIC.JS");
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const {sendLogMessage} = require('./telegram_bot');

const TOKENS_FILE_PATH = process.env.TOKENS_FILE_PATH || './etc/secrets/tokens.txt';

const TIME_TAP = process.env.TIME_TAP || 30;
const FREE_TAP = process.env.FREE_TAP || 3;

const baseURL = "https://api.hamsterkombat.io/clicker/";
const endpoints = {
    sync: "sync",
    tap: "tap",
    upgradesForBuy: "upgrades-for-buy",
    buyUpgrade: "buy-upgrade",
    buyBoost: "buy-boost"
};

const getTokensFromFile = () => {
    try {
        return fs.readFileSync(TOKENS_FILE_PATH, 'utf8').trim().split('\n');
    } catch (error) {
        console.error("Error reading tokens from file: ", error);
        sendLogMessage("Error reading tokens from file: " + error.message);
        process.exit(1);
    }
};

const tokens = getTokensFromFile();

const currentTimestamp = () => Math.floor(Date.now() / 1000);

const sendRequest = async (endpoint, data, token) => {
    try {
        const response = await axios.post(baseURL + endpoint, {
            timestamp: currentTimestamp(),
            ...data,
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data;
    } catch (error) {
        const errorMessage = `Помилка в надсиланні запиту на ${endpoint}: ${error.response ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message}`;
        sendLogMessage(errorMessage);
        throw new Error(errorMessage);
    }
};

const tap = async (token) => sendRequest(endpoints.tap, {count: 1000, availableTaps: 0}, token);
const getInfo = async (token) => sendRequest(endpoints.sync, {}, token);
const getUpgrades = async (token) => sendRequest(endpoints.upgradesForBuy, {}, token);

const buyUpgradeOrBoost = async ({upgradeId, boostId}, token) => {
    const endpoint = upgradeId ? endpoints.buyUpgrade : endpoints.buyBoost;
    const id = upgradeId || boostId;
    try {
        await sendRequest(endpoint, {upgradeId, boostId, timestamp: currentTimestamp()}, token);
        const successMessage = `Успішно куплено ${upgradeId ? 'апгрейд' : 'буст'} з ID: ${id}`;
        sendLogMessage(successMessage);
        console.log(successMessage);
    } catch (error) {
        const errorMessage = error.response && error.response.data && error.response.data.error_code === "INSUFFICIENT_FUNDS"
            ? `Недостатньо коштів для покупки ${upgradeId ? 'апгрейду' : 'бусту'} з ID: ${id}`
            : `Помилка покупки ${upgradeId ? 'апгрейду' : 'бусту'} з ID: ${id}: ${error.response ? error.response.data.error_code : error.message}`;
        sendLogMessage(errorMessage);
        console.error(errorMessage);
    }
};

const buyUpgrades = async (items, token) => {
    for (const item of items) {
        if (item.id) {
            await buyUpgradeOrBoost({upgradeId: item.id}, token);
        } else {
            const errorMessage = 'Помилка: ID апгрейду або бусту не надано для елемента ' + JSON.stringify(item);
            sendLogMessage(errorMessage);
            console.error(errorMessage);
        }
    }
};

const processUpgrades = async (token) => {
    try {
        const {upgradesForBuy} = await getUpgrades(token);
        const bestOffers = analyzeUpgrades(upgradesForBuy);
        const bestOffersMessage = "Найвигідніші доступні акції:\n" + bestOffers.map((offer, index) =>
            `${index + 1}. ID: ${offer.id}, Назва: ${offer.name}, Ціна: ${offer.price}, Профіт: ${offer.profitPerHourDelta}, Відношення профіту до ціни: ${(offer.profitPerHourDelta / offer.price).toFixed(5)}`
        ).join('\n');
        sendLogMessage(bestOffersMessage);
        console.log(bestOffersMessage);
        await buyUpgrades(bestOffers, token);
    } catch (error) {
        const errorMessage = 'Помилка обробки апгрейдів: ' + error.message;
        sendLogMessage(errorMessage);
        console.error(errorMessage);
    }
};

const analyzeUpgrades = (upgrades) =>
    upgrades
        .filter(upgrade => upgrade.isAvailable && !upgrade.isExpired)
        .map(upgrade => ({
            ...upgrade,
            profitToPriceRatio: upgrade.profitPerHourDelta / upgrade.price
        }))
        .sort((a, b) => b.profitToPriceRatio - a.profitToPriceRatio)
        .slice(0, 3);

const processTap = async (token) => {
    try {
        console.log(`ТОКЕН: ${token}`);
        sendLogMessage(`ТОКЕН: ${token}`);
        const tapMessage = "ПРОЙШЛО 33 ХВ - КЛІКАЮ!";
        sendLogMessage(tapMessage);
        console.log(tapMessage);
        await tap(token);
        await processUpgrades(token);
    } catch (error) {
        const errorMessage = 'Помилка під час кліка: ' + error.message;
        sendLogMessage(errorMessage);
        console.error(errorMessage);
    }
};

const processFreeTapsAndTap = async (token) => {
    try {
        console.log(`ТОКЕН: ${token}`);
        sendLogMessage(`ТОКЕН: ${token}`);
        const freeTapMessage = "ПРОЙШЛИ 3 ГОДИНИ - БЕРЕМО ФРІ КЛІКИ!";
        sendLogMessage(freeTapMessage);
        console.log(freeTapMessage);
        await buyUpgradeOrBoost({boostId: "BoostFullAvailableTaps"}, token);
        await tap(token);
    } catch (error) {
        const errorMessage = 'Помилка під час покупки фрі кліків або кліка: ' + error.message;
        sendLogMessage(errorMessage);
        console.error(errorMessage);
    }
};

function proccessTokensTap(tokens) {
    tokens.forEach((e) => {
        processTap(e);
    });
}

function proccessTokensFreeAndTap(tokens) {
    tokens.forEach((e) => {
        processFreeTapsAndTap(e);
    })
}

cron.schedule(`*/${TIME_TAP} * * * *`, () => proccessTokensTap(tokens));
cron.schedule(`0 0 */${FREE_TAP} * * *`, () => proccessTokensFreeAndTap(tokens));

module.exports = {
    getTokensFromFile,
    tokens
};