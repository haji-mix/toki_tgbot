const axios = require('axios');

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
    throw new Error(`Could not determine media type for ${url}`);
  }
}

/**
 * Handles sending messages with fallback to general topic if needed
 * @param {Function} sendFunction - The bot send function to use
 * @param {Object} bot - The bot instance
 * @param {string} chatId - The chat ID
 * @param {Object} msg - The message object
 * @param {Object} options - Additional options
 * @param {Array} args - Arguments for the send function
 * @returns {Promise<Object|undefined>} - The sent message or undefined
 */
async function sendWithFallback(sendFunction, bot, chatId, msg, options, ...args) {
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
    
    if (error.message.includes('TOPIC_CLOSED') && !hasAttemptedFallback) {
      console.log(`Topic ${msg.message_thread_id || 'unknown'} is closed in chat ${chatId}. Attempting fallback to general topic.`);
      const fallbackOptions = { ...options, message_thread_id: 0 };
      hasAttemptedFallback = true;

      try {
        const chatInfo = await bot.getChat(chatId);
        if (chatInfo.forum && !chatInfo.permissions?.can_send_messages) {
          console.log(`General topic is inaccessible in chat ${chatId}.`);
          return;
        }
        return await bot.sendMessage(chatId, 'This topic is closed. Please use an active topic.', fallbackOptions);
      } catch (fallbackError) {
        console.error('Error during fallback to general topic:', fallbackError.message);
        return;
      }
    }
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
    async reply(input, chatId = msg.chat.id, options = {}) {
      let body, type = 'text', content, attachment, extraOptions = {}, parse_mode;

      if (typeof input === 'string') {
    body = input;
    parse_mode = null;
  } 
  else if (input && typeof input === 'object') {
    ({ 
      body, 
      type = 'text', 
      content, 
      attachment, 
      parse_mode = null, 
      ...extraOptions 
    } = input);

        if (!input.type && Array.isArray(attachment)) {
          type = 'media group';
          parse_mode = "Markdown"
        }
      } else {
    return console.error('Invalid input type for reply(). Expected string or object.');
  }


      const mediaContent = content || attachment;
      const finalOptions = { ...options, ...extraOptions, ...(parse_mode ? { parse_mode } : {}) };

      try {
        switch (type.toLowerCase()) {
          case 'text':
            if (body) return await sendWithFallback(bot.sendMessage.bind(bot), bot, chatId, msg, finalOptions, body);
            break;

          case 'photo':
          case 'video':
          case 'audio':
            if (mediaContent) {
              if (Array.isArray(mediaContent)) {
                try {
                  const media = await Promise.all(
                    mediaContent.slice(0, 10).map(async (url, index) => ({
                      type: await getMediaType(url),
                      media: url,
                      caption: index === 0 ? body : undefined,
                      ...(parse_mode && index === 0 ? { parse_mode } : {}),
                    }))
                  );
                  return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, finalOptions, media);
                } catch (error) {
                  console.error(`Error processing media group: ${error.message}`);
                  return;
                }
              }
              
              try {
                const mediaType = await getMediaType(mediaContent);
                const sendMethod =
                  mediaType === 'photo' ? bot.sendPhoto :
                  mediaType === 'video' ? bot.sendVideo :
                  mediaType === 'audio' ? bot.sendAudio : null;
                if (sendMethod) {
                  return await sendWithFallback(sendMethod.bind(bot), bot, chatId, msg, { caption: body, ...finalOptions }, mediaContent);
                }
                console.error(`Unsupported media type: ${mediaType}`);
                return;
              } catch (error) {
                console.error(`Error determining media type: ${error.message}`);
                return;
              }
            }
            break;

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
                return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, finalOptions, media);
              } catch (error) {
                console.error(`Error processing media group: ${error.message}`);
                return;
              }
            }
            throw new Error('Media group requires an array of media items');

          case 'sticker':
            if (mediaContent) return await sendWithFallback(bot.sendSticker.bind(bot), bot, chatId, msg, finalOptions, mediaContent);
            break;

          case 'document':
            if (mediaContent) return await sendWithFallback(bot.sendDocument.bind(bot), bot, chatId, msg, { caption: body, ...finalOptions }, mediaContent);
            break;

          case 'location':
            if (mediaContent?.latitude && mediaContent?.longitude) {
              return await sendWithFallback(bot.sendLocation.bind(bot), bot, chatId, msg, finalOptions, mediaContent.latitude, mediaContent.longitude);
            }
            break;

          case 'animation':
            if (mediaContent) return await sendWithFallback(bot.sendAnimation.bind(bot), bot, chatId, msg, { caption: body, ...finalOptions }, mediaContent);
            break;

          default:
            throw new Error(`Unsupported message type: ${type}`);
        }
      } catch (error) {
        console.error(`Error processing ${type} for chat ${chatId}:`, error.message);
        if (!error.message.includes('TOPIC_CLOSED')) {
          await sendWithFallback(bot.sendMessage.bind(bot), bot, chatId, msg, { message_thread_id: 0 }, 'Error processing the request.');
        }
      }
    },

    async sendPhoto(input, chatId = msg.chat.id, options = {}) {
      let photo, attachment, parse_mode;
      if (typeof input === 'string') {
        photo = input;
        parse_mode = 'Markdown';
      } else {
        ({ photo, attachment, parse_mode = 'Markdown' } = input);
      }
      const mediaContent = photo || attachment;

      if (!mediaContent) {
        throw new Error('Photo or attachment must be provided');
      }

      if (Array.isArray(mediaContent)) {
        try {
          const media = await Promise.all(
            mediaContent.slice(0, 10).map(async (url, index) => ({
              type: await getMediaType(url),
              media: url,
              caption: index === 0 ? options.caption : undefined,
              ...(parse_mode && index === 0 ? { parse_mode } : {}),
            }))
          );
          return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, options, media);
        } catch (error) {
          console.error(`Error processing photo media group: ${error.message}`);
          return;
        }
      }
      
      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'photo') {
          return await sendWithFallback(bot.sendPhoto.bind(bot), bot, chatId, msg, { ...options, parse_mode }, mediaContent);
        }
        console.error(`Unsupported media type for photo: ${mediaType}`);
        return;
      } catch (error) {
        console.error(`Error determining photo type: ${error.message}`);
        return;
      }
    },

    async sendVideo(input, chatId = msg.chat.id, options = {}) {
      let video, attachment, parse_mode;
      if (typeof input === 'string') {
        video = input;
        parse_mode = 'Markdown';
      } else {
        ({ video, attachment, parse_mode = 'Markdown' } = input);
      }
      const mediaContent = video || attachment;

      if (!mediaContent) {
        throw new Error('Video or attachment must be provided');
      }

      if (Array.isArray(mediaContent)) {
        try {
          const media = await Promise.all(
            mediaContent.slice(0, 10).map(async (url, index) => ({
              type: await getMediaType(url),
              media: url,
              caption: index === 0 ? options.caption : undefined,
              ...(parse_mode && index === 0 ? { parse_mode } : {}),
            }))
          );
          return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, options, media);
        } catch (error) {
          console.error(`Error processing video media group: ${error.message}`);
          return;
        }
      }
      
      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'video') {
          return await sendWithFallback(bot.sendVideo.bind(bot), bot, chatId, msg, { ...options, parse_mode }, mediaContent);
        }
        console.error(`Unsupported media type for video: ${mediaType}`);
        return;
      } catch (error) {
        console.error(`Error determining video type: ${error.message}`);
        return;
      }
    },

    async sendAudio(input, chatId = msg.chat.id, options = {}) {
      let audio, attachment, parse_mode;
      if (typeof input === 'string') {
        audio = input;
        parse_mode = 'Markdown';
      } else {
        ({ audio, attachment, parse_mode = 'Markdown' } = input);
      }
      const mediaContent = audio || attachment;

      if (!mediaContent) {
        throw new Error('Audio or attachment must be provided');
      }

      if (Array.isArray(mediaContent)) {
        try {
          const media = await Promise.all(
            mediaContent.slice(0, 10).map(async (url, index) => ({
              type: await getMediaType(url),
              media: url,
              caption: index === 0 ? options.caption : undefined,
              ...(parse_mode && index === 0 ? { parse_mode } : {}),
            }))
          );
          return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, options, media);
        } catch (error) {
          console.error(`Error processing audio media group: ${error.message}`);
          return;
        }
      }
      
      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'audio') {
          return await sendWithFallback(bot.sendAudio.bind(bot), bot, chatId, msg, { ...options, parse_mode }, mediaContent);
        }
        console.error(`Unsupported media type for audio: ${mediaType}`);
        return;
      } catch (error) {
        console.error(`Error determining audio type: ${error.message}`);
        return;
      }
    },

    async sendDocument(input, chatId = msg.chat.id, options = {}) {
      let document, attachment, parse_mode;
      if (typeof input === 'string') {
        document = input;
        parse_mode = 'Markdown';
      } else {
        ({ document, attachment, parse_mode = 'Markdown' } = input);
      }
      const mediaContent = document || attachment;

      if (!mediaContent) {
        throw new Error('Document or attachment must be provided');
      }

      if (Array.isArray(mediaContent)) {
        try {
          const media = await Promise.all(
            mediaContent.slice(0, 10).map(async (url, index) => ({
              type: await getMediaType(url),
              media: url,
              caption: index === 0 ? options.caption : undefined,
              ...(parse_mode && index === 0 ? { parse_mode } : {}),
            }))
          );
          return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, options, media);
        } catch (error) {
          console.error(`Error processing document media group: ${error.message}`);
          return;
        }
      }
      
      return await sendWithFallback(bot.sendDocument.bind(bot), bot, chatId, msg, { ...options, parse_mode }, mediaContent);
    },

    async sendLocation(latitude, longitude, chatId = msg.chat.id, options = {}) {
      return await sendWithFallback(bot.sendLocation.bind(bot), bot, chatId, msg, options, latitude, longitude);
    },

    async sendAnimation(input, chatId = msg.chat.id, options = {}) {
      let animation, attachment, parse_mode;
      if (typeof input === 'string') {
        animation = input;
        parse_mode = 'Markdown';
      } else {
        ({ animation, attachment, parse_mode = 'Markdown' } = input);
      }
      const mediaContent = animation || attachment;

      if (!mediaContent) {
        throw new Error('Animation or attachment must be provided');
      }

      if (Array.isArray(mediaContent)) {
        try {
          const media = await Promise.all(
            mediaContent.slice(0, 10).map(async (url, index) => ({
              type: await getMediaType(url),
              media: url,
              caption: index === 0 ? options.caption : undefined,
              ...(parse_mode && index === 0 ? { parse_mode } : {}),
            }))
          );
          return await sendWithFallback(bot.sendMediaGroup.bind(bot), bot, chatId, msg, options, media);
        } catch (error) {
          console.error(`Error processing animation media group: ${error.message}`);
          return;
        }
      }
      
      return await sendWithFallback(bot.sendAnimation.bind(bot), bot, chatId, msg, { ...options, parse_mode }, mediaContent);
    },
  };
}

module.exports = { createChat };