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
        let prefixText = '';
        if (command.prefix === true) {
          prefixText = config.prefix || ''; 
        } else if (command.prefix === false) {
          prefixText = '';
        } else {
          prefixText = ``;
        }
        commandList += `${prefixText}${name} - ${command.description || 'No description'}\n`;
      }
    });
    const response = commandList || 'No commands available.';
     chat.reply(`Available commands:\n${response}`);
  }
};