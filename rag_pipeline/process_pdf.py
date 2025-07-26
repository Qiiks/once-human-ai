from unstructured.partition.auto import partition
import chromadb
from chromadb.utils import embedding_functions
import numpy as np
import json
import os
import sys
import google.generativeai as genai
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



KEYWORDS = ["deviant", "deviants", "key gear", "key gears", "armor set", "armor sets", "weapon", "weapons", "weapon mod", "weapon mods", "armor mod", "armor mods", "food", "foods", "food buff", "food buffs"]

pdf_dir = os.path.join("OncehumanPDFs")
output_json_path = "structured_data.json"

script_dir = os.path.dirname(__file__)
pdf_full_dir = os.path.join(script_dir, "..", pdf_dir)

all_structured_data = []
min_text_length = 50

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
                text_lower = text.lower()
                
                # Check if the text chunk contains any of the keywords
                if any(keyword in text_lower for keyword in KEYWORDS):
                    gemini_structured_data = gemini_structure_data(text)

                    if gemini_structured_data:
                        # Prepare document data using Gemini's structured output
                        document_data = {
                            "text": text,
                            "category": gemini_structured_data.get("entity_type", "general"),
                            "metadata": {
                                "source": filename,
                                "section": filename,
                                "entity_name": gemini_structured_data.get("entity_name", "Unknown"),
                                "description": gemini_structured_data.get("description", "Unknown"),
                                "effects": "; ".join(gemini_structured_data.get("effects") or []),
                                "stats_percentages": "; ".join(gemini_structured_data.get("stats", {}).get("percentages") or []),
                                "stats_numbers": "; ".join(gemini_structured_data.get("stats", {}).get("numbers") or []),
                                "stats_durations": "; ".join(gemini_structured_data.get("stats", {}).get("durations") or []),
                                "acquisition_method": gemini_structured_data.get("acquisition_method", "Unknown"),
                                "duration": gemini_structured_data.get("duration", "Unknown"),
                                "related_entities": "; ".join(gemini_structured_data.get("related_entities") or []),
                                "notes": gemini_structured_data.get("notes", "Unknown")
                            }
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
    print(f"Successfully saved combined structured data to '{output_json_path}'")

    # Initialize ChromaDB
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
    
    # Prepare data for ChromaDB
    print("Processing documents for ChromaDB...")
    documents = []
    metadatas = []
    ids = []
    
    for i, item in enumerate(all_structured_data):
        # Prepare document text with additional context
        doc_text = item["text"]
        if item["metadata"].get("effects"):
            doc_text += f"\nEffects: {item['metadata']['effects']}"
        
        # Prepare metadata (flatten nested structures)
        metadata = {
            "category": item["category"],  # Include category in metadata
            "source": item["metadata"]["source"],
            "section": item["metadata"]["section"]
        }
        
        # Add other metadata fields if they exist and aren't empty
        for key, value in item["metadata"].items():
            if value and key not in ["source", "section"]:
                metadata[key] = value
        
        documents.append(doc_text)
        metadatas.append(metadata)
        ids.append(f"chunk_{i}")
    
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
            raise
else:
    print("\nNo structured data extracted from any PDF.")

# Save game entities to a separate JSON file
