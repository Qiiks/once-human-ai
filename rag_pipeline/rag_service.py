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
import io
import time
from datetime import datetime
from collections import defaultdict

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define a filter to exclude /health logs
class HealthCheckFilter(logging.Filter):
    def filter(self, record):
        # Exclude logs containing 'GET /health'
        return 'GET /health' not in record.getMessage()

# Get the Werkzeug logger and add the filter
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.addFilter(HealthCheckFilter())
 
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize ChromaDB
logger.info("Initializing ChromaDB client...")
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

# Use an environment variable for the DB path, defaulting to the container path
DB_PATH = os.getenv("CHROMA_DB_PATH", "/data/chroma_db")
logger.info(f"Initializing ChromaDB client at path: {DB_PATH}")
client = chromadb.PersistentClient(path=DB_PATH)
logger.info("ChromaDB client initialized.")

# Load the embedding model. This is a one-time operation at startup.
# The model is downloaded once and cached locally. Subsequent startups load from the cache.
logger.info("Loading sentence transformer model 'all-MiniLM-L6-v2'. This may take a moment...")
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
logger.info("Sentence transformer model loaded successfully.")

# Get or create collection
logger.info("Getting or creating ChromaDB collection 'once_human_knowledge'...")
collection = client.get_or_create_collection(
    name="once_human_knowledge",
    embedding_function=embedding_function
)
logger.info("Collection ready. Service is now up and running.")

# Initialize metrics tracking
start_time = time.time()
request_counter = defaultdict(int)

