module.exports = {
        name: "agen",
        aliases: ["animagine", "animegen", "crushimg"],
        description: "generates anime style image",
        prefix: true,
        usage: "[prompt]",
execute: async ({ chat, args }) => {
    const prompt = args.join(" ");
    if (!prompt) return chat.reply("Provide A Prompt first!");
    const generating = await chat.reply({ body: "Generating image..." });
    try {
        await chat.reply({ body: "Here's your Generated Image Sir!'", attachment: global.api.hajime + "/api/crushimg?prompt=" + encodeURIComponent(prompt) });
        chat.delete(generating);
    } catch (error) {
        chat.delete(generating);
        chat.reply(error.message || "Something went wrong!");
    }
    
}
}