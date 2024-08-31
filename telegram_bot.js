const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const path = require('path');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const groupId = '-4268517821';
const bot = new TelegramBot(token, { polling: true });

const fileDirectory = '/etc/secrets'; // Директорія для файлів
const renderApiUrl = 'https://api.render.com/v1/services/srv-cpnv6f88fa8c73b81s6g/secret-files/'; // URL API
const restartApiUrl = 'https://api.render.com/v1/services/srv-cpnv6f88fa8c73b81s6g/restart'; // URL для перезавантаження сервера
const bearerToken = 'rnd_04BLXty0HtthUCkb8AzBXVda5zSY'; // Bearer Token

let downloadingFile = {}; // Зберігає інформацію про файл, який завантажується
let userStates = {};

// Функції для обробки команд
const commandHandlers = {
    '/status': handleStatusCommand,
    '/restart': handleRestartCommand,
    '/tokens': handleTokenList,
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
    const fileName = match[1]?.trim(); // Отримуємо ім'я файлу з команди

    if (!fileName) {
        bot.sendMessage(chatId, 'Будь ласка, вкажіть ім\'я файлу для завантаження.');
        return;
    }

    const filePath = path.join(fileDirectory, fileName);

    // Якщо файл існує локально, надсилаємо його до групи
    if (fs.existsSync(filePath)) {
        bot.sendDocument(groupId, filePath)
            .then(() => {
                bot.sendMessage(chatId, `Файл ${fileName} успішно надіслано до групи.`);
            })
            .catch(error => {
                bot.sendMessage(chatId, `Помилка при надсиланні файлу ${fileName} до групи: ${error.message}`);
            });
    }
}

// Обробник команди /edit
function handleEditCommand(msg, match) {
    const chatId = msg.chat.id;
    
    // Оновлюємо стан користувача
    userStates[chatId] = {
        expectingFile: true,
    };

    bot.sendMessage(chatId, 'Чекаю на новий контент у форматі .txt для переписування файлу.');
}

// Обробник отримання документів
bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    // Перевіряємо, чи користувач знаходиться в режимі очікування файлу
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

                            const apiUrl = renderApiUrl + fileName;
                            console.log(`API URL: ${apiUrl}`);
                            try {
                                await axios.put(apiUrl, { content: newData }, {
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

// Обробка команд
bot.onText(/\/editt (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fileName = match[1];
  const filePath = path.join(fileDirectory, fileName);

  if (fs.existsSync(filePath)) {
    bot.sendMessage(chatId, `Відправте новий контент для файлу ${fileName}`);
    bot.once('message', (msg) => {
      const newContent = msg.text;

      // Оновлення файлу через PUT-запит до API
      axios.put(`${renderApiUrl}${fileName}`, { content: newContent }, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        bot.sendMessage(chatId, `Файл ${fileName} був успішно оновлений.`);

        // Перезавантаження сервера через POST-запит
        return axios.post(restartApiUrl, {}, {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
          }
        });
      })
      .then(response => {
        bot.sendMessage(chatId, 'Сервер успішно перезавантажений.');
      })
      .catch(error => {
        bot.sendMessage(chatId, `Помилка при оновленні файлу ${fileName} або перезавантаженні сервера.`);
        console.error(error);
      });
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
