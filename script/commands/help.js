module.exports.config = {
  name: 'help',
  description: 'List all available commands',
  prefix: null, // both works
  vip: false,
  admin: false,
  category: "utility",
  usage: "",
  aliases: ['commands', 'menu'],
  execute: async ({ chat, config }) => {
    let commandList = '';
    global.commands.forEach((command, name) => {
      if (command.name === name) {
        commandList += `${config.prefix}${name} - ${command.description || 'No description'}\n`;
      }
    });
    const response = commandList || 'No commands available.';
     chat.reply(`Available commands:\n${response}`);
  }
};