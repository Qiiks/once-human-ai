const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getSupabaseClient } = require('../utils/supabaseClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-lore')
        .setDescription('Adds new lore to the knowledge base.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The unstructured text of the lore to add.')
                .setRequired(true)),
    async execute(interaction, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const unstructuredText = interaction.options.getString('text');

        try {
            // 1. Use Gemini to structure the data
            const structuringPrompt = `
                You are an expert at structuring information for a game's knowledge base.
                Given the following unstructured text, extract the key information and format it as a JSON object.
                The JSON object should have the following fields: "name" (string), "type" (string, e.g., "Item", "Location", "Character", "Lore"), and "description" (string, a detailed description).
                Based on the description, also identify any related entity names and list them in a "related_entities" array (string[]).
                If you cannot extract a sensible name or type, use "Unknown".

                Unstructured Text:
                "${unstructuredText}"

                Respond ONLY with the JSON object. Do not wrap it in markdown.
            `;

            const result = await client.gemini.generateContent(structuringPrompt);
            const response = await result.response;
            const responseText = response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new SyntaxError("AI response did not contain a valid JSON object.");
            }
            const structuredData = JSON.parse(jsonMatch[0]);

            // 2. Generate embedding using Gemini
            const embeddingModel = client.keyManager.aI.getGenerativeModel({ model: 'embedding-001' });
            const embeddingResult = await embeddingModel.embedContent(unstructuredText);
            const embedding = embeddingResult.embedding.values;

            // 3. Insert into PostgreSQL
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('lore_entries')
                .insert({
                    name: structuredData.name,
                    type: structuredData.type,
                    content: unstructuredText,
                    metadata: {
                        description: structuredData.description,
                        related_entities: structuredData.related_entities || [],
                        source: `Slash Command by ${interaction.user.username}`,
                        verified: true
                    },
                    embedding: JSON.stringify(embedding)
                });

            if (error) throw error;

            await interaction.editReply(`Successfully added new lore: **${structuredData.name}**`);

        } catch (error) {
            console.error('Error adding lore via slash command:', error);
            let errorMessage = 'There was an error processing your request. Please check the logs.';
            if (error instanceof SyntaxError) {
                errorMessage = 'Failed to parse the structured data from the AI. Please try rephrasing your text.';
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Could not connect to the knowledge base service. Please ensure the backend is running.';
            } else if (error.response) {
                errorMessage = `The knowledge base service returned an error: ${error.response.data.error}`;
            }
            await interaction.editReply(errorMessage);
        }
    },
};