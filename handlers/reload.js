const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const config = require('../config.json');
const { createChat } = require('../utils/chat');

global.commands = new Map();
global.events = new Map();
global.cronjobs = new Map();

async function loadFiles(dir, type, handler) {
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        await loadFiles(fullPath, type, handler);
      } else if (item.isFile() && item.name.endsWith('.js')) {
        try {
          delete require.cache[require.resolve(fullPath)];

          const module = require(fullPath);
          const file = module.config || module.toki || module.ownersv2 || module.meta || module;

          if (!file.name || !handler.validator(file)) {
            console.warn(`Skipping invalid ${type} file: ${item.name}`);
            continue;
          }

          await handler.process(file, item.name);
          console.log(`Loaded ${type}: ${file.name}`);
        } catch (error) {
          console.error(`Error loading ${type} ${item.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading ${type} directory ${dir}:`, error);
    throw error;
  }
}

async function loadCommands(bot) {
  global.commands.clear();

  const commandHandler = {
    validator: (command) => command.name && command.execute && command.description, // Ensure description exists
    process: (command, filename) => {
      global.commands.set(command.name, command);
      if (Array.isArray(command.aliases)) {
        command.aliases.forEach((alias) => global.commands.set(alias, command));
      }
    },
  };

  await loadFiles(path.join(__dirname, '../script/commands'), 'command', commandHandler);

  const telegramCommands = Array.from(global.commands.values())
    .filter((command, index, self) => 
      command.name && command.description && 
      self.findIndex(c => c.name === command.name) === index 
    )
    .map(command => ({
      command: command.name,
      description: command.description,
    }));

  try {
    await bot.setMyCommands(telegramCommands);
    console.log('Telegram command menu updated successfully');
  } catch (error) {
    console.error('Error setting Telegram command menu:', error);
  }
}

async function loadEvents(bot) {
  global.events.clear();

  Object.keys(bot.eventNames())
    .filter((event) => event !== 'message')
    .forEach((event) => bot.removeAllListeners(event));

  const eventHandler = {
    validator: (event) => event.name && event.handleEvent,
    process: async (event, filename) => {
      global.events.set(event.name, event);

      bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from?.id?.toString();

        try {
          if (!msg.from || msg.from.is_bot) return;
          const chat = await createChat(bot, msg);
          await event.handleEvent({ bot, chat, msg, chatId, userId, config });
        } catch (error) {
          console.error(`Error handling event ${event.name}:`, error);
        }
      });
    },
  };

  await loadFiles(path.join(__dirname, '../script/events'), 'event', eventHandler);
}

async function loadCronjobs(bot) {
  global.cronjobs.forEach((cronjob) => cronjob.task.stop());
  global.cronjobs.clear();

  const cronjobHandler = {
    validator: (cronjob) => cronjob.name && cronjob.schedule && cronjob.execute,
    process: async (cronjob, filename) => {
      try {
        const chatId = cronjob.chatId;
        const userId = cronjob.userId;

        const chat = await createChat(bot, { chat: { id: chatId } });

        const task = cron.schedule(
          cronjob.schedule,
          async () => {
            try {
              await cronjob.execute({ bot, chat, chatId, userId, config });
              console.log(`Cronjob ${cronjob.name} executed successfully`);
            } catch (error) {
              console.error(`Error executing cronjob ${cronjob.name}:`, error);
            }
          },
          {
            scheduled: true,
            timezone: cronjob.timezone || 'Asia/Manila',
          }
        );

        global.cronjobs.set(cronjob.name, { ...cronjob, task });
      } catch (error) {
        console.error(`Error scheduling cronjob ${cronjob.name}:`, error);
      }
    },
  };

  await loadFiles(path.join(__dirname, '../script/cronjobs'), 'cronjob', cronjobHandler);
}

function setupReloadHandler(bot) {
  Promise.all([
    loadCommands(bot),
    loadEvents(bot),
    loadCronjobs(bot),
  ]).catch((error) => {
    console.error('Initial load error:', error);
  });

  bot.onText(/^\/reload$/, async (msg) => {
    if (!msg.from || !config.admins.includes(msg.from.id.toString())) {
      try {
        await bot.sendMessage(msg.chat.id, 'Admin access required.');
      } catch (error) {
        console.error('Error sending auth message:', error);
      }
      return;
    }

    try {
      await Promise.all([loadCommands(), loadEvents(bot), loadCronjobs(bot)]);
      await bot.sendMessage(msg.chat.id, 'Commands, events, and cronjobs reloaded successfully.');
      console.log('Commands, events, and cronjobs reloaded');
    } catch (reloadError) {
      try {
        await bot.sendMessage(msg.chat.id, 'Error reloading commands, events, or cronjobs.');
      } catch (sendError) {
        console.error('Error sending reload error message:', sendError);
      }
      console.error('Reload error:', reloadError);
    }
  });
}

module.exports = { setupReloadHandler };