module.exports = {
  name: 'getsticker',
  aliases: ['stickerid'],
  prefix: true,
  description: 'Retrieves the file_id of a sticker (admin only). Reply to a sticker.',
  usage: '/getsticker (reply to a sticker or send a sticker)',
  execute: async ({ chat, msg, userId, config }) => {
    const sticker = msg.reply_to_message?.sticker;

    if (!sticker) {
      return chat.reply('Please reply to a sticker to get its file_id.\nUsage: /getsticker');
    }

    try {
      const stickerId = sticker.file_id;
      chat.reply(stickerId)
    } catch (error) {
      chat.reply(error);
    }
  }
};