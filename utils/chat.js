const axios = require('axios');

/**
 * Downloads media from a URL and returns it as a Buffer
 * @param {string} url - The URL of the media
 * @returns {Promise<Buffer>} - The media as a Buffer
 * @throws {Error} - If download fails
 */
async function downloadMedia(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error downloading media from ${url}:`, error.message);
    throw new Error(`Failed to download media from ${url}`);
  }
}

/**
 * Determines the media type based on URL or content type
 * @param {string} url - The URL of the media
 * @returns {Promise<string>} - The media type ('photo', 'video', 'document', 'animation', 'audio')
 * @throws {Error} - If MIME type cannot be determined
 */
async function getMediaType(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    const contentType = response.headers['content-type'];
    
    if (contentType.startsWith('image/')) return 'photo';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('application/') || contentType === 'text/plain') return 'document';
    if (contentType.includes('gif')) return 'animation';
    return 'document';
  } catch (error) {
    console.error(`Error fetching MIME type for ${url}:`, error.message);
    return null;
  }
}

/**
 * Handles sending messages with fallback to general topic or local upload if needed
 * @param {Function} sendFunction - The bot send function to use
 * @param {Object} bot - The bot instance
 * @param {string} chatId - The chat ID
 * @param {Object} msg - The message object
 * @param {Object} options - Additional options
 * @param {Array} args - Arguments for the send function
 * @param {Object} retryConfig - Retry configuration for WEBPAGE_CURL_FAILED
 * @returns {Promise<Object>} - The sent message object
 */
async function sendWithFallback(sendFunction, bot, chatId, msg, options, args, retryConfig = {}) {
  const finalOptions = {
    ...options,
    ...(msg.chat.type === 'supergroup' && msg.message_thread_id
      ? { message_thread_id: msg.message_thread_id }
      : {}),
  };
  let hasAttemptedFallback = false;

  try {
    return await sendFunction(chatId, ...args, finalOptions);
  } catch (error) {
    console.error(`Error sending to chat ${chatId}, thread ${msg.message_thread_id || 'none'}:`, error.message);

    if (error.message.includes('WEBPAGE_CURL_FAILED') && retryConfig.mediaUrl && !retryConfig.hasRetriedLocal) {
      console.log(`WEBPAGE_CURL_FAILED for ${retryConfig.mediaUrl}. Attempting local download and upload.`);
      try {
        const mediaBuffer = await downloadMedia(retryConfig.mediaUrl);
        const newArgs = retryConfig.isMediaGroup
          ? args.map(item => item.media === retryConfig.mediaUrl ? { ...item, media: mediaBuffer } : item)
          : [mediaBuffer, ...args.slice(1)];
        return await sendWithFallback(
          sendFunction,
          bot,
          chatId,
          msg,
          finalOptions,
          newArgs,
          { ...retryConfig, hasRetriedLocal: true }
        );
      } catch (downloadError) {
        console.error(`Failed to download and upload media: ${downloadError.message}`);
        return await sendWithFallback(
          bot.sendMessage.bind(bot),
          bot,
          chatId,
          msg,
          { message_thread_id: 0 },
          ['Failed to send media due to an inaccessible URL.']
        );
      }
    }

    if (error.message.includes('TOPIC_CLOSED') && !hasAttemptedFallback) {
      console.log(`Topic ${msg.message_thread_id || 'unknown'} is closed in chat ${chatId}. Attempting fallback to general topic.`);
      const fallbackOptions = { ...options, message_thread_id: 0 };
      hasAttemptedFallback = true;

      try {
        const chatInfo = await bot.getChat(chatId);
        if (chatInfo.forum && !chatInfo.permissions?.can_send_messages) {
          console.log(`General topic is inaccessible in chat ${chatId}.`);
          return { message_id: null };
        }
        return await bot.sendMessage(chatId, 'This topic is closed. Please use an active topic.', fallbackOptions);
      } catch (fallbackError) {
        console.error('Error during fallback to general topic:', fallbackError.message);
        return { message_id: null };
      }
    }

    return { message_id: null };
  }
}

/**
 * Creates a chat handler with various send methods
 * @param {Object} bot - The bot instance
 * @param {Object} msg - The message object
 * @returns {Object} - Chat handler with send methods
 */
function createChat(bot, msg) {
  return {
    async delete(messageid, chatId = msg.chat.id) {
      bot.deleteMessage(chatId, messageid.message_id).catch((error) => {
        console.error('Error deleting loading message:', error.message);
      });
    },

    async reply(input, chatId = msg.chat.id, options = {}) {
      let body, type = 'text', content, attachment, extraOptions = {}, parse_mode;

      if (typeof input === 'string') {
        body = input;
        parse_mode = null;
      } else if (input && typeof input === 'object') {
        ({ 
          body, 
          type = 'text', 
          content, 
          attachment, 
          parse_mode = null, 
          ...extraOptions 
        } = input);

        if (typeof attachment === 'string' && !type) {
          type = 'auto';
        }

        if (!input.type && Array.isArray(attachment)) {
          type = 'media group';
          parse_mode = 'Markdown';
        }
      } else {
        console.error('Invalid input type for reply(). Expected string or object.');
        return { message_id: null };
      }

      const mediaContent = content || attachment;
      const finalOptions = { ...options, ...extraOptions, ...(parse_mode ? { parse_mode } : {}) };

      try {
        switch (type.toLowerCase()) {
          case 'text':
            if (body) return await sendWithFallback(bot.sendMessage.bind(bot), bot, chatId, msg, finalOptions, [body]);
            return { message_id: null };

          case 'auto':
            if (typeof mediaContent === 'string') {
              try {
                const mediaType = await getMediaType(mediaContent);
                const sendMethod =
                  mediaType === 'photo' ? bot.sendPhoto :
                  mediaType === 'video' ? bot.sendVideo :
                  mediaType === 'audio' ? bot.sendAudio :
                  mediaType === 'animation' ? bot.sendAnimation :
                  bot.sendDocument;

                return await sendWithFallback(
                  sendMethod.bind(bot),
                  bot,
                  chatId,
                  msg,
                  { caption: body, ...finalOptions },
                  [mediaContent],
                  { mediaUrl: mediaContent }
                );
              } catch (error) {
                console.error(`Error determining media type: ${error.message}`);
                return await sendWithFallback(
                  bot.sendDocument.bind(bot),
                  bot,
                  chatId,
                  msg,
                  { caption: body, ...finalOptions },
                  [mediaContent],
                  { mediaUrl: mediaContent }
                );
              }
            }
            return { message_id: null };

          case 'photo':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: 'photo',
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    })
                  );
                  return await sendWithFallback(
                    bot.sendMediaGroup.bind(bot),
                    bot,
                    chatId,
                    msg,
                    finalOptions,
                    [media],
                    { isMediaGroup: true }
                  );
                } catch (error) {
                  console.error(`Error processing photo media group: ${error.message}`);
                  return { message_id: null };
                }
              }
              return await sendWithFallback(
                bot.sendPhoto.bind(bot),
                bot,
                chatId,
                msg,
                { caption: body, ...finalOptions },
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'video':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: 'video',
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    })
                  );
                  return await sendWithFallback(
                    bot.sendMediaGroup.bind(bot),
                    bot,
                    chatId,
                    msg,
                    finalOptions,
                    [media],
                    { isMediaGroup: true }
                  );
                } catch (error) {
                  console.error(`Error processing video media group: ${error.message}`);
                  return { message_id: null };
                }
              }
              return await sendWithFallback(
                bot.sendVideo.bind(bot),
                bot,
                chatId,
                msg,
                { caption: body, ...finalOptions },
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'audio':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: 'audio',
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    })
                  );
                  return await sendWithFallback(
                    bot.sendMediaGroup.bind(bot),
                    bot,
                    chatId,
                    msg,
                    finalOptions,
                    [media],
                    { isMediaGroup: true }
                  );
                } catch (error) {
                  console.error(`Error processing audio media group: ${error.message}`);
                  return { message_id: null };
                }
              }
              return await sendWithFallback(
                bot.sendAudio.bind(bot),
                bot,
                chatId,
                msg,
                { caption: body, ...finalOptions },
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'document':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: 'document',
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    })
                  );
                  return await sendWithFallback(
                    bot.sendMediaGroup.bind(bot),
                    bot,
                    chatId,
                    msg,
                    finalOptions,
                    [media],
                    { isMediaGroup: true }
                  );
                } catch (error) {
                  console.error(`Error processing document media group: ${error.message}`);
                  return { message_id: null };
                }
              }
              return await sendWithFallback(
                bot.sendDocument.bind(bot),
                bot,
                chatId,
                msg,
                { caption: body, ...finalOptions },
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'animation':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: 'animation',
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    })
                  );
                  return await sendWithFallback(
                    bot.sendMediaGroup.bind(bot),
                    bot,
                    chatId,
                    msg,
                    finalOptions,
                    [media],
                    { isMediaGroup: true }
                  );
                } catch (error) {
                  console.error(`Error processing animation media group: ${error.message}`);
                  return { message_id: null };
                }
              }
              return await sendWithFallback(
                bot.sendAnimation.bind(bot),
                bot,
                chatId,
                msg,
                { caption: body, ...finalOptions },
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'sticker':
            if (mediaContent) {
              return await sendWithFallback(
                bot.sendSticker.bind(bot),
                bot,
                chatId,
                msg,
                finalOptions,
                [mediaContent],
                { mediaUrl: mediaContent }
              );
            }
            return { message_id: null };

          case 'location':
            if (mediaContent?.latitude && mediaContent?.longitude) {
              return await sendWithFallback(
                bot.sendLocation.bind(bot),
                bot,
                chatId,
                msg,
                finalOptions,
                [mediaContent.latitude, mediaContent.longitude]
              );
            }
            return { message_id: null };

          case 'media group':
            if (Array.isArray(mediaContent)) {
              try {
                const media = await Promise.all(
                  mediaContent.slice(0, 10).map(async (item, index) => {
                    const mediaUrl = typeof item === 'string' ? item : item.media;
                    return {
                      type: item.type || (await getMediaType(mediaUrl)),
                      media: mediaUrl,
                      caption: index === 0 ? (item.caption || body) : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    };
                  })
                );
                return await sendWithFallback(
                  bot.sendMediaGroup.bind(bot),
                  bot,
                  chatId,
                  msg,
                  finalOptions,
                  [media],
                  { isMediaGroup: true }
                );
              } catch (error) {
                console.error(`Error processing media group: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          default:
            console.error(`Unsupported message type: ${type}`);
            return { message_id: null };
        }
      } catch (error) {
        console.error(`Error processing ${type} for chat ${chatId}:`, error.message);
        if (!error.message.includes('TOPIC_CLOSED') && !error.message.includes('WEBPAGE_CURL_FAILED')) {
          return await sendWithFallback(
            bot.sendMessage.bind(bot),
            bot,
            chatId,
            msg,
            { message_thread_id: 0 },
            ['Error processing the request.']
          );
        }
        return { message_id: null };
      }
    },

    async sendPhoto(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'photo' }, chatId, options);
    },

    async sendVideo(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'video' }, chatId, options);
    },

    async sendAudio(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'audio' }, chatId, options);
    },

    async sendDocument(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'document' }, chatId, options);
    },

    async sendAnimation(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'animation' }, chatId, options);
    },

    async sendSticker(input, chatId = msg.chat.id, options = {}) {
      return this.reply({ ...input, type: 'sticker' }, chatId, options);
    },

    async sendLocation(latitude, longitude, chatId = msg.chat.id, options = {}) {
      return this.reply({
        type: 'location',
        attachment: { latitude, longitude }
      }, chatId, options);
    }
  };
}

module.exports = { createChat };