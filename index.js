const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.json');
const { setupMessageHandler } = require('./handlers/message');
const { setupEditHandler } = require('./handlers/edit');
const { setuploadHandler } = require('./handlers/load');

global.commands = new Map();
global.replyCallbacks = new Map();
global.reactionCallbacks = new Map();
global.listeners = [];
global.rateLimits = new Map();

global.api = {
    hajime: "https://www.haji-mix-api.gleeze.com"
};

const bot = new TelegramBot(config.token, { polling: true });

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});

async function startBot() {
  try {
    await setuploadHandler(bot);
    setupMessageHandler(bot);
    setupEditHandler(bot);
    console.log('Bot is running...');
  } catch (error) {
    console.error('Failed to start bot:', error);
  }
}

startBot();