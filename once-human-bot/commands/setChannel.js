const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('Sets the channel for the bot to auto-reply in.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to set')
                .setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const configPath = path.join(__dirname, '../config/channelConfig.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        config.channelId = channel.id;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        await interaction.reply(`Auto-reply channel has been set to ${channel}.`);
    },
};
