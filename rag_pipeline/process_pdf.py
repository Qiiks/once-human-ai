from unstructured.partition.auto import partition
import chromadb
from chromadb.utils import embedding_functions
import json
import os
import sys
import hashlib
import google.generativeai as genai
import textwrap
from add_data import gemini_structure_data # Import gemini_structure_data
from dotenv import load_dotenv
from tqdm import tqdm # Import tqdm

load_dotenv() # Load environment variables from .env file

# Configure Gemini API
# It's recommended to set this as an environment variable:
# os.environ["GEMINI_API_KEY"] = "YOUR_API_KEY"
gemini_api_key = os.environ.get("GEMINI_API_KEY")
if not gemini_api_key:
    print("GEMINI_API_KEY environment variable not set. Please set it to your Gemini API key.")
    sys.exit(1)
genai.configure(api_key=gemini_api_key)



KEYWORDS = [
    "deviant", "deviants", "key gear", "key gears", "armor set", "armor sets", 
    "weapon", "weapons", "weapon mod", "weapon mods", "armor mod", "armor mods", 
    "food", "foods", "food buff", "food buffs", "recipe", "cooking", "ingredient", "effect"
]

pdf_dir = os.path.join("OncehumanPDFs")
output_json_path = "structured_data.json"

script_dir = os.path.dirname(__file__)
pdf_full_dir = os.path.join(script_dir, "..", pdf_dir)
all_structured_data = []
processed_texts = set()
min_text_length = 50

# --- Caching Implementation ---
# Load existing data to avoid re-processing and wasting API calls
if os.path.exists(output_json_path):
    print(f"Loading existing structured data from '{output_json_path}'...")
    with open(output_json_path, "r", encoding="utf-8") as f:
        all_structured_data = json.load(f)
        processed_texts = {item['text'] for item in all_structured_data}
    print(f"Loaded {len(all_structured_data)} existing items. Will skip processing these chunks.")

if not os.path.exists(pdf_full_dir):
    print(f"Error: Directory '{pdf_full_dir}' not found.")
else:
    pdf_files = [f for f in os.listdir(pdf_full_dir) if f.endswith(".pdf")]
    for filename in tqdm(pdf_files, desc="Processing PDFs"):
        pdf_full_path = os.path.join(pdf_full_dir, filename)
        try:
            elements = partition(
                filename=pdf_full_path,
                chunking_strategy="by_title",
            )
            
            # Filter elements that meet the minimum length requirement
            processable_elements = [
                element for element in elements 
                if hasattr(element, 'text') and element.text.strip() and len(element.text.strip()) >= min_text_length
            ]

            for element in tqdm(processable_elements, desc=f"Processing chunks in {filename}", leave=False):
                text = element.text.strip()

                # If we have already processed this exact text chunk, skip it.
                if text in processed_texts:
                    continue

                text_lower = text.lower()
                
                # Check if the text chunk contains any of the keywords
                if any(keyword in text_lower for keyword in KEYWORDS):
                    gemini_structured_data = gemini_structure_data(text)

                    if gemini_structured_data:
                        # Prepare document data using Gemini's structured output
                        # Gemini data is already a dict, perfect for metadata
                        metadata = gemini_structured_data

                        # Add source and section info
                        metadata['source'] = filename
                        metadata['section'] = filename

                        # Clean up any list-like fields for ChromaDB
                        for key, value in metadata.items():
                            if isinstance(value, list):
                                metadata[key] = "; ".join(str(v) for v in value if v)
                            elif value is None:
                                metadata[key] = ""

                        document_data = {
                            "text": text,
                            "category": metadata.get("entity_type", "general"),
                            "metadata": metadata
                        }
                        all_structured_data.append(document_data)
                    # else:
                        # print(f"Gemini returned no structured data for chunk: {text[:50]}...") # Suppress this print for cleaner tqdm output
                # else:
                    # print(f"Chunk does not contain specified keywords, skipping: {text[:50]}...") # Suppress this print for cleaner tqdm output
        except Exception as e:
            print(f"Error processing {filename}: {e}")

