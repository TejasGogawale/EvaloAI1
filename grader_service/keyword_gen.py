import re
from collections import Counter

STOPWORDS = set("""
a an the of in on at for from with and or to by as is are was were be been being
this that these those it its their his her they them he she we you i our your
""".split())

def naive_keywords(text: str, top_n: int = 8) -> list:
    tokens = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    tokens = [t for t in tokens if t not in STOPWORDS]
    counts = Counter(tokens)
    return [w for w, _ in counts.most_common(top_n)]
