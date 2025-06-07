module.exports = {
  config: {
    name: 'demo3',
    prefix: true,
    admin: false,
    vip: false,
    description: 'Demonstrates interactive buttons functionality. Sends a message with a clickable button and responds when users click it, showing their user ID.',
    execute: async ({ bot, chat, msg, args, chatId, userId, config, addListener, addAnswerCallback }) => {
      const buttonId = 'button_clicked';
      await chat.reply({
        body: 'Click the button!',
        reply_markup: {
          inline_keyboard: [[{ text: 'Click Me', callback_data: buttonId }]]
        }
      });
      
      addAnswerCallback(buttonId, async ({ chat, query }) => {
        await chat.reply(`Button clicked by user ${query.from.id}!`);
      });
    }
  }
};