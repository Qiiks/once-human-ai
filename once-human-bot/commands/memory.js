const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getMemories, deleteMemory } = require('../utils/memoryManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Manages user memories.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your stored memories.')
                .addUserOption(option => option.setName('user').setDescription('The user whose memories to view (admin only).')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('forget')
                .setDescription('Forget one of your memories.')
                .addStringOption(option => option.setName('key').setDescription('The key of the memory to forget.').setRequired(true))
                .addUserOption(option => option.setName('user').setDescription('The user whose memory to forget (admin only).'))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const key = interaction.options.getString('key');
        const callingUser = interaction.member;

        let userIdToManage;
        if (targetUser) {
            if (!callingUser.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'You do not have permission to manage memories for other users.', ephemeral: true });
            }
            userIdToManage = targetUser.id;
        } else {
            userIdToManage = callingUser.id;
        }

        if (subcommand === 'view') {
            const memories = getMemories(userIdToManage);
            if (memories.size === 0) {
                return interaction.reply({ content: 'No memories found for this user.', ephemeral: true });
            }

            let response = 'Here are the memories I have for this user:\n';
            for (const [key, value] of memories.entries()) {
                response += `**${key}:** ${value}\n`;
            }
            return interaction.reply({ content: response, ephemeral: true });
        }

        if (subcommand === 'forget') {
            const success = deleteMemory(userIdToManage, key);
            if (success) {
                return interaction.reply({ content: `I have forgotten the memory with the key "${key}".`, ephemeral: true });
            } else {
                return interaction.reply({ content: `I could not find a memory with the key "${key}".`, ephemeral: true });
            }
        }
    },
};