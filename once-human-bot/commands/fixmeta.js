const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fixmeta')
        .setDescription('Regenerates metadata for a lore entry that has missing or incorrect information.')
        .addStringOption(option =>
            option.setName('entry_name')
                .setDescription('The exact name of the lore entry to fix.')
                .setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const entryName = interaction.options.getString('entry_name');

        // Defer the reply as this might take a moment
        await interaction.deferReply({ ephemeral: true });

        try {
            const ragSystem = interaction.client.ragSystem;
            const result = await ragSystem.regenerate_metadata_tool({ entry_name: entryName }, interaction, interaction.client);

            if (result.success) {
                await interaction.editReply({ content: result.message });
            } else {
                await interaction.editReply({ content: `Error: ${result.message}` });
            }
        } catch (error) {
            console.error('Error executing /fixmeta command:', error);
            await interaction.editReply({ content: 'An unexpected error occurred while trying to fix the metadata.' });
        }
    },
};