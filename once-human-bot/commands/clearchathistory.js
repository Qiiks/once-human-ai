const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { clearHistory } = require('../utils/chatHistoryManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearchathistory')
        .setDescription('Clears the conversation history for this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Only users who can manage messages can use this
    async execute(interaction) {
        const channelId = interaction.channelId;
        clearHistory(channelId);
        await interaction.reply({ content: 'Conversation history for this channel has been cleared.', ephemeral: true });
    },
};