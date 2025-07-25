from flask import Flask, request, jsonify
from flask_cors import CORS
import chromadb
from chromadb.utils import embedding_functions
import json
import logging
import traceback

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

app = Flask(__name__)

# Initialize ChromaDB
client = chromadb.PersistentClient(path="./chroma_db")
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

# Get or create collection
collection = client.get_or_create_collection(
    name="once_human_knowledge",
    embedding_function=embedding_function
)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "version": "1.0.0"})

@app.route('/query', methods=['POST'])
def query_database():
    try:
        logger.info("Received query request")
        data = request.json
        query = data.get('query')
        n_results = data.get('n_results', 5)
        
        # First, try to find verified results
        try:
            results = collection.query(
                query_texts=[query],
                n_results=n_results,
                where={"verified": True}
            )
            # If we find verified results, and the distance is low enough, we can return them
            if results['distances'][0] and results['distances'][0][0] < 0.5:
                 logger.info(f"Found {len(results['documents'][0])} verified results for query: {query}")
            else:
                results = None
        except Exception as e:
            logger.warning(f"Could not query for verified documents: {e}")
            results = None

        # If no verified results are found, query the entire collection
        if not results or not results.get('documents') or not results['documents'][0]:
            logger.info(f"No verified results found for query: {query}. Querying all documents.")
            results = collection.query(
                query_texts=[query],
                n_results=n_results
            )

        # Format response with enhanced metadata handling
        formatted_results = []
        for i in range(len(results['documents'][0])):
            metadata = results['metadatas'][0][i]
            
            # Convert semicolon-separated strings back to lists for relevant fields
            list_fields = ['effects', 'keywords', 'stats_percentages', 'stats_numbers', 
                          'stats_durations', 'entities_weapons', 'entities_armor_sets', 
                          'entities_key_gear', 'entities_weapon_mods', 'entities_armor_mods']
            
            processed_metadata = {}
            for key, value in metadata.items():
                if key in list_fields and value:
                    processed_metadata[key] = value.split('; ')
                else:
                    processed_metadata[key] = value
            
            formatted_results.append({
                'document': results['documents'][0][i],
                'metadata': processed_metadata,
                'distance': float(results['distances'][0][i])
            })

        return jsonify({
            'success': True,
            'results': formatted_results
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=5000)