if all_structured_data:
    # Save structured data to JSON
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(all_structured_data, f, ensure_ascii=False, indent=4)
    print(f"Successfully saved {len(all_structured_data)} structured items to '{output_json_path}'")

    # --- Interactive Verification Step ---
    print("\n--- Starting Verification Process ---")
    print("For each item, enter 'a' to accept, 'd' to discard, or 'q' to quit and save accepted items.")
    verified_data = []
    for i, item in enumerate(all_structured_data):
        print("\n" + "="*80)
        print(f"Item {i+1}/{len(all_structured_data)}")
        print("-" * 80)
        print("Original Text:")
        print(textwrap.fill(item['text'], width=80))
        print("-" * 80)
        print("Gemini Structured Data:")
        print(json.dumps(item['metadata'], indent=2))
        print("="*80)

        action = ""
        while action not in ['a', 'd', 'q']:
            action = input("Action (a/d/q): ").lower().strip()

        if action == 'a':
            item['metadata']['verified'] = True
            verified_data.append(item)
            print("==> Accepted and marked as verified.")
        elif action == 'd':
            print("==> Discarded.")
        elif action == 'q':
            print("Quitting verification. Accepted items will be added to the database.")
            break

    print("\nInitializing ChromaDB...")
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    
    # Use sentence-transformers for embeddings
    embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )
    
    # Delete existing collection if it exists
    try:
        chroma_client.delete_collection(name="once_human_knowledge")
        print("Deleted existing collection")
    except:
        pass
    
    # Create new collection
    collection = chroma_client.create_collection(
        name="once_human_knowledge",
        embedding_function=embedding_function,
        metadata={"description": "Once Human game knowledge base"}
    )
    
    if verified_data:
        # Prepare data for ChromaDB
        print("Processing verified documents for ChromaDB...")
        documents = []
        metadatas = []
        ids = []

        for item in verified_data:
            # Prepare document text with additional context
            doc_text = item["text"]
            if item["metadata"].get("effects"):
                doc_text += f"\nEffects: {item['metadata']['effects']}"

            # This is the metadata that will be flattened and sent to ChromaDB
            final_metadata = item["metadata"].copy()

            # Special handling for the 'stats' dictionary before the main loop
            if 'stats' in final_metadata and isinstance(final_metadata['stats'], dict):
                stats_dict = final_metadata['stats']
                stat_strings = []
                for stat_type, values in stats_dict.items():
                    if values and isinstance(values, list):
                        stat_strings.append(f"{stat_type}: {', '.join(values)}")
                final_metadata['stats'] = "; ".join(stat_strings) if stat_strings else ""

            # Flatten any remaining nested lists and handle None
            for key, value in final_metadata.items():
                if isinstance(value, list):
                    final_metadata[key] = "; ".join(str(v) for v in value if v)
                elif value is None:
                    final_metadata[key] = ""

            # Generate a stable ID based on the content
            doc_id = hashlib.sha256(item['text'].encode('utf-8')).hexdigest()
            documents.append(doc_text)
            metadatas.append(final_metadata)
            ids.append(doc_id)
    
    # Add data to ChromaDB in batches
    print("Adding documents to ChromaDB...")
    batch_size = 50  # Smaller batch size for better reliability
    total_batches = (len(documents) + batch_size - 1) // batch_size
    
    for i in tqdm(range(0, len(documents), batch_size), desc="Adding to ChromaDB"):
        end_idx = min(i + batch_size, len(documents))
        # batch_num = (i // batch_size) + 1 # Suppress this print for cleaner tqdm output
        # print(f"Processing batch {batch_num}/{total_batches}...") # Suppress this print for cleaner tqdm output
        
        try:
            collection.add(
                documents=documents[i:end_idx],\
                metadatas=metadatas[i:end_idx],\
                ids=ids[i:end_idx]\
            )
        except Exception as e:
            print(f"Error adding batch {i // batch_size + 1}: {str(e)}")
            print("Problematic documents:", documents[i:end_idx])
            # Decide if you want to stop or continue
            # raise
    else:
        print("\nNo verified data to add to ChromaDB.")
else:
    print("\nNo structured data extracted from any PDF.")

# Save game entities to a separate JSON file
