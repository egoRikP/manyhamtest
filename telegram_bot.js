console.log("START TELEGRAM_BOT.JS");

const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const groupId = '-4268517821';
const bot = new TelegramBot(token, { polling: true });
const fileDirectory = '/etc/secrets'; // Директорія для файлів
const renderApiUrl = 'https://api.render.com/v1/services/srv-cpa4gjtds78s73cr1rug/secret-files/'; // URL API
const bearerToken = 'rnd_Ldv8aQTr3XHGjPgmkbmVCeMgvdmb'; // Bearer Token

let downloadingFile = {}; // Зберігає інформацію про файл, який завантажується

// Функції для обробки команд
const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
    '/tokens': handleTokenList,
    // '/check': checkApi,
    '/file': handleConfigFile,
    '/download': handleDownloadCommand,
    '/edit': handleEditCommand,
};

// Обробка помилок
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    sendLogMessage('Polling error: ' + error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
    sendLogMessage('Webhook error: ' + error.message);
});

// Функція для отримання токенів з файлу
const getTokensFromFile = () => {
    try {
        return fs.readFileSync(process.env.TOKENS_FILE_PATH, 'utf8').trim().split('\n');
    } catch (error) {
        console.error("Error reading tokens from file: ", error);
        sendLogMessage("Error reading tokens from file: " + error.message);
        process.exit(1);
    }
};

// Обробка команд
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
        const fileName = match[1];
        const filePath = path.join(fileDirectory, fileName);

        try {
            const data = fs.readFileSync(filePath, 'utf8');
            bot.sendMessage(chatId, `Вміст файлу ${fileName}:\n${data}`);
        } catch (error) {
            console.error(`Error reading or parsing the config file: ${filePath}`, error);
            bot.sendMessage(chatId, `Помилка при читанні файлу ${fileName}: ${error.message}`);
        }
    } else {
        bot.sendMessage(chatId, 'Будь ласка, вкажіть ім\'я файлу.');
    }
}

function handleDownloadCommand(msg, match) {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        fs.readFile(filePath, 'utf8', (err, fileData) => {
            if (err) {
                bot.sendMessage(chatId, `Помилка при читанні файлу ${fileName}: ${err.message}`);
                return;
            }
            bot.sendDocument(chatId, { source: Buffer.from(fileData, 'utf8'), filename: fileName });
        });
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не існує.`);
    }
}

function handleEditCommand(msg, match) {
    const chatId = msg.chat.id;
    const fileName = match[1];
    downloadingFile[chatId] = fileName; // Запам'ятовуємо файл для цього користувача
    bot.sendMessage(chatId, `Введіть новий вміст для файлу ${fileName}:`);
}

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;

    if (downloadingFile[chatId]) {
        bot.getFile(fileId).then(fileInfo => {
            const filePath = path.join(__dirname, 'downloads', msg.document.file_name);
            bot.downloadFile(fileId, __dirname + '/downloads').then(() => {
                fs.readFile(filePath, 'utf8', async (err, data) => {
                    if (err) {
                        bot.sendMessage(chatId, `Помилка при читанні нового файлу: ${err.message}`);
                        return;
                    }
                    
                    const apiUrl = renderApiUrl + downloadingFile[chatId];
                    try {
                        await axios.put(apiUrl, { content: data }, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${bearerToken}`
                            }
                        });
                        bot.sendMessage(chatId, `Файл ${downloadingFile[chatId]} успішно оновлено.`);
                    } catch (error) {
                        bot.sendMessage(chatId, `Помилка при оновленні файлу ${downloadingFile[chatId]}: ${error.message}`);
                    }
                    delete downloadingFile[chatId]; // Очищаємо запис про редагування
                });
            }).catch(error => {
                bot.sendMessage(chatId, `Помилка при завантаженні нового файлу: ${error.message}`);
            });
        }).catch(error => {
            bot.sendMessage(chatId, `Помилка при отриманні інформації про файл: ${error.message}`);
        });
    }
});

// Обробка команд
for (const [command, handler] of Object.entries(commandHandlers)) {
    bot.onText(new RegExp(`^${command} ?(.*)$`), handler);
}

// Функція для надсилання лог-повідомлень
const sendLogMessage = (message) => {
    bot.sendMessage(groupId, message);
};

module.exports = {
    sendLogMessage
};
