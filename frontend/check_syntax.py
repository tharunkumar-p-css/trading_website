
import collections
import os

filepath = r'g:\My Drive\trading_app\frontend\app.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

counts = collections.Counter()
stack = []
in_string = None
in_comment = None

chars = []
for i in range(len(content)):
    char = content[i]
    if in_comment == 'single':
        if char == '\n': in_comment = None
        continue
    if in_comment == 'multi':
        if i > 0 and content[i-1] == '*' and char == '/': in_comment = None
        continue
    
    if in_string:
        if char == in_string:
            if i > 0 and content[i-1] != '\\': in_string = None
        continue
    
    # Check for comments
    if char == '/' and i < len(content)-1:
        if content[i+1] == '/': in_comment = 'single'; continue
        if content[i+1] == '*': in_comment = 'multi'; continue

    # Check for strings
    if char in '\"\'`':
        in_string = char
        continue

    # Counter for code characters only
    if char in '{[(':
        counts[char] += 1
        stack.append((char, i))
    elif char in '}])':
        counts[char] += 1
        if stack:
            last_open, last_idx = stack[-1]
            if (last_open == '{' and char == '}') or \
               (last_open == '[' and char == ']') or \
               (last_open == '(' and char == ')'):
                stack.pop()
            else:
                print(f"Mismatched closing {char} at index {i} (around '{content[i-20:i+20]}') which matches opening {last_open} from index {last_idx}")
                # Don't pop, keep stack to see next mismatch
        else:
            print(f"Extra closing {char} at index {i} (around '{content[i-20:i+20]}')")

for open_char, idx in stack:
    print(f"Unclosed opening {open_char} at index {idx} (around '{content[idx-20:idx+20]}')")

print(f"Final Counts: {dict(counts)}")
