module.exports = {
  name: 'cosplaytele',
  schedule: '0 * * * *', // Run every hour on the hour
  chatId: '-1002037394564',
  async execute({ bot, chat }) {

    const shuffleArray = (array) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    const fetchWithTimeout = async (url, timeout = 10000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (!data.result) throw new Error('Invalid API response');
        return data;
      } catch (error) {
        clearTimeout(id);
        throw new Error(`Fetch error: ${error.message}`);
      }
    };

    async function fetchCosplay(searchTerm = '') {
      const maxSearchLength = 100;
      if (searchTerm.length > maxSearchLength) {
        throw new Error('Search term too long.');
      }
      if (searchTerm && !searchTerm.match(/^[a-zA-Z0-9\s]*$/)) {
        throw new Error('Invalid search term. Use alphanumeric characters only.');
      }
      const apiUrl = `${global.api.hajime}/api/cosplaytele?search=${encodeURIComponent(searchTerm)}&stream=false`;
      const data = await fetchWithTimeout(apiUrl);
      data.result = shuffleArray(data.result);
      return data;
    }

    async function sendCosplayResult(data, searchTerm = '') {
      if (!data.result || data.result.length === 0) {
        await chat.reply('No matching cosplay found.', this.chatId);
        return;
      }

      const cosplay = data.result[Math.floor(Math.random() * data.result.length)];

      let caption = `🎲 Hourly Random Cosplay\n`;
      if (searchTerm) caption += `🔍 Search Term: ${searchTerm}\n`;
      caption += `🎭 Title: ${cosplay.title}\n`;
      caption += `👤 Cosplayer: ${cosplay.cosplayer}\n`;
      caption += `🎮 Character: ${cosplay.character}\n`;
      if (cosplay.downloadLinks?.length > 0) {
        caption += `\n🔐 Password: ${data.password || 'N/A'}`;
      }

      const inlineKeyboard = [
        [{ text: '🌐 Web', url: `${global.api.hajime}/cosplay`}],
      ];
      if (cosplay.downloadLinks?.length > 0) {
        cosplay.downloadLinks.forEach((link, index) => {
          inlineKeyboard.push([{ text: `📥 Link ${index + 1}`, url: link }]);
        });
      }

      const shuffledImages = shuffleArray([...cosplay.images]);

      if (shuffledImages.length === 1) {
        await chat.reply(
          {
            attachment: shuffledImages[0],
            body: caption,
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
          },
          this.chatId
        );
        return;
      }

      const mediaGroup = shuffledImages.slice(0, 10);
      await chat.reply(
        {
          attachment: mediaGroup,
          body: caption,
          reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
        },
        this.chatId
      );
    }

    const loadingMsg = await chat.reply('🎲 Selecting hourly random cosplay...', this.chatId);

    try {
      const data = await fetchCosplay();
      await bot
        .deleteMessage(this.chatId, loadingMsg.message_id)
        .catch((error) => {
          console.error('Error deleting loading message:', { chatId: this.chatId, error: error.message });
        });

      await sendCosplayResult(data);
    } catch (error) {
      console.error('Cosplay cron error:', { error: error.message, chatId: this.chatId });
      await bot
        .deleteMessage(this.chatId, loadingMsg.message_id)
        .catch((error) => {
          console.error('Error deleting loading message:', { chatId: this.chatId, error: error.message });
        });
      await chat.reply('❌ Error fetching hourly cosplay. Try again later!', this.chatId);
    }
  },
};