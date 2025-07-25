const { SlashCommandBuilder } = require('@discordjs/builders');
const { retrieveAndGenerate } = require('../utils/ragSystem');
const { getHistory, addMessage } = require('../utils/chatHistoryManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('oh')
        .setDescription('Ask the Once Human bot a question.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The question you want to ask')
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const channelId = interaction.channelId;

        await interaction.deferReply();

        try {
            const chatHistory = getHistory(channelId);
            const result = await retrieveAndGenerate(query, chatHistory, interaction.client.pineconeIndex, interaction.client.gemini);
            addMessage(channelId, 'user', query);
            addMessage(channelId, 'model', result);
            await interaction.editReply(result);
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};
