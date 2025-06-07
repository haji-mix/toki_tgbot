module.exports = {
  name: 'ping',
  description: 'Check if the bot is responsive',
  aliases: ['p'],
  prefix: true,
  execute: async ({ chat }) => {
    await chat.reply({ body: 'Pong!' });
  }
};