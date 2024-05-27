console.log("START TELEGRAM_BOT.JS");

const TelegramBot = require('node-telegram-bot-api');

const {getTokensFromFile} = require('./hmstr_logic.js');

const token = process.env.TELEGRAM_TOKEN;

const groupId = '-4268517821';

const bot = new TelegramBot(token, {polling: true});

const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
    '/tokens': handleTokenList
};

bot.on('polling_error', console.log);

// bot.on('webhook_error', console.error);

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
    console.log(tokens);
    let tokenstext = '';

    tokens.forEach((token, index, array) => {
        console.log(token);
        tokenstext += token + '\n';
    });

    sendLogMessage(tokenstext);
}


for (const [command, handler] of Object.entries(commandHandlers)) {
    bot.onText(new RegExp(`^${command}$`), handler);
}

const sendLogMessage = (message) => {
    bot.sendMessage(groupId, message);
};

module.exports = {
    sendLogMessage
};
