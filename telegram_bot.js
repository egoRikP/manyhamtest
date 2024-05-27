console.log("START TELEGRAM_BOT.JS");

const TelegramBot = require('node-telegram-bot-api');

const {getTokensFromFile} = require("./hmstr_logic");

const token = process.env.TELEGRAM_TOKEN;

const groupId = '-4268517821';

const bot = new TelegramBot(token, {polling: true});

const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
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
    const chatId = msg.chat.id;
    const tokens = getTokensFromFile();
    console.log(tokens);
    bot.sendMessage(chatId, 'Токени:' + tokens);
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
