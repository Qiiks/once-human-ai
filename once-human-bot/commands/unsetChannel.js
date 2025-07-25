const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsetchannel')
        .setDescription('Unsets the channel for the bot to auto-reply in.'),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const configPath = path.join(__dirname, '../config/channelConfig.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        config.channelId = null;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        await interaction.reply('Auto-reply channel has been unset.');
    },
};
