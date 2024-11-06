# Create new file: satellite_processor/utils/config.py
import json
import os

CONFIG_FILE = 'gui_config.json'

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {'last_input': '', 'last_output': ''}

def save_config(input_path, output_path):
    config = {
        'last_input': input_path,
        'last_output': output_path
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f)