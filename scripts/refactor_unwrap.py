import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    in_init_db = False
    
    for i, line in enumerate(lines):
        if 'pub fn init_db' in line:
            in_init_db = True
        if in_init_db and line.startswith('}'):
            in_init_db = False
            
        if in_init_db:
            continue
            
        # We want to replace `.unwrap()` with `.map_err(|e| e.to_string())?`
        # But we must be careful not to touch `.unwrap_or`, etc.
        # Use regex to match strictly `.unwrap()`
        if '.unwrap()' in line:
            lines[i] = re.sub(r'\.unwrap\(\)', '.map_err(|e| e.to_string())?', line)
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)

process_file('src-tauri/src/db.rs')
print('Replacement complete.')
