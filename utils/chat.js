const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Downloads media from a URL and saves it as a file
 * @param {string} url - The URL of the media
 * @returns {Promise<string>} - The path to the saved file
 * @throws {Error} - If download or file saving fails
 */
async function downloadMedia(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mediaBuffer = Buffer.from(response.data);

    const contentType = response.headers['content-type'];
    let extension = '.bin';
    if (contentType) {
      if (contentType.startsWith('image/')) {
        extension = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg' :
                    contentType.includes('png') ? '.png' :
                    contentType.includes('webp') ? '.jpg' :
                    contentType.includes('gif') ? '.gif' : '.jpg';
      } else if (contentType.startsWith('video/')) {
        extension = contentType.includes('mp4') ? '.mp4' : '.mp4';
      } else if (contentType.startsWith('audio/')) {
        extension = contentType.includes('mpeg') ? '.mp3' : '.mp3';
      } else if (contentType.includes('pdf')) {
        extension = '.pdf';
      }
    }

    const filename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${extension}`;
    const filePath = path.join(os.tmpdir(), filename);

    await fs.promises.writeFile(filePath, mediaBuffer);
    console.log(`Media saved to ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error(`Error downloading or saving media from ${url}:`, error.message);
    return;
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
    const response = await axios.head(url);
    const contentType = response.headers['content-type'];
    
    if (contentType.startsWith('image/')) return 'photo';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('application/') || contentType === 'text/plain') return 'document';
    if (contentType.includes('gif')) return 'animation';
    return 'document';
  } catch (error) {
    console.error(`Error fetching MIME type for ${url}:`, error.message);
    return;
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

    if (error.message.includes('WEBPAGE_CURL_FAILED') && error.message.includes('WEBPAGE_MEDIA_EMPTY') && retryConfig.mediaUrl && !retryConfig.hasRetriedLocal) {
      console.log(`Attachment Failed for ${retryConfig.mediaUrl}. Attempting local download and upload.`);
      try {
        const filePath = await downloadMedia(retryConfig.mediaUrl);
        const newArgs = retryConfig.isMediaGroup
          ? args.map(item => item.media === retryConfig.mediaUrl ? { ...item, media: `file://${filePath}` } : item)
          : [filePath, ...args.slice(1)];
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
        console.error(`Failed to download and save media: ${downloadError.message}`);
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
          return { message_id: null }; // Return a fallback object
        }
        return await bot.sendMessage(chatId, 'This topic is closed. Please use an active topic.', fallbackOptions);
      } catch (fallbackError) {
        console.error('Error during fallback to general topic:', fallbackError.message);
        return { message_id: null }; // Return a fallback object
      }
    }

    // If all retries fail, return a fallback object
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
          parse_mode = 'Markdown', 
          ...extraOptions 
        } = input);

        if (!input.type && attachment) {
          type = 'media group';
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

          case 'media group':
            if (mediaContent) {
              const mediaItems = Array.isArray(mediaContent) ? mediaContent : [mediaContent]; // Wrap single URL in array
              try {
                const media = await Promise.all(
                  mediaItems.slice(0, 10).map(async (item, index) => {
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
                  { isMediaGroup: true, mediaUrl: mediaItems[0] }
                );
              } catch (error) {
                console.error(`Error processing media group: ${error.message}`);
                return { message_id: null };
              }
            }
            throw new Error('Media group requires at least one media item');

          case 'photo':
            if (mediaContent) {
              try {
                const mediaType = await getMediaType(mediaContent);
                if (mediaType === 'photo') {
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
                console.error(`Unsupported media type for photo: ${mediaType}`);
                return { message_id: null };
              } catch (error) {
                console.error(`Error determining photo type: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          case 'video':
            if (mediaContent) {
              try {
                const mediaType = await getMediaType(mediaContent);
                if (mediaType === 'video') {
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
                console.error(`Unsupported media type for video: ${mediaType}`);
                return { message_id: null };
              } catch (error) {
                console.error(`Error determining video type: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          case 'audio':
            if (mediaContent) {
              try {
                const mediaType = await getMediaType(mediaContent);
                if (mediaType === 'audio') {
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
                console.error(`Unsupported media type for audio: ${mediaType}`);
                return { message_id: null };
              } catch (error) {
                console.error(`Error determining audio type: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          case 'animation':
            if (mediaContent) {
              try {
                const mediaType = await getMediaType(mediaContent);
                if (mediaType === 'animation') {
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
                console.error(`Unsupported media type for animation: ${mediaType}`);
                return { message_id: null };
              } catch (error) {
                console.error(`Error determining animation type: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          case 'document':
            if (mediaContent) {
              try {
                const mediaType = await getMediaType(mediaContent);
                return await sendWithFallback(
                  bot.sendDocument.bind(bot),
                  bot,
                  chatId,
                  msg,
                  { caption: body, ...finalOptions },
                  [mediaContent],
                  { mediaUrl: mediaContent }
                );
              } catch (error) {
                console.error(`Error determining document type: ${error.message}`);
                return { message_id: null };
              }
            }
            return { message_id: null };

          case 'sticker':
            if (mediaContent) return await sendWithFallback(
              bot.sendSticker.bind(bot),
              bot,
              chatId,
              msg,
              finalOptions,
              [mediaContent],
              { mediaUrl: mediaContent }
            );
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

          default:
            throw new Error(`Unsupported message type: ${type}`);
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
          return await sendWithFallback(
            bot.sendMediaGroup.bind(bot),
            bot,
            chatId,
            msg,
            options,
            [media],
            { isMediaGroup: true }
          );
        } catch (error) {
          console.error(`Error processing photo media group: ${error.message}`);
          return { message_id: null };
        }
      }

      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'photo') {
          return await sendWithFallback(
            bot.sendPhoto.bind(bot),
            bot,
            chatId,
            msg,
            { ...options, parse_mode, caption: options.caption },
            [mediaContent],
            { mediaUrl: mediaContent }
          );
        }
        console.error(`Unsupported media type for photo: ${mediaType}`);
        return { message_id: null };
      } catch (error) {
        console.error(`Error determining photo type: ${error.message}`);
        return { message_id: null };
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
          return await sendWithFallback(
            bot.sendMediaGroup.bind(bot),
            bot,
            chatId,
            msg,
            options,
            [media],
            { isMediaGroup: true }
          );
        } catch (error) {
          console.error(`Error processing video media group: ${error.message}`);
          return { message_id: null };
        }
      }

      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'video') {
          return await sendWithFallback(
            bot.sendVideo.bind(bot),
            bot,
            chatId,
            msg,
            { ...options, parse_mode, caption: options.caption },
            [mediaContent],
            { mediaUrl: mediaContent }
          );
        }
        console.error(`Unsupported media type for video: ${mediaType}`);
        return { message_id: null };
      } catch (error) {
        console.error(`Error determining video type: ${error.message}`);
        return { message_id: null };
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
          return await sendWithFallback(
            bot.sendMediaGroup.bind(bot),
            bot,
            chatId,
            msg,
            options,
            [media],
            { isMediaGroup: true }
          );
        } catch (error) {
          console.error(`Error processing audio media group: ${error.message}`);
          return { message_id: null };
        }
      }

      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'audio') {
          return await sendWithFallback(
            bot.sendAudio.bind(bot),
            bot,
            chatId,
            msg,
            { ...options, parse_mode, caption: options.caption },
            [mediaContent],
            { mediaUrl: mediaContent }
          );
        }
        console.error(`Unsupported media type for audio: ${mediaType}`);
        return { message_id: null };
      } catch (error) {
        console.error(`Error determining audio type: ${error.message}`);
        return { message_id: null };
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
          return await sendWithFallback(
            bot.sendMediaGroup.bind(bot),
            bot,
            chatId,
            msg,
            options,
            [media],
            { isMediaGroup: true }
          );
        } catch (error) {
          console.error(`Error processing document media group: ${error.message}`);
          return { message_id: null };
        }
      }

      try {
        const mediaType = await getMediaType(mediaContent);
        return await sendWithFallback(
          bot.sendDocument.bind(bot),
          bot,
          chatId,
          msg,
          { ...options, parse_mode, caption: options.caption },
          [mediaContent],
          { mediaUrl: mediaContent }
        );
      } catch (error) {
        console.error(`Error determining document type: ${error.message}`);
        return { message_id: null };
      }
    },

    async sendLocation(latitude, longitude, chatId = msg.chat.id, options = {}) {
      return await sendWithFallback(
        bot.sendLocation.bind(bot),
        bot,
        chatId,
          msg,
          options,
        [latitude, longitude]
      );
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
          return await sendWithFallback(
            bot.sendMediaGroup.bind(bot),
            bot,
            chatId,
            msg,
            options,
            [media],
            { isMediaGroup: true }
          );
        } catch (error) {
          console.error(`Error processing animation media: ${error.message}`);
          return { message_id: null };
        }
      }

      try {
        const mediaType = await getMediaType(mediaContent);
        if (mediaType === 'animation') {
          return await sendWithFallback(
            bot.sendAnimation.bind(bot),
            bot,
            chatId,
            msg,
            { ...options, parse_mode, caption: options.caption },
            [mediaContent],
            { mediaUrl: mediaContent }
          );
        }
        console.error(`Unsupported media type for animation: ${mediaType}`);
        return { message_id: null };
      } catch (error) {
        console.error(`Error determining animation type: ${error.message}`);
        return { message_id: null };
      }
    },
  };
}

module.exports = { createChat };