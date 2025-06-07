module.exports = {
  name: 'demo',
  prefix: true,
  admin: true,  
  description: 'Tests various chat.reply features (admin only).',
  usage: '/demo <feature> (e.g., inline, reply, photo, video, document, location, animation, sticker)',
  execute: async ({ chat, args, userId, config }) => {

    const feature = args[0]?.toLowerCase();
    const availableFeatures = [
      'inline', // Inline keyboard
      'reply',  // Reply keyboard
      'photo',  // Single photo
      'video',  // Video
      'document', // Document
      'location', // Location
      'animation', // Animation (GIF)
      'sticker'   // Sticker
    ];

    if (!feature) {
      return chat.reply({
        body: `Please specify a feature to test.\nAvailable features: ${availableFeatures.join(', ')}\nUsage: /demo <feature>`,
        type: 'text',
        parse_mode: 'Markdown'
      });
    }

    if (!availableFeatures.includes(feature)) {
      return chat.reply({
        body: `Unknown feature: ${feature}\nAvailable features: ${availableFeatures.join(', ')}`,
        type: 'text',
        parse_mode: 'Markdown'
      });
    }

    try {
      switch (feature) {
        case 'inline':
          await chat.reply({
            body: 'Test *inline keyboard* with buttons:',
            type: 'text',
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Option 1', callback_data: 'test_inline_1' },
                  { text: 'Option 2', callback_data: 'test_inline_2' }
                ],
                [{ text: 'Visit xAI', url: 'https://x.ai' }]
              ]
            }
          });
          break;

        case 'reply':
          await chat.reply({
            body: 'Test *reply keyboard*:',
            type: 'text',
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                [{ text: 'Yes' }, { text: 'No' }],
                [{ text: 'Cancel', request_contact: true }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          });
          break;

        case 'photo':
          await chat.reply({
            body: 'Here’s a test *photo*!',
            type: 'photo',
            content: 'https://picsum.photos/800/600', // Random image from Picsum
            parse_mode: 'Markdown'
          });
          break;

        case 'video':
          await chat.reply({
            body: 'Here’s a test *video*!',
            type: 'video',
            content: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
            parse_mode: 'Markdown',
            disable_notification: true
          });
          break;

        case 'document':
          await chat.reply({
            body: 'Here’s a test *document*!',
            type: 'document',
            content: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            parse_mode: 'Markdown'
          });
          break;

        case 'location':
          await chat.reply({
            body: 'Test *location* (New York City):',
            type: 'location',
            content: { latitude: 40.7128, longitude: -74.0060 },
            parse_mode: 'Markdown'
          });
          break;

        case 'animation':
          await chat.reply({
            body: 'Here’s a test *animation* (GIF)!',
            type: 'animation',
            content: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
            parse_mode: 'Markdown'
          });
          break;

        case 'sticker':
          await chat.reply({
            type: 'sticker',
            content: 'CAACAgQAAxkBAAIBDGhD1T-tSooTYrAZKWK-y_1bojq_AAIDEwACGhBAUgTfLwvZLYNWNgQ'
          });
          break;
      }
    } catch (error) {
      await chat.reply({
        body: `Error testing feature *${feature}*:\n${error.message}`,
        type: 'text',
        parse_mode: 'Markdown'
      });
    }
  }
};