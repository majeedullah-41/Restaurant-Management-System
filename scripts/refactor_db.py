import re

with open('src-tauri/src/db.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace typical connection opens
content = re.sub(
    r'let conn = rusqlite::Connection::open\("\.\./local\.db"\)\.map_err\(\|e\| e\.to_string\(\)\)\?;',
    r'let conn = get_conn()?;',
    content
)
content = re.sub(
    r'let conn = Connection::open\("\.\./local\.db"\)\.map_err\(\|e\| e\.to_string\(\)\)\?;',
    r'let conn = get_conn()?;',
    content
)

# Remove CREATE TABLE IF NOT EXISTS blocks inside conn.execute(..., []).map_err(...)
# Use non-greedy dotall, but ensure we don't accidentally match across functions
# It's safer to split by lines and handle it.
lines = content.split('\n')
new_lines = []
skip = False
for line in lines:
    if skip:
        if ')' in line and ';' in line and ('.map_err' in line or '.ok()' in line):
            skip = False
        continue

    # Skip specific ALTER TABLE blocks in get_or_create_order
    if 'ALTER TABLE orders ADD COLUMN' in line and '.ok();' in line:
        continue
    if 'ALTER TABLE order_items ADD COLUMN' in line and '.ok();' in line:
        continue
    if 'ALTER TABLE customers ADD COLUMN' in line and '.ok();' in line:
        continue

    # Skip CREATE TABLE blocks
    if 'conn.execute' in line and 'CREATE TABLE IF NOT EXISTS' in line:
        if ')' in line and ';' in line and ('.map_err' in line or '.ok()' in line):
            # single line block
            continue
        else:
            skip = True
            continue

    new_lines.append(line)

with open('src-tauri/src/db.rs', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))
