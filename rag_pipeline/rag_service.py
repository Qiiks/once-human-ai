from flask import Flask, request, jsonify, send_from_directory, send_file, after_this_request
import shutil
import os
import tempfile
from flask_cors import CORS
import chromadb
from chromadb.utils import embedding_functions
import json
import logging
import traceback
import uuid

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

app = Flask(__name__)

# Initialize ChromaDB
client = chromadb.PersistentClient(path="/data/chroma_db")
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

@app.route('/add', methods=['POST'])
def add_to_database():
    try:
        logger.info("Received add request")
        data = request.json
        document = data.get('document')
        metadata = data.get('metadata')

        if not document or not metadata:
            return jsonify({'success': False, 'error': 'Missing document or metadata'}), 400

        # Generate a unique ID
        doc_id = str(uuid.uuid4())

        # Process metadata to be ChromaDB compatible
        processed_metadata = {}
        for key, value in metadata.items():
            if isinstance(value, list):
                processed_metadata[key] = '; '.join(map(str, value))
            elif isinstance(value, dict):
                processed_metadata[key] = json.dumps(value)
            else:
                processed_metadata[key] = value
        
        # Add "verified" flag
        processed_metadata['verified'] = True


        # Add to collection
        collection.add(
            documents=[document],
            metadatas=[processed_metadata],
            ids=[doc_id]
        )

        logger.info(f"Successfully added document with ID: {doc_id}")
        return jsonify({'success': True, 'id': doc_id})

    except Exception as e:
        logger.error(f"Error adding document: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')
@app.route('/documents', methods=['GET'])
def get_all_documents():
    try:
        logger.info("Received request to get all documents")
        
        # Retrieve all documents from the collection
        results = collection.get()
        
        # Format the response
        formatted_results = []
        for i in range(len(results['ids'])):
            formatted_results.append({
                'id': results['ids'][i],
                'document': results['documents'][i],
                'metadata': results['metadatas'][i]
            })
            
        return jsonify({
            'success': True,
            'documents': formatted_results
        })
    except Exception as e:
        logger.error(f"Error getting all documents: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/delete', methods=['POST'])
def delete_from_database():
    try:
        logger.info("Received delete request")
        data = request.json
        doc_id = data.get('id')

        if not doc_id:
            return jsonify({'success': False, 'error': 'Missing document id'}), 400

        # Delete from collection
        collection.delete(ids=[doc_id])

        logger.info(f"Successfully deleted document with ID: {doc_id}")
        return jsonify({'success': True, 'id': doc_id})

    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
@app.route('/backup', methods=['GET'])
def backup_database():
    try:
        logger.info("Received backup request")
        db_path = "/data/chroma_db"
        
        if not os.path.exists(db_path):
            return jsonify({'success': False, 'error': 'Database directory not found.'}), 404

        # Create a temporary file to store the archive
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
            archive_path = tmp_file.name
        
        # Create the zip archive
        shutil.make_archive(archive_path.replace('.zip', ''), 'zip', db_path)
        
        logger.info(f"Successfully created backup archive at {archive_path}")

        # Send the file and schedule it for deletion
        @after_this_request
        def cleanup(response):
            try:
                os.remove(archive_path)
                logger.info(f"Successfully cleaned up temporary backup file: {archive_path}")
            except Exception as e:
                logger.error(f"Error cleaning up temporary backup file {archive_path}: {e}")
            return response

        return send_file(archive_path, as_attachment=True, download_name='chroma_db_backup.zip')

    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=5000)
