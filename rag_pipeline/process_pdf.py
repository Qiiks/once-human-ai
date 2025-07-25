from unstructured.partition.auto import partition
import chromadb
from chromadb.utils import embedding_functions
import numpy as np
import json
import os
import sys
import google.generativeai as genai
from add_data import gemini_structure_data # Import gemini_structure_data

# Configure Gemini API
# It's recommended to set this as an environment variable:
# os.environ["GEMINI_API_KEY"] = "YOUR_API_KEY"
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

if not genai.api_key:
    print("GEMINI_API_KEY environment variable not set. Please set it to your Gemini API key.")
    sys.exit(1)

# Define the lists of items
WEAPON_LIST = [
    "Baseball Bat", "Torch", "DE.50", "MPS7", "SN700", "SOCR Outsider", "KVD Icebreaker",
    "SN700 – Gulped Lore", "KAM – Pioneer", "MPS5 Blue Tiger", "SOCR – The Last Valor",
    "KVD Boom! Boom!", "KAM – Abyss Glance", "KAM – Crank", "Compound Bow", "DE.50 Wildfire",
    "MG4 – Predator", "Recurve Crossbow", "AWS.338 - Bullseye", "DE.50 - Jaws",
    "M416 - Silent Anabasis", "R500 - Memento", "MG4 - Conflicting Memories", "Critical Pulse",
    "DB12 - Raining Cash", "DBSG - Doombringer", "G17 - Hazardous Object", "HAMR - Brahminy",
    "KV-SBR - Little Jaws", "ACS12 - Corrosion", "ACS12 - Pyroclasm Starter"
]

ARMOR_SET_LIST = [
    "Raid Armor Set", "Agent Armor Set", "Heavy Duty Armor Set", "Falcon Armor Set",
    "Bastille Armor Set", "Renegade Armor Set", "Lonewolf Armor Set", "Shelterer Armor Set",
    "Savior Armor Set", "Storm Weaver Set", "Protector Set", "Redeemer Set",
    "Explosive Set", "Scout Set", "Rustic Set", "Test Subject Set"
]

KEY_GEAR_LIST = [
    "Stealth Walker Wrap", "Covert Walker Shirt", "Snow Camo Gloves", "Gas Tight Helm",
    "Gas Mask Hood", "BBQ Gloves", "Oasis Mask", "Beret Helmet", "Cage Helmet",
    "Frost Tactical Vest", "Prickly Dance Pants", "Rainbow Armor", "Sharp Blade Pants",
    "Overload Pants", "Shaman Vulture Top", "Old Huntsman Boots"
]

WEAPON_MOD_LIST = [
    "Blaze Blessing", "Bombardier Souvenir", "Bounce Rampage", "Burning Wrath", "Cowboy",
    "Cryo Blast", "Decisive Blow", "Double Gunner", "Durable Territory", "Embers",
    "Fast Refurbish", "Final Territory", "Flame Resonance", "Frosty Blessing",
    "Heavy Explosives", "Hunters Perk", "Lasting Fortification", "Not Throw Away Your Shot",
    "Obliterate", "Portable Territory", "Precision Rush", "Reckless Bomber", "Recover Mark",
    "Shattering Ice", "Shatter Them All", "Shield Breaker", "Shock Diffusion",
    "Shock Rampage", "Shoot Out", "Shooting Blitz", "Shrapnel Smash", "Shrapnel Souvenir",
    "Spreading Marks", "Static Shock", "Super Bullet", "Super Charged", "Surge Amplifier",
    "Targeted Bounce", "United We Stand", "Vortex Multiplier", "Vulnerability Amplifier"
]

ARMOR_MOD_LIST = [
    "Abnormal Increase", "Ardent Shield", "Blitzkrieg", "Break Bounce",
    "Bullet Siphon", "Covered Advance", "Crit Amplifier", "Crit Boost", "Critical Rescue",
    "Deadshot", "Delayed Blast", "Deviation Expert", "Elemental Havoc", "Elemental Overload",
    "Enduring Shield", "Explosive Shrapnel", "Fateful Strike", "Ferocious Charge",
    "First Electrocution", "First-Move Advantage", "Gunslinger", "Head Guard",
    "Head-on Conflict", "Healing Fortification", "Lifeforce Boost", "Light Cannon",
    "Lingering Frost", "Mag Expansion", "Melee Amplifier", "Melee Momentum", "Momentum Up",
    "Most Wanted", "Munitions Amplifier", "Obliteration", "Point Detonation",
    "Precise Strike", "Precision Bounce", "Precision Charge", "Quick Comeback",
    "Rejuvenating", "Reload Rampage", "Resist Advantage", "Retrusion Explosion",
    "Rush Hour", "Ruthless Reaper", "Secluded Strike", "Shrapnel Carnage",
    "Slow and Steady", "Status Amplification", "Status Enhancement", "Status Immune",
    "Targeted Strike", "Three Strikes", "Thunderclap", "Unbreakable", "Unstoppable",
    "Weakspot DMG Boost", "Work of Proficiency"
]

