console.log("START TELEGRAM_BOT.JS");

const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const path = require('path');

const { checkApi } = require("./hmstr_logic");
const { fileReader } = require("./utils/fileReader.js");

const token = process.env.TELEGRAM_TOKEN;
const groupId = '-4268517821';
const bot = new TelegramBot(token, { polling: true });

const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
    '/tokens': handleTokenList,
    '/check': checkApi,
    '/file': handleConfigFile,
};

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    sendLogMessage('Polling error: ' + error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
    sendLogMessage('Webhook error: ' + error.message);
});

const getTokensFromFile = () => {
    try {
        return fs.readFileSync(process.env.TOKENS_FILE_PATH, 'utf8').trim().split('\n');
    } catch (error) {
        console.error("Error reading tokens from file: ", error);
        sendLogMessage("Error reading tokens from file: " + error.message);
        process.exit(1);
    }
};

function handleStatusCommand(msg) {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Статус бота: працює');
}

function handleRestartCommand(msg) {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Команда для перезапуска!');
}

function handleTokenList(msg) {
    let tokens = getTokensFromFile();
    let tokenstext = '';
    tokens.forEach((token) => {
        tokenstext += token + '\n' + '\n';
    });
    sendLogMessage(tokenstext);
}

function handleConfigFile(msg, match) {
    const chatId = msg.chat.id;
    if (match && match[1]) {
        const filePath = match[1];
        const fullPath = path.resolve(__dirname, filePath);

        try {
            const data = fs.readFileSync(fullPath, 'utf8');
            bot.sendMessage(chatId, `Вміст файлу ${filePath}:\n${data}`);
        } catch (error) {
            console.error(`Error reading or parsing the config file: ${fullPath}`, error);
            bot.sendMessage(chatId, `Помилка при читанні файлу ${filePath}: ${error.message}`);
        }
    } else {
        bot.sendMessage(chatId, 'Будь ласка, вкажіть шлях до файлу.');
    }
}

for (const [command, handler] of Object.entries(commandHandlers)) {
    bot.onText(new RegExp(`^${command} ?(.*)$`), handler);
}

const sendLogMessage = (message) => {
    bot.sendMessage(groupId, message);
};

module.exports = {
    sendLogMessage
};
