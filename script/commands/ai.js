module.exports = {
  config: {
    name: 'ai',
    description: 'Ai GPT4o Powered by Openai.',
    execute: async ({ chat, args, userId }) => {
      const prompt = args.join(" ");
      
      if (!prompt) return chat.reply("Please provide your prompt!");
      
      const fetching = await chat.reply("Generating response...");
      
      try {
        const response = await gpt4o(prompt, userId);
        const sentMessage = await chat.reply(response);
        chat.delete(fetching);
        
        setupReplyCallback(sentMessage, userId, chat);
      } catch (error) {
        chat.delete(fetching);
        chat.reply(error.message);
      }
    }
  }
};

async function setupReplyCallback(sentMessage, userId, chat) {
  global.replyCallbacks.set(sentMessage.message_id, async (replyMsg) => {
    if (replyMsg.text) {
      try {
        const response = await gpt4o(replyMsg.text, userId);
        const newSentMessage = await chat.reply(response);
        
        setupReplyCallback(newSentMessage, userId, chat);
      } catch (error) {
        chat.reply(error.message);
      }
    }
  });
}

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