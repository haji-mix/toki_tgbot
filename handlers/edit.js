const { createChat } = require('../utils/chat');

function setupEditHandler(bot) {
  bot.on('edited_message', async (msg) => {
    const chatId = msg.chat.id;
    const chat = createChat(bot, msg);
    await chat.reply(`Message edited: ${msg.text}`);
    console.log(`Message ${msg.message_id} edited in chat ${chatId}`);
  });
}

module.exports = { setupEditHandler };