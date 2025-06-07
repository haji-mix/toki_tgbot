module.exports = {
  name: 'eval',
  aliases: ['js'],
  prefix: true,
  admin: true, 
  description: 'Executes JavaScript code (admin only).',
  usage: '/eval <JavaScript code>',
  execute: async ({ chat, args, userId, chatId config, addListener }) => {

    if (args.length === 0) {
      return chat.reply('Please provide JavaScript code to evaluate.\nUsage: /eval <code>');
    }

    const code = args.join(' ');

    try {
      // Override console.log and console.error to send output via chat.reply
      const console = {
        log: (...args) => {
          const output = args.map(item => typeof item === 'object' ? JSON.stringify(item, null, 2) : item).join(' ');
          chat.reply(`Log: ${output}`);
        },
        error: (...args) => {
          const output = args.map(item => typeof item === 'object' ? JSON.stringify(item, null, 2) : item).join(' ');
          chat.reply(`Error: ${output}`);
        }
      };

      // Create a sandboxed context with essential variables
      const context = Object.freeze({
        console,
        chat,
        addListener,
        config: { prefix: config.prefix, admins: config.admins, vips: config.vips } // Expose only safe config properties
      });

      // Wrap code in an async IIFE to support async operations
      const wrappedCode = `(async () => { try {${code}} catch (error) { chat.reply(error.stack || error.message)}})()`;
      const fn = new Function('context', `with (context) { return ${wrappedCode}; }`);
      
      // Execute the function with the context
      const result = await fn(context);

      // Send the result if it exists and isn't undefined
      if (result !== undefined) {
        const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : result;
        await chat.reply({
          body: `Result:\n\`\`\`\n${output}\n\`\`\``,
          type: 'text',
          parse_mode: 'Markdown'
        });
      } else {
        await chat.reply({
          body: 'Code executed successfully, no return value.',
          type: 'text',
          parse_mode: 'Markdown'
        });
      }
    } catch (error) {
      await chat.reply({
        body: `Error executing code:\n\`\`\`\n${error.message}\n${error.stack}\n\`\`\``,
        type: 'text',
        parse_mode: 'Markdown'
      });
    }
  }
};