const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ResearchManager = require('../utils/research/ResearchManager');
const { sendReply } = require('../utils/messageUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('research')
        .setDescription('Performs in-depth research on a given topic.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The topic to research')
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const researchManager = new ResearchManager(interaction.client);

        // First, get the plan to estimate the number of steps.
        const plan = await researchManager.planner.createPlan(query);
        const estimatedSteps = plan.length;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_research')
                    .setLabel('Proceed')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_research')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger),
            );

        await interaction.reply({
            content: `This research query will require approximately ${estimatedSteps} steps. Do you wish to proceed?`,
            components: [row],
            ephemeral: true,
        });

        const filter = i => i.customId === 'confirm_research' || i.customId === 'cancel_research';
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_research') {
                await i.update({ content: 'Research in progress...', components: [] });
                try {
                    const results = await researchManager.research(query, plan);
                    const resultString = JSON.stringify(results, null, 2);
                    await sendReply(interaction, resultString);
                } catch (error) {
                    console.error(error);
                    await interaction.followUp({ content: 'An error occurred during the research process.' });
                }
            } else {
                await i.update({ content: 'Research cancelled.', components: [] });
            }
        });
    },
};