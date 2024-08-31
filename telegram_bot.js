const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const groupId = '-4268517821';
const bot = new TelegramBot(token, { polling: true });

const fileDirectory = '/etc/secrets'; // Директорія для файлів
const renderApiUrl = 'https://api.render.com/v1/services/srv-cpnv6f88fa8c73b81s6g/secret-files/'; // URL API
const bearerToken = 'rnd_04BLXty0HtthUCkb8AzBXVda5zSY'; // Bearer Token

let userStates = {};

// Команди
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

bot.onText(/\/edit (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const fileName = match[1];
    const filePath = path.join(fileDirectory, fileName);

    if (fs.existsSync(filePath)) {
        userStates[chatId] = { fileName };
        bot.sendMessage(chatId, `Чекаю на новий контент для файлу ${fileName} у форматі .txt.`);
    } else {
        bot.sendMessage(chatId, `Файл ${fileName} не знайдено.`);
    }
});

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    if (userStates[chatId] && userStates[chatId].fileName === fileName) {
        if (msg.document.mime_type === 'text/plain') {
            bot.getFile(fileId).then(fileInfo => {
                const downloadPath = path.join(fileDirectory, fileName);

                bot.downloadFile(fileId, downloadPath).then(() => {
                    fs.readFile(downloadPath, 'utf8', (err, newData) => {
                        if (err) {
                            bot.sendMessage(chatId, `Помилка при читанні нового файлу: ${err.message}`);
                            return;
                        }

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

// Створюємо директорію, якщо її ще не існує
if (!fs.existsSync(fileDirectory)) {
    fs.mkdirSync(fileDirectory, { recursive: true });
}
