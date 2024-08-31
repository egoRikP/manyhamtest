const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const groupId = '-4268517821';
const bot = new TelegramBot(token, { polling: true });

const fileDirectory = '/etc/secrets'; // Директорія для файлів
const renderApiUrl = 'https://api.render.com/v1/services/srv-cpnv6f88fa8c73b81s6g/secret-files/'; // URL API
const bearerToken = 'rnd_04BLXty0HtthUCkb8AzBXVda5zSY'; // Bearer Token

let userStates = {};

// Обробка команд
const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
    '/tokens': handleTokenList,
    '/file': handleConfigFile,
    '/download': handleDownloadCommand,
    '/edit': handleEditCommand,
};

// Функції для обробки команд
function handleStatusCommand(msg) {
    bot.sendMessage(msg.chat.id, 'Статус бота: працює');
}

function handleRestartCommand(msg) {
    bot.sendMessage(msg.chat.id, 'Команда для перезапуска!');
}

function handleTokenList(msg) {
    let tokens = getTokensFromFile();
    let tokenstext = tokens.join('\n\n');
    sendLogMessage(tokenstext);
}

function handleConfigFile(msg, match) {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    try {
        const data = fs.readFileSync(filePath, 'utf8');
        bot.sendMessage(chatId, `Вміст файлу ${fileName}:\n${data}`);
    } catch (error) {
        bot.sendMessage(chatId, `Помилка при читанні файлу ${fileName}: ${error.message}`);
    }
}

function handleDownloadCommand(msg, match) {
    const chatId = msg.chat.id;
    const fileName = match[1]?.trim();
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        bot.sendDocument(groupId, filePath)
            .then(() => bot.sendMessage(chatId, `Файл ${fileName} успішно надіслано до групи.`))
            .catch(error => bot.sendMessage(chatId, `Помилка при надсиланні файлу ${fileName} до групи: ${error.message}`));
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не знайдено.`);
    }
}

function handleEditCommand(msg) {
    const chatId = msg.chat.id;

    userStates[chatId] = { expectingFile: true };
    bot.sendMessage(chatId, 'Чекаю на новий контент у форматі .txt для переписування файлу. Надішліть файл для редагування.');
}

function getTokensFromFile() {
    try {
        return fs.readFileSync(process.env.TOKENS_FILE_PATH, 'utf8').trim().split('\n');
    } catch (error) {
        console.error("Error reading tokens from file: ", error);
        sendLogMessage("Error reading tokens from file: " + error.message);
        process.exit(1);
    }
}

// Обробник отримання документів
bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    if (userStates[chatId] && userStates[chatId].expectingFile) {
        if (msg.document.mime_type === 'text/plain') {
            bot.getFile(fileId).then(fileInfo => {
                const downloadPath = path.join(fileDirectory, fileName);

                bot.downloadFile(fileId, downloadPath).then(() => {
                    fs.readFile(downloadPath, 'utf8', async (err, newData) => {
                        if (err) {
                            bot.sendMessage(chatId, `Помилка при читанні нового файлу: ${err.message}`);
                            return;
                        }

                        const filePath = path.join(fileDirectory, fileName);

                        fs.writeFile(filePath, newData, 'utf8', async (err) => {
                            if (err) {
                                bot.sendMessage(chatId, `Помилка при переписуванні файлу: ${err.message}`);
                                return;
                            }

                            try {
                                await axios.put(renderApiUrl + fileName, { content: newData }, {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${bearerToken}`
                                    }
                                });
                                bot.sendMessage(chatId, `Файл ${fileName} успішно оновлено.`);
                            } catch (error) {
                                bot.sendMessage(chatId, `Помилка при оновленні файлу ${fileName}: ${error.message}`);
                            }

                            fs.unlink(downloadPath, (err) => {
                                if (err) console.error(`Помилка при видаленні файлу: ${err.message}`);
                            });

                            delete userStates[chatId];
                        });
                    });
                }).catch(error => {
                    bot.sendMessage(chatId, `Помилка при завантаженні нового файлу: ${error.message}`);
                });
            }).catch(error => {
                bot.sendMessage(chatId, `Помилка при отриманні інформації про файл: ${error.message}`);
            });
        } else {
            bot.sendMessage(chatId, 'Будь ласка, надішліть файл у форматі .txt.');
        }
    } else {
        bot.sendMessage(chatId, 'Немає активного запиту на файл. Використовуйте команду /edit для старту.');
    }
});

// Скидання стану користувача після завершення редагування
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (userStates[chatId] && userStates[chatId].expectingFile && !msg.document) {
        bot.sendMessage(chatId, 'Це не файл. Будь ласка, надішліть файл у форматі .txt.');
    }
});

// Створюємо директорію, якщо її ще не існує
if (!fs.existsSync(fileDirectory)) {
    fs.mkdirSync(fileDirectory, { recursive: true });
}

// Обробка команд
bot.onText(/\/editt (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        bot.sendMessage(chatId, `Відправте новий контент для файлу ${fileName}`);
        bot.once('message', (msg) => {
            const newContent = msg.text;

            axios.put(`${renderApiUrl}${fileName}`, { content: newContent }, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(() => bot.sendMessage(chatId, `Файл ${fileName} був успішно оновлений.`))
            .catch(error => bot.sendMessage(chatId, `Помилка при оновленні файлу ${fileName}: ${error.message}`));
        });
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не знайдено.`);
    }
});

bot.onText(/\/downloadd (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        bot.sendDocument(chatId, filePath);
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не знайдено.`);
    }
});

bot.onText(/\/readd (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        bot.sendMessage(chatId, `Контент файлу ${fileName}: \n${fileContent}`);
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не знайдено.`);
    }
});

const sendLogMessage = (message) => {
    bot.sendMessage(groupId, message);
};

module.exports = {
    sendLogMessage
};
