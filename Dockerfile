# Use a base image with both Python and Node.js
FROM nikolaik/python-nodejs:python3.12-nodejs20

# Set the working directory
WORKDIR /app

# Install system dependencies that might be needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# --- Python Setup ---
# Copy Python requirements and install dependencies
COPY rag_pipeline/requirements.txt ./rag_pipeline/
# Install CPU-only version of torch to avoid CUDA errors
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r rag_pipeline/requirements.txt

# --- Model Caching ---
# Set a persistent cache directory for sentence-transformers models
ENV SENTENCE_TRANSFORMERS_HOME=/app/model_cache
# Create the cache directory
RUN mkdir -p $SENTENCE_TRANSFORMERS_HOME
# Pre-download the model during the build process to bake it into the image
RUN python3 -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', cache_folder=os.environ['SENTENCE_TRANSFORMERS_HOME'])"

# --- Node.js Setup ---
# Copy all package.json and package-lock.json files
COPY package.json package-lock.json* ./
COPY once-human-bot/package.json once-human-bot/package-lock.json* ./once-human-bot/

# Install Node.js dependencies for the root and the bot
RUN npm install
RUN npm install --prefix ./once-human-bot

# --- Application Code ---
# Copy the rest of the application code
COPY . .

# --- Pre-built Database ---
# Copy your local ChromaDB data into the image. This will be used to seed
# the persistent volume on the first launch.
# IMPORTANT: Make sure your local DB path is correct.

# --- Start Services ---
# Expose the port for the Flask API
EXPOSE 5000

# Copy the entrypoint script and make it executable
# The entrypoint is now handled by the processes in fly.toml