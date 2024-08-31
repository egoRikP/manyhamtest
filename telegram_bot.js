const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const fileDirectory = '/etc/secrets'; // Директорія для файлів
const renderApiUrl = `https://api.render.com/v1/services/srv-cpnv6f88fa8c73b81s6g/secret-files/`; // URL API
const bearerToken = "rnd_uDZ1f5zRGOuOvUMSmxjQQKwvNju5"; // Bearer Token

let userStates = {};

// Команди
bot.onText(/\/read (.+)/, (msg, match) => {
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

bot.onText(/\/download (.+)/, (msg, match) => {
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

    userStates[chatId] = { fileName };
    bot.sendMessage(chatId, `Чекаю на новий контент для файлу ${fileName} у форматі .txt.`);
});

// Обробник для файлів
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;

    try {
        // Завантаження файлу
        const fileLink = await bot.getFileLink(fileId);
        const file = await bot.downloadFile(fileLink);

        // Читання файлу
        const content = fs.readFileSync(file.path, 'utf8');

        // Відправка вмісту
        await bot.sendMessage(chatId, content);
    } catch (error) {
        console.error('Error:', error);
        await bot.sendMessage(chatId, 'Виникла помилка при обробці файлу.');
    } finally {
        // Видалення тимчасового файлу
        fs.unlinkSync(file.path);
    }
});

// bot.on('document', async (msg) => {
//     const chatId = msg.chat.id;
//     const fileId = msg.document.file_id;
//     const fileName = msg.document.file_name;

//     console.log(chatId,fileId,fileName);

//     if (userStates[chatId]?.fileName === fileName && msg.document.mime_type === 'text/plain') {
//         try {
//             // Отримання інформації про файл
//             const fileInfo = await bot.getFile(fileId);
//             const filePath = path.join(__dirname, fileId + '.txt');
//             const fileStream = await bot.downloadFile(fileId, __dirname);

//             // Читання контенту файлу
//             const newData = fs.readFileSync(filePath, 'utf8');

//             // Надсилання даних на API Render
//             await axios.put(renderApiUrl + fileName, { content: newData }, {
//                 headers: {
//                     'Content-Type': 'application/json',
//                     'Authorization': `Bearer ${bearerToken}`
//                 }
//             });

//             bot.sendMessage(chatId, `Файл ${fileName} успішно оновлено.`);
//             fs.unlinkSync(filePath); // Clean up temporary file
//         } catch (error) {
//             bot.sendMessage(chatId, `Помилка: ${error.message}`);
//         } finally {
//             delete userStates[chatId];
//         }
//     } else {
//         bot.sendMessage(chatId, 'Немає активного запиту на файл. Використовуйте команду /edit для старту.');
//     }
// });

// Створюємо директорію, якщо її ще не існує
if (!fs.existsSync(fileDirectory)) {
    fs.mkdirSync(fileDirectory, { recursive: true });
}
