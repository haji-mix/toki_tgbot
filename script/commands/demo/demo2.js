module.exports = {
  config: {
    name: 'demo2',
    prefix: true,
    admin: false,
    vip: false,
    description: 'A demonstration command that shows event listener functionality. It sets up a temporary listener for "hello" messages and asks the user to reply with their name.',
    execute: async ({ bot, chat, msg, args, chatId, userId, config, addListener }) => {

      const removeListener = addListener(
        (msg) => msg.text && msg.text.toLowerCase().includes('hello') && msg.chat.id === chatId,
        async (msg) => {
          await chat.reply(`I heard you say "hello"! What's up?`);
        }
      );

      setTimeout(async () => {
        removeListener();
        await chat.reply('Listener for "hello" has been removed.');
      }, 60000);

      const replyMessage = await chat.reply('Please reply to this message with your name!');
      global.replyCallbacks.set(replyMessage.message_id, async (replyMsg) => {
        const userName = replyMsg.text || 'Anonymous';
        await chat.reply(`Nice to meet you, ${userName}!`);
      });
    }
  }
};