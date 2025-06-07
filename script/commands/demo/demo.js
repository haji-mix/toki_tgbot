

module.exports = {
  config: {
    name: 'demo',
    prefix: true, // Requires a prefix like /demo5
    admin: false, // No admin access required
    vip: false, // No VIP access required
    description: 'Sends a message and responds with "hi" if a user replies to it with "hello".',
    execute: async ({ bot, chat, msg, args, chatId, userId, config, addAnswerCallback }) => {
      const sentMessage = await chat.reply('Reply to this message with "hello"!');

      const replyCallbackId = sentMessage.message_id;
      global.replyCallbacks.set(replyCallbackId, async () => {
        if (msg.text && msg.text.toLowerCase() === 'hello') {
          chat.reply('hi');
        }
      });
    }
  }
};