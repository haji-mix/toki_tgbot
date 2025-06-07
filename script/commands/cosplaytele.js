module.exports = {
  name: 'cosplaytele',
  aliases: ['costele', 'cptele'],
  prefix: true,
  execute: async ({ bot, chat, msg, args, chatId, userId, config, addListener, addAnswerCallback }) => {
  
    const shuffleArray = (array) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    async function fetchCosplay(searchTerm = '') {
      try {
        const apiUrl = `${global.api.hajime}/api/cosplaytele?search=${encodeURIComponent(searchTerm)}&stream=false`;
        const response = await fetch(apiUrl, { timeout: 10000 }); 
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (!data.result) throw new Error('Invalid API response');

        data.result = shuffleArray(data.result);
        return data;
      } catch (error) {
        throw new Error(`Fetch error: ${error.message}`);
      }
    }

    async function sendCosplayResult(data, searchTerm, replyToMsgId = null) {
      if (!data.result || data.result.length === 0) {
        await chat.reply('No matching cosplay found.');
        return;
      }

      const cosplay = data.result[Math.floor(Math.random() * data.result.length)];

      let caption = `🎲 Random Cosplay\n`;
      if (searchTerm) caption += `🔍 Search Term: ${searchTerm}\n`;
      caption += `🎭 Title: ${cosplay.title}\n`;
      caption += `👤 Cosplayer: ${cosplay.cosplayer}\n`;
      caption += `🎮 Character: ${cosplay.character}\n`;

      if (cosplay.downloadLinks?.length > 0) {
        caption += `\n🔐 Password: ${data.password || 'N/A'}`;
      }

      const buttonId = `cosplay_refresh:${searchTerm || 'random'}:${Date.now()}`;
      
      // Store the previous message IDs that need to be deleted
      let previousMessages = [];
      
      addAnswerCallback(buttonId, async ({ bot, chat, query, chatId }) => {
        try {
          await bot.answerCallbackQuery(query.id, { text: 'Fetching another cosplay...' });

          // Delete all previous messages (both media group and button message)
          for (const msgId of previousMessages) {
            await bot.deleteMessage(chatId, msgId).catch((error) => {
              console.error('Error deleting message:', error.message);
            });
          }

          const newData = await fetchCosplay(searchTerm);
          await sendCosplayResult(newData, searchTerm, query.message.reply_to_message?.message_id);
        } catch (error) {
          console.error('Cosplay callback error:', error.message);
          await chat.reply('Error fetching cosplay. Try again!');
          await bot.answerCallbackQuery(query.id, { text: 'Error fetching cosplay.' });
        }
      });

      const inlineKeyboard = [
        [{ text: '🔁 Get Another', callback_data: buttonId }],
      ];
      
      inlineKeyboard.push([{ text: `🌐 Web`, url: `${global.api.hajime}/cosplay` }]);

      if (cosplay.downloadLinks?.length > 0) {
        cosplay.downloadLinks.forEach((link, index) => {
          inlineKeyboard.push([{ text: `📥 Link ${index + 1}`, url: link }]);
        });
      }
      

      const shuffledImages = shuffleArray([...cosplay.images]);

      if (shuffledImages.length === 1) {
        const sentMessage = await chat.reply({
          attachment: shuffledImages[0],
          body: caption,
          reply_to_message_id: replyToMsgId,
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
        previousMessages.push(sentMessage.message_id);
        return;
      }

      const mediaGroup = shuffledImages.slice(0, 10);
      
      // Send media group
      const mediaGroupMessages = await chat.reply({
        attachment: mediaGroup,
        body: caption,
        reply_to_message_id: replyToMsgId,
      });
      
      // Store all message IDs from the media group
      if (Array.isArray(mediaGroupMessages)) {
        previousMessages.push(...mediaGroupMessages.map(m => m.message_id));
      } else {
        previousMessages.push(mediaGroupMessages.message_id);
      }

      // Send button message
      const buttonMessage = await chat.reply({
        body: 'Want another cosplay or download?',
        reply_to_message_id: replyToMsgId,
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
      previousMessages.push(buttonMessage.message_id);
    }

    try {
      const searchTerm = args.join(' ').trim();
      const loadingMsg = await chat.reply('🎲 Selecting random cosplay...');

      const data = await fetchCosplay(searchTerm);
      await bot.deleteMessage(chatId, loadingMsg.message_id).catch((error) => {
        console.error('Error deleting loading message:', error.message);
      });

      await sendCosplayResult(data, searchTerm, msg.message_id);
    } catch (error) {
      console.error('Cosplay command error:', error.message);
      await chat.reply('❌ Error fetching cosplay. Try again!');
    }
  },
};