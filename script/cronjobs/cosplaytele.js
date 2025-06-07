module.exports = {
    name: 'cosplaytele',
    schedule: '0 7 * * *', 
    chatId: '-1002037394564',
    async execute({ bot, chat }) {
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
  
      async function sendCosplayResult(data, searchTerm = '') {
        if (!data.result || data.result.length === 0) {
          await chat.reply('No matching cosplay found.', this.chatId);
          return;
        }
  
        const cosplay = data.result[Math.floor(Math.random() * data.result.length)];
  
        let caption = `🎲 Daily Random Cosplay\n`;
        if (searchTerm) caption += `🔍 Search Term: ${searchTerm}\n`;
        caption += `🎭 Title: ${cosplay.title}\n`;
        caption += `👤 Cosplayer: ${cosplay.cosplayer}\n`;
        caption += `🎮 Character: ${cosplay.character}\n`;
  
        if (cosplay.downloadLinks?.length > 0) {
          caption += `\n🔐 Password: ${data.password || 'N/A'}`;
        }
  
        const inlineKeyboard = [];
        if (cosplay.downloadLinks?.length > 0) {
          cosplay.downloadLinks.forEach((link, index) => {
            inlineKeyboard.push([{ text: `📥 Link ${index + 1}`, url: link }]);
          });
        }
  
        const shuffledImages = shuffleArray([...cosplay.images]);
  
        if (shuffledImages.length === 1) {
          await chat.reply({
            attachment: shuffledImages[0],
            body: caption,
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
          }, this.chatId);
          return;
        }
  
        const mediaGroup = shuffledImages.slice(0, 10);
  
        await chat.reply({
          attachment: mediaGroup,
          body: caption,
          reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
        }, this.chatId);
      }

      const loadingMsg = await chat.reply('🎲 Selecting daily random cosplay...', this.chatId);
  
      try {
        const data = await fetchCosplay();
        await bot.deleteMessage(this.chatId, loadingMsg.message_id).catch((error) => {
          console.error('Error deleting loading message:', error.message);
        });
  
        await sendCosplayResult(data);
      } catch (error) {
        await bot.deleteMessage(this.chatId, loadingMsg.message_id).catch((error) => {
          console.error('Error deleting loading message:', error.message);
        });
        console.error('Cosplay cron error:', error.message);
        await chat.reply('❌ Error fetching daily cosplay. Try again later!', this.chatId);
      }
    },
  };