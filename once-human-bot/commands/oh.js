const { SlashCommandBuilder } = require('@discordjs/builders');
const { retrieveAndGenerate } = require('../utils/localRAG');
const { getHistory, addMessage } = require('../utils/chatHistoryManager');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('oh')
        .setDescription('Interact with the Once Human bot.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('ask')
                .setDescription('Ask the Once Human bot a question.')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('The question you want to ask')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-lore')
                .setDescription('Add new lore to the knowledge base.')
                .addStringOption(option =>
                    option.setName('text')
                        .setDescription('The unstructured text of the lore to add.')
                        .setRequired(true))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channelId = interaction.channelId;

        await interaction.deferReply({ ephemeral: subcommand === 'add-lore' });

        try {
            if (subcommand === 'ask') {
                const query = interaction.options.getString('query');
                const chatHistory = getHistory(channelId);
                const result = await interaction.client.ragSystem.retrieveAndGenerate(query, chatHistory, interaction.client);
                addMessage(channelId, 'user', query);
                addMessage(channelId, 'model', result);
                await interaction.editReply(result);
            } else if (subcommand === 'add-lore') {
                // Ensure user has admin permissions
                if (!interaction.member.permissions.has('Administrator')) {
                    return interaction.editReply({ content: 'You must be an administrator to add lore.', ephemeral: true });
                }

                const unstructuredText = interaction.options.getString('text');

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

                const result = await interaction.client.gemini.generateContent(structuringPrompt);
                const response = await result.response;
                const responseText = response.text();
                
                // Extract JSON object from the response text
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new SyntaxError("AI response did not contain a valid JSON object.");
                }
                const newEntity = JSON.parse(jsonMatch[0]);

                // 2. Add a unique ID
                newEntity.id = uuidv4();

                // 3. Create embedding for the description
                const embeddingResult = await interaction.client.embeddingModel.embedContent(newEntity.description);
                const embedding = embeddingResult.embedding.values;

                // 4. Upsert to Pinecone
                // The new RAG system uses the local ChromaDB instance, so we no longer need to upsert to Pinecone.
                // The data is added to the database via the Python service.
                // We will, however, keep the logic to update the in-memory game entities.

                // 5. Update game_entities.json
                const gameEntitiesPath = path.join(__dirname, '..', '..', 'rag_pipeline', 'game_entities.json');
                const gameEntitiesData = await fs.readFile(gameEntitiesPath, 'utf8');
                const gameEntities = JSON.parse(gameEntitiesData);
                gameEntities.push(newEntity);
                await fs.writeFile(gameEntitiesPath, JSON.stringify(gameEntities, null, 2));

                // Update in-memory data for the current bot session
                interaction.client.gameEntities.push(newEntity);

                await interaction.editReply(`Successfully added new lore: **${newEntity.name}**`);
            }
        } catch (error) {
            console.error('Error processing request:', error);
            let errorMessage = 'There was an error processing your request. Please check the logs.';
            if (error instanceof SyntaxError) {
                errorMessage = 'Failed to parse the structured data from the AI. Please try rephrasing your text.';
            }
            await interaction.editReply(errorMessage);
        }
    },
};
