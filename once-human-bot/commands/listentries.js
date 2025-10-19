const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const { getSupabaseClient } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listentries')
        .setDescription('Lists all the lore entries currently in the knowledge base.'),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const supabase = getSupabaseClient();
            const { data: entries, error } = await supabase
                .from('lore_entries')
                .select('name, type')
                .order('name');

            if (error) throw error;

            if (!entries || entries.length === 0) {
                return interaction.editReply({ content: 'There are no entries in the knowledge base.' });
            }

            const entryNames = entries.map(entry => `- **${entry.name}** (${entry.type})`);
            const message = `**Knowledge Base Entries (${entries.length} total):**\n${entryNames.join('\n')}`;

            // Split the message if it's too long for a single Discord reply
            if (message.length <= 2000) {
                await interaction.editReply({ content: message });
            } else {
                const chunks = [];
                let tempStr = message;
                while (tempStr.length > 0) {
                    chunks.push(tempStr.substring(0, 1990));
                    tempStr = tempStr.substring(1990);
                }
                await interaction.editReply({ content: chunks[0] });
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i], ephemeral: true });
                }
            }

        } catch (error) {
            console.error('Error executing /listentries command:', error);
            await interaction.editReply({ content: 'An error occurred while trying to fetch the list of entries.' });
        }
    },
};