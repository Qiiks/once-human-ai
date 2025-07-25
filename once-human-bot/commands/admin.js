const { SlashCommandBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('admin')
		.setDescription('Admin commands for managing the RAG system.')
		.addSubcommand(subcommand =>
			subcommand
				.setName('add')
				.setDescription('Add new information to the knowledge base.')
				.addStringOption(option =>
					option.setName('text')
						.setDescription('The information to add.')
						.setRequired(true)))
        .addSubcommand(subcommand =>
			subcommand
				.setName('delete')
				.setDescription('Delete information from the knowledge base.')
				.addStringOption(option =>
					option.setName('id')
						.setDescription('The ID of the information to delete.')
						.setRequired(true)))
        .addSubcommand(subcommand =>
			subcommand
				.setName('edit')
				.setDescription('Edit information in the knowledge base.')
				.addStringOption(option =>
					option.setName('id')
						.setDescription('The ID of the information to edit.')
						.setRequired(true))
                .addStringOption(option =>
					option.setName('text')
						.setDescription('The new information.')
						.setRequired(true))),
	async execute(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await interaction.deferReply({ ephemeral: true });

            const text = interaction.options.getString('text');
            const source = interaction.user.tag;

            const pythonExecutable = path.resolve(__dirname, '..', '..', 'rag_pipeline', 'venv', 'Scripts', 'python.exe');
            const pythonScriptPath = path.resolve(__dirname, '..', '..', 'rag_pipeline', 'add_data.py');
            const argument = JSON.stringify({ text, source });

            const pythonProcess = spawn(pythonExecutable, [pythonScriptPath, argument]);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log(`stdout: ${data}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.error(`stderr: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Python script exited with code ${code}`);
                    return interaction.editReply({ content: `An error occurred. stderr: ${stderr}` });
                }
                interaction.editReply({ content: `Successfully added information. stdout: ${stdout}` });
            });
        }
	},
};
