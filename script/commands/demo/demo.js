module.exports = {
  config: {
    name: 'demo',
    prefix: true, // Requires a prefix like /demo
    admin: false, // No admin access required
    vip: false, // No VIP access required
    description: 'Sends a message and responds with "hi" if a user replies to it with "hello".',
    execute: async ({ bot, chat, msg, args, chatId, userId, config, addAnswerCallback }) => {
      const sentMessage = await chat.reply('Reply to this message with "hello"!');

      // Register a reply callback for the sent message
      global.replyCallbacks.set(sentMessage.message_id, async (replyMsg) => {
        if (replyMsg.text && replyMsg.text.toLowerCase() === 'hello') {
          await chat.reply('hi');
        }
      });
    }
  }
};