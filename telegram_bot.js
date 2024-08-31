const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
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

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    if (userStates[chatId]?.fileName === fileName && msg.document.mime_type === 'text/plain') {
        try {
            const fileInfo = await bot.getFile(fileId);
            const downloadPath = path.join(fileDirectory, fileName);
            await bot.downloadFile(fileId, downloadPath);

            const newData = fs.readFileSync(downloadPath, 'utf8');
            fs.writeFileSync(path.join(fileDirectory, fileName), newData, 'utf8');

            await axios.put(renderApiUrl + fileName, { content: newData }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            bot.sendMessage(chatId, `Файл ${fileName} успішно оновлено.`);
            fs.unlinkSync(downloadPath);
        } catch (error) {
            bot.sendMessage(chatId, `Помилка: ${error.message}`);
        } finally {
            delete userStates[chatId];
        }
    } else {
        bot.sendMessage(chatId, 'Немає активного запиту на файл. Використовуйте команду /edit для старту.');
    }
});

// Створюємо директорію, якщо її ще не існує
if (!fs.existsSync(fileDirectory)) {
    fs.mkdirSync(fileDirectory, { recursive: true });
}
