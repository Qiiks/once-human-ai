# Once Human AI Knowledge Steward

## Overview

This project is a specialized Discord bot, the "Once Human AI Knowledge Steward," designed to answer questions and provide information about the game "Once Human." It leverages a Retrieval-Augmented Generation (RAG) pipeline to process in-game knowledge from PDF documents and deliver accurate, context-aware responses to user queries within a Discord server.

## Architecture

The system is composed of two primary services that work in tandem:

*   **`once-human-bot`**: A Node.js-based Discord bot that serves as the user-facing interface. It listens for commands, manages conversations, and communicates with the RAG pipeline to fetch answers.
*   **`rag_pipeline`**: A Python-based service responsible for the heavy lifting of knowledge processing. It ingests and chunks PDF documents from the `OncehumanPDFs` directory, creates vector embeddings, and stores them in a database. When the bot receives a query, it sends it to this service, which retrieves relevant information and generates a coherent answer.

## Features

Based on the available commands, the bot supports the following features:

*   **Ask Questions**: Use the `/oh` command to ask anything about "Once Human."
*   **Manage Lore**: Add new information to the knowledge base with `/add-lore`.
*   **Conversation Management**: Clear the bot's chat history with `/clearchathistory`.
*   **Channel Management**: Restrict the bot to specific channels using `/setChannel` and `/unsetChannel`.
*   **Admin Utilities**: Access administrative functions via the `/admin` command.
*   **Data Integrity**: List and manage knowledge base entries with `/listentries` and `/fixmeta`.

## Setup and Installation

To get the project up and running, you will need to set up both the Node.js bot and the Python RAG pipeline.

1.  **Prerequisites**:
    *   Node.js (for the bot)
    *   Python (for the RAG pipeline)
    *   Docker (for containerized deployment)

2.  **Discord Bot (`once-human-bot`)**:
    *   Navigate to the `once-human-bot` directory.
    *   Install dependencies: `npm install`
    *   Configure your Discord bot token and other required environment variables.
    *   Run the bot: `node index.js`

3.  **RAG Pipeline (`rag_pipeline`)**:
    *   Navigate to the `rag_pipeline` directory.
    *   Install Python dependencies: `pip install -r requirements.txt`
    *   Set up the required API keys and database connections.
    *   Run the RAG service: `python rag_service.py`

4.  **Docker Deployment**:
    *   The project includes a `Dockerfile` for easy containerization. Deploy to your preferred host (e.g., Coolify, Render, or other container hosts).
    *   Build the Docker image: `docker build -t once-human-bot .`
    *   Run the container locally: `docker run -p 8080:8080 once-human-bot`

## Project Structure

*   [`once-human-bot/`](once-human-bot/): Contains all the source code for the Node.js Discord bot, including commands, events, and utilities.
*   [`rag_pipeline/`](rag_pipeline/): Holds the Python service for the RAG pipeline, including data processing scripts, the query service, and API endpoints.
*   [`OncehumanPDFs/`](OncehumanPDFs/): Stores the source PDF documents that are fed into the RAG pipeline to build the knowledge base.
*   [`Dockerfile`](Dockerfile): Defines the container environment for deploying the application.
*   (Optional) Configure your deployment platform of choice. The project previously included `fly.toml` but it has been removed to keep deployment instructions platform-agnostic.