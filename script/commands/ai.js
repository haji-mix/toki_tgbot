module.exports = {
  config: {
    name: 'ai',
    description: 'Ai GPT4o Powered by Openai.',
    execute: async ({ chat, args, userId }) => {
        
      const prompt = args.join(" ");
    
      if (!prompt) return chat.reply("Please provide your prompt!");
      
      const fetching = await chat.reply("Generating response...");
      
      try {
      
      let response = await gpt4o(prompt, userId)
      const sentMessage = await chat.reply(response);
      chat.delete(fetching);

      global.replyCallbacks.set(sentMessage.message_id, async (replyMsg) => {
        if (replyMsg.text) {
           response = await gpt4o(replyMsg.text, userId);
           response = await chat.reply(response);
           global.replyCallbacks.set(response.message_id);
        }
      });
      } catch (error) {
          chat.delete(fetching);
          chat.reply(error.message);
      }
    }
  }
};

async function gpt4o(ask, uid) {
    try {
const axios = require("axios");
const msg = await axios.post(global.api.hajime + "/api/gpt4o", {
          ask, uid
      });
        return msg.data.answer;
      } catch (error) {
          throw error;
      }
  }