@app.route('/health', methods=['GET'])
def health_check():
    """
    Comprehensive health check endpoint that validates:
    - Flask server status
    - ChromaDB connection and collection availability
    - Embedding model availability
    - Database path accessibility
    - Memory usage
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "rag-service",
        "version": "1.0.0",
        "checks": {}
    }
    
    overall_healthy = True
    
    try:
        # Check 1: Flask server status
        health_status["checks"]["flask_server"] = {
            "status": "healthy",
            "message": "Flask server is running"
        }
        
        # Check 2: ChromaDB client connection
        try:
            # Test client connection by getting heartbeat
            client.heartbeat()
            health_status["checks"]["chromadb_client"] = {
                "status": "healthy",
                "message": "ChromaDB client is connected"
            }
        except Exception as e:
            health_status["checks"]["chromadb_client"] = {
                "status": "unhealthy",
                "message": f"ChromaDB client connection failed: {str(e)}"
            }
            overall_healthy = False
        
        # Check 3: Collection availability and basic query test
        try:
            # Test collection access and basic functionality
            collection_count = collection.count()
            # Perform a simple test query to ensure embedding function works
            test_results = collection.query(
                query_texts=["test"],
                n_results=1
            )
            health_status["checks"]["chromadb_collection"] = {
                "status": "healthy",
                "message": f"Collection accessible with {collection_count} documents",
                "document_count": collection_count
            }
        except Exception as e:
            health_status["checks"]["chromadb_collection"] = {
                "status": "unhealthy",
                "message": f"Collection access failed: {str(e)}"
            }
            overall_healthy = False
        
        # Check 4: Embedding model availability
        try:
            # Test embedding function by creating a simple embedding
            test_embedding = embedding_function(["health check test"])
            if test_embedding and len(test_embedding) > 0:
                health_status["checks"]["embedding_model"] = {
                    "status": "healthy",
                    "message": "Sentence transformer model is loaded and functional",
                    "model_name": "all-MiniLM-L6-v2"
                }
            else:
                health_status["checks"]["embedding_model"] = {
                    "status": "unhealthy",
                    "message": "Embedding model returned empty result"
                }
                overall_healthy = False
        except Exception as e:
            health_status["checks"]["embedding_model"] = {
                "status": "unhealthy",
                "message": f"Embedding model test failed: {str(e)}"
            }
            overall_healthy = False
        
        # Check 5: Database path accessibility
        try:
            db_path = os.getenv("CHROMA_DB_PATH", "/data/chroma_db")
            if os.path.exists(db_path) and os.access(db_path, os.R_OK | os.W_OK):
                # Get directory size
                total_size = 0
                for dirpath, dirnames, filenames in os.walk(db_path):
                    for filename in filenames:
                        filepath = os.path.join(dirpath, filename)
                        total_size += os.path.getsize(filepath)
                
                health_status["checks"]["database_storage"] = {
                    "status": "healthy",
                    "message": f"Database path accessible at {db_path}",
                    "path": db_path,
                    "size_mb": round(total_size / (1024 * 1024), 2)
                }
            else:
                health_status["checks"]["database_storage"] = {
                    "status": "unhealthy",
                    "message": f"Database path not accessible: {db_path}"
                }
                overall_healthy = False
        except Exception as e:
            health_status["checks"]["database_storage"] = {
                "status": "unhealthy",
                "message": f"Database storage check failed: {str(e)}"
            }
            overall_healthy = False
        
        # Check 6: Memory usage
        try:
            import psutil
            memory_info = psutil.virtual_memory()
            memory_percent = memory_info.percent
            
            if memory_percent < 90:
                health_status["checks"]["memory_usage"] = {
                    "status": "healthy",
                    "message": f"Memory usage is acceptable: {memory_percent}%",
                    "memory_percent": memory_percent,
                    "available_gb": round(memory_info.available / (1024**3), 2)
                }
            else:
                health_status["checks"]["memory_usage"] = {
                    "status": "warning",
                    "message": f"High memory usage: {memory_percent}%",
                    "memory_percent": memory_percent,
                    "available_gb": round(memory_info.available / (1024**3), 2)
                }
        except ImportError:
            health_status["checks"]["memory_usage"] = {
                "status": "skipped",
                "message": "psutil not available for memory monitoring"
            }
        except Exception as e:
            health_status["checks"]["memory_usage"] = {
                "status": "error",
                "message": f"Memory check failed: {str(e)}"
            }
        
        # Check 7: Environment configuration
        required_env_vars = ["CHROMA_DB_PATH"]
        missing_vars = [var for var in required_env_vars if not os.getenv(var)]
        
        if not missing_vars:
            health_status["checks"]["environment"] = {
                "status": "healthy",
                "message": "All required environment variables are set"
            }
        else:
            health_status["checks"]["environment"] = {
                "status": "warning",
                "message": f"Missing environment variables: {', '.join(missing_vars)}"
            }
        
        # Set overall status
        if overall_healthy:
            health_status["status"] = "healthy"
        else:
            health_status["status"] = "unhealthy"
        
        # Add performance metrics
        health_status["metrics"] = {
            "uptime_seconds": time.time() - start_time,
            "total_requests": request_counter.get("total", 0),
            "successful_queries": request_counter.get("successful_queries", 0),
            "failed_queries": request_counter.get("failed_queries", 0)
        }
        
        status_code = 200 if overall_healthy else 503
        return jsonify(health_status), status_code
        
    except Exception as e:
        logger.error(f"Health check failed with exception: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "rag-service",
            "version": "1.0.0",
            "error": str(e),
            "checks": {
                "critical_error": {
                    "status": "unhealthy",
                    "message": f"Health check endpoint failed: {str(e)}"
                }
            }
        }), 503

@app.route('/query', methods=['POST'])
def query_database():
    request_counter["total"] += 1
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
                'id': results['ids'][0][i],
                'document': results['documents'][0][i],
                'metadata': processed_metadata,
                'distance': float(results['distances'][0][i])
            })

        request_counter["successful_queries"] += 1
        return jsonify({
            'success': True,
            'results': formatted_results
        })
    except Exception as e:
        request_counter["failed_queries"] += 1
        logger.error(f"Query failed: {e}")
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

@app.route('/metrics', methods=['GET'])
def metrics():
    """
    Prometheus-style metrics endpoint for monitoring
    """
    try:
        # Get collection count
        doc_count = collection.count()
        
        # Calculate uptime
        uptime = time.time() - start_time
        
        # Memory usage if available
        memory_info = {}
        try:
            import psutil
            mem = psutil.virtual_memory()
            memory_info = {
                "memory_usage_percent": mem.percent,
                "memory_available_bytes": mem.available,
                "memory_total_bytes": mem.total
            }
        except ImportError:
            pass
        
        metrics_data = {
            "service_info": {
                "name": "rag-service",
                "version": "1.0.0",
                "uptime_seconds": uptime
            },
            "request_metrics": dict(request_counter),
            "database_metrics": {
                "document_count": doc_count,
                "collection_name": "once_human_knowledge"
            },
            "system_metrics": memory_info,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        return jsonify(metrics_data)
    except Exception as e:
        logger.error(f"Metrics endpoint failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/readiness', methods=['GET'])
def readiness_check():
    """
    Kubernetes-style readiness probe - checks if service is ready to accept traffic
    """
    try:
        # Quick checks for readiness
        collection.heartbeat()  # Check ChromaDB connection
        doc_count = collection.count()  # Verify collection is accessible
        
        return jsonify({
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "rag-service",
            "document_count": doc_count
        })
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return jsonify({
            "status": "not_ready",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "rag-service",
            "error": str(e)
        }), 503

@app.route('/liveness', methods=['GET'])
def liveness_check():
    """
    Kubernetes-style liveness probe - basic check if service is alive
    """
    return jsonify({
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "rag-service",
        "uptime_seconds": time.time() - start_time
    })

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
@app.route('/update', methods=['POST'])
def update_database():
    try:
        logger.info("Received update request")
        data = request.json
        doc_id = data.get('id')
        document = data.get('document')
        metadata = data.get('metadata')

        if not all([doc_id, document, metadata]):
            return jsonify({'success': False, 'error': 'Missing id, document, or metadata'}), 400

        # ChromaDB's `update` is an upsert, but we'll use it to overwrite.
        collection.update(
            ids=[doc_id],
            documents=[document],
            metadatas=[metadata]
        )

        logger.info(f"Successfully updated document with ID: {doc_id}")
        return jsonify({'success': True, 'id': doc_id})

    except Exception as e:
        logger.error(f"Error updating document: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
@app.route('/backup', methods=['GET'])
def backup_database():
    try:
        logger.info("Received backup request")
        db_path = os.getenv("CHROMA_DB_PATH", "/data/chroma_db")
        
        if not os.path.exists(db_path):
            return jsonify({'success': False, 'error': 'Database directory not found.'}), 404

        # Create a temporary file path
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
            archive_path = tmp_file.name
        
        # Create the zip archive
        shutil.make_archive(archive_path.replace('.zip', ''), 'zip', db_path)
        
        logger.info(f"Successfully created backup archive at {archive_path}")

        # Read the archive into memory to release the file lock before sending
        try:
            with open(archive_path, 'rb') as f:
                data = f.read()
        finally:
            # Ensure the temporary file is always cleaned up
            os.remove(archive_path)
            logger.info(f"Successfully cleaned up temporary backup file: {archive_path}")

        # Send the in-memory data
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='chroma_db_backup.zip',
            mimetype='application/zip'
        )

    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/restore', methods=['POST'])
def restore_database():
    try:
        logger.info("Received restore request")
        
        if 'backup_file' not in request.files:
            return jsonify({'success': False, 'error': 'No backup file provided.'}), 400
        
        file = request.files['backup_file']
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No selected file.'}), 400
        
        if file and file.filename.endswith('.zip'):
            db_path = "/data/chroma_db"
            
            # Ensure the directory exists and is empty
            if os.path.exists(db_path):
                shutil.rmtree(db_path)
            os.makedirs(db_path)
            
            # Save the uploaded zip file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
                file.save(tmp_file.name)
                tmp_zip_path = tmp_file.name
            
            # Unzip the file to the database directory
            shutil.unpack_archive(tmp_zip_path, db_path)
            
            # Clean up the temporary zip file
            os.remove(tmp_zip_path)
            
            logger.info("Successfully restored database from backup. Re-initializing client...")

            # Re-initialize the client and collection to load the new data
            global client, collection
            client = chromadb.PersistentClient(path=db_path)
            collection = client.get_or_create_collection(
                name="once_human_knowledge",
                embedding_function=embedding_function
            )
            
            logger.info("Database client re-initialized.")
            return jsonify({'success': True, 'message': 'Database restored and reloaded successfully.'})
        
        return jsonify({'success': False, 'error': 'Invalid file format. Please upload a .zip file.'}), 400

    except Exception as e:
        logger.error(f"Error restoring backup: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
