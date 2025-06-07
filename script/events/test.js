module.exports = {
  config: {
    name: 'demo',
    async handleEvent({ bot, chat, msg }) {
      try {
        console.log(`Received message from ${msg.from.username || msg.from.id}: ${msg.text || 'Non-text message'}`);

        if (msg.text && msg.text.toLowerCase() === 'hello') {
          await bot.sendMessage(msg.chat.id, 'Hi there! How can I help you?');
        }

      } catch (error) {
        console.error('Error handling message event:', error);
      }
    }
  }
};