def extract_entities(text):
    """Extract all entities mentioned in the text."""
    text_lower = text.lower()
    entities = {
        "weapons": [item for item in WEAPON_LIST if item.lower() in text_lower],
        "armor_sets": [item for item in ARMOR_SET_LIST if item.lower() in text_lower],
        "key_gear": [item for item in KEY_GEAR_LIST if item.lower() in text_lower],
        "weapon_mods": [item for item in WEAPON_MOD_LIST if item.lower() in text_lower],
        "armor_mods": [item for item in ARMOR_MOD_LIST if item.lower() in text_lower]
    }
    return {k: v for k, v in entities.items() if v}  # Only return non-empty lists

def extract_stats(text):
    """Extract numerical stats and effects from text."""
    import re
    
    # Pattern for percentage matches (e.g., "+25%", "25%")
    percentage_pattern = r'[+-]?\d+%'
    # Pattern for numerical effects (e.g., "+20", "-15")
    numerical_pattern = r'[+-]?\d+'
    # Pattern for time durations (e.g., "30 min", "24 hours")
    duration_pattern = r'\d+\s*(?:min(?:ute)?s?|hours?|s(?:econds?)?)'
    
    stats = {
        "percentages": re.findall(percentage_pattern, text),
        "numbers": re.findall(numerical_pattern, text),
        "durations": re.findall(duration_pattern, text)
    }
    return stats

def classify_chunk(text, gemini_data=None):
    """Enhanced chunk classification with metadata extraction, optionally using Gemini data."""
    text_lower = text.lower()
    
    entities = extract_entities(text)
    stats = extract_stats(text)

    category = "general"
    metadata = {
        "entities": entities,
        "stats": stats,
        "keywords": [],
        "effects": []
    }

    if gemini_data:
        if gemini_data.get("item_type"):
            category = gemini_data["item_type"]
        if gemini_data.get("item_name"):
            metadata["item_name"] = gemini_data["item_name"]
        if gemini_data.get("description"):
            metadata["description"] = gemini_data["description"]
        if gemini_data.get("effects"):
            metadata["effects"].extend(gemini_data["effects"])
        if gemini_data.get("stats"):
            for stat_type, values in gemini_data["stats"].items():
                if stat_type in metadata["stats"]:
                    metadata["stats"][stat_type].extend(values)
                else:
                    metadata["stats"][stat_type] = values
        if gemini_data.get("recipe"):
            metadata["recipe"] = gemini_data["recipe"]
        if gemini_data.get("location"):
            metadata["location"] = gemini_data["location"]
        if gemini_data.get("buff_duration"):
            metadata["buff_duration"] = gemini_data["buff_duration"]
        if gemini_data.get("other_info"):
            metadata["other_info"] = gemini_data["other_info"]

    # Existing classification logic (can be augmented or overridden by Gemini data)
    if any(entities.get("weapons", [])):
        category = "weapon"
    elif any(entities.get("armor_sets", [])):
        category = "armor_set"
    elif any(entities.get("key_gear", [])):
        category = "key_gear"
    elif any(entities.get("weapon_mods", [])):
        category = "weapon_mod"
    elif any(entities.get("armor_mods", [])):
        category = "armor_mod"
    elif any(keyword in text_lower for keyword in ["gun", "weapon", "rifle", "pistol", "shotgun", "smg", "sniper", "lmg", "machine gun"]):
        category = "weapon"
    elif any(keyword in text_lower for keyword in ["armor", "set", "helmet", "vest", "pants", "gloves", "mask", "wrap", "shirt", "boots"]):
        category = "armor_general"
    elif any(keyword in text_lower for keyword in ["mod", "attachment", "upgrade", "scope", "magazine", "stock"]):
        category = "mod_general"
    elif any(keyword in text_lower for keyword in ["food", "buff", "cooking", "recipe", "dish", "effect", "drink"]):
        category = "food_buffs"

    effect_keywords = ["increase", "decrease", "boost", "reduce", "gain", "buff", "debuff", "bonus", "damage", "defense", "resistance"]
    metadata["keywords"].extend([word for word in effect_keywords if word in text_lower and word not in metadata["keywords"]])

    effect_pattern = r'(?:increases?|decreases?|boosts?|reduces?|gains?|buffs?|provides?)\s[^.]*'
    import re
    effects = re.findall(effect_pattern, text_lower)
    metadata["effects"].extend([effect.strip() for effect in effects if effect.strip() not in metadata["effects"]])

    return category, metadata

pdf_dir = os.path.join("OncehumanPDFs")
output_json_path = "structured_data.json"
game_entities_path = "game_entities.json"

script_dir = os.path.dirname(__file__)
pdf_full_dir = os.path.join(script_dir, "..", pdf_dir)

all_structured_data = []
min_text_length = 50

if not os.path.exists(pdf_full_dir):
    print(f"Error: Directory '{pdf_full_dir}' not found.")
else:
    for filename in os.listdir(pdf_full_dir):
        if filename.endswith(".pdf"):
            pdf_full_path = os.path.join(pdf_full_dir, filename)
            print(f"Processing {filename}...")
            try:
                elements = partition(
                    filename=pdf_full_path,
                    chunking_strategy="by_title",
                )
                
                for element in elements:
                    if hasattr(element, 'text') and element.text.strip() and len(element.text.strip()) >= min_text_length:
                        text = element.text.strip()
                        
                        # Split text into potential item descriptions
                        item_chunks = []
                        current_chunk = []
                        
                        for line in text.split('\n'):
                            line = line.strip()
                            # Start of a new item description
                            if any(marker in line for marker in ['Type:', 'Effect:', '■', '○']) or \
                               any(item in line for item in WEAPON_LIST + ARMOR_SET_LIST + KEY_GEAR_LIST + WEAPON_MOD_LIST + ARMOR_MOD_LIST):
                                if current_chunk:
                                    item_chunks.append('\n'.join(current_chunk))
                                current_chunk = [line]
                            # Continuation of current item
                            elif line and not line.startswith('---'):
                                current_chunk.append(line)
                        
                        # Add the last chunk
                        if current_chunk:
                            item_chunks.append('\n'.join(current_chunk))
                        
                        # Process each item chunk
                        for chunk in item_chunks:
                            if len(chunk) >= min_text_length:
                                chunk_category, chunk_metadata = classify_chunk(chunk)
                                
                                # Only add chunks that have clear game-related content
                                if chunk_category != "general" or chunk_metadata["effects"] or chunk_metadata["entities"]:
                                    # Add context from surrounding text if available
                                    context = text[:text.find(chunk)][-100:] + text[text.find(chunk) + len(chunk):][:100]
                                    
                                    # Prepare document data
                                    document_data = {
                                        "text": chunk,
                                        "category": chunk_category,  # Keep category at top level
                                        "metadata": {
                                            "source": filename,
                                            "section": filename,
                                            "context": context.strip(),
                                            "effects": "; ".join(chunk_metadata.get("effects", [])),
                                            "keywords": "; ".join(chunk_metadata.get("keywords", [])),
                                            "stats_percentages": "; ".join(chunk_metadata.get("stats", {}).get("percentages", [])),
                                            "stats_numbers": "; ".join(chunk_metadata.get("stats", {}).get("numbers", [])),
                                            "stats_durations": "; ".join(chunk_metadata.get("stats", {}).get("durations", [])),
                                            "entities_weapons": "; ".join(chunk_metadata.get("entities", {}).get("weapons", [])),
                                            "entities_armor_sets": "; ".join(chunk_metadata.get("entities", {}).get("armor_sets", [])),
                                            "entities_key_gear": "; ".join(chunk_metadata.get("entities", {}).get("key_gear", [])),
                                            "entities_weapon_mods": "; ".join(chunk_metadata.get("entities", {}).get("weapon_mods", [])),
                                            "entities_armor_mods": "; ".join(chunk_metadata.get("entities", {}).get("armor_mods", []))
                                        }
                                    }
                                    
                                    all_structured_data.append(document_data)
                print(f"Successfully processed {filename}")
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
    
    for i in range(0, len(documents), batch_size):
        end_idx = min(i + batch_size, len(documents))
        batch_num = (i // batch_size) + 1
        print(f"Processing batch {batch_num}/{total_batches}...")
        
        try:
            collection.add(
                documents=documents[i:end_idx],
                metadatas=metadatas[i:end_idx],
                ids=ids[i:end_idx]
            )
        except Exception as e:
            print(f"Error adding batch {batch_num}: {str(e)}")
            print("Problematic documents:", documents[i:end_idx])
            raise
else:
    print("\nNo structured data extracted from any PDF.")

# Save game entities to a separate JSON file
game_entities = {
    "weapons": WEAPON_LIST,
    "armor_sets": ARMOR_SET_LIST,
    "key_gear": KEY_GEAR_LIST,
    "weapon_mods": WEAPON_MOD_LIST,
    "armor_mods": ARMOR_MOD_LIST
}

with open(game_entities_path, "w", encoding="utf-8") as f:
    json.dump(game_entities, f, ensure_ascii=False, indent=4)
print(f"Successfully saved game entities to '{game_entities_path}'")