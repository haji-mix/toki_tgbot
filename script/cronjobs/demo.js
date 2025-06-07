module.exports = {
  name: 'dailyReminder',
  schedule: '0 9 * * *', // Runs every day at 9:00 AM
  chatId: '123456789',
  async execute({ bot, chat, chatId, userId, config }) {
    await chat.reply('Good morning! This is your daily reminder.');
    console.log(`Daily reminder sent to chat ${chatId}`);
  },
};