import os, re

with open('c:/Users/DINESHMANI/Desktop/Pictures/Safesteel/styles.css', 'r', encoding='utf-8') as f:
    css_text = f.read()

jsx_classes = set()
for root, dirs, files in os.walk('c:/Users/DINESHMANI/Desktop/Pictures/Safesteel/steelsafe-app/src'):
    for file in files:
        if file.endswith('.jsx'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                matches = re.findall(r'className=["`\']([^"`\']+)["`\']', content)
                for m in matches:
                    for cls in m.split():
                        cls = cls.replace('${', '').replace('}', '').strip()
                        if cls and not cls.startswith('$') and not cls.startswith('('):
                            jsx_classes.add(cls)

missing = []
for c in sorted(jsx_classes):
    if c not in css_text:
        missing.append(c)

print('Total classes used in JSX:', len(jsx_classes))
print('Count of classes not literally in styles.css:', len(missing))
print('List of missing classes:', missing)
