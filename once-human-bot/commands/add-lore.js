const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

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
            // Extract JSON object from the response text, making it more robust.
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // Throw a specific error if no JSON is found in the AI response.
                throw new SyntaxError("AI response did not contain a valid JSON object.");
            }
            const newEntity = JSON.parse(jsonMatch[0]);

            // 2. Add a unique ID
            newEntity.id = uuidv4();

            // 3. Create embedding for the description
            const embeddingResult = await client.embeddingModel.embedContent(newEntity.description);
            const embedding = embeddingResult.embedding.values;

            // 4. Upsert to Pinecone
            await client.pineconeIndex.upsert([
                {
                    id: newEntity.id,
                    values: embedding,
                    metadata: { name: newEntity.name, type: newEntity.type, description: newEntity.description },
                },
            ]);

            // 5. Update game_entities.json
            const gameEntitiesPath = path.join(__dirname, '..', '..', 'rag_pipeline', 'game_entities.json');
            const gameEntitiesData = await fs.readFile(gameEntitiesPath, 'utf8');
            const gameEntities = JSON.parse(gameEntitiesData);
            gameEntities.push(newEntity);
            await fs.writeFile(gameEntitiesPath, JSON.stringify(gameEntities, null, 2));

            // Update in-memory data for the current bot session
            client.gameEntities.push(newEntity);

            await interaction.editReply(`Successfully added new lore: **${newEntity.name}**`);

        } catch (error) {
            console.error('Error adding lore:', error);
            let errorMessage = 'There was an error processing your request. Please check the logs.';
            if (error instanceof SyntaxError) {
                errorMessage = 'Failed to parse the structured data from the AI. Please try rephrasing your text.'
            }
            await interaction.editReply(errorMessage);
        }
    },
};