"""
Enhanced Plagiarism Detection Module
Uses multiple FREE detection methods and APIs:
1. Local similarity algorithms (TF-IDF, n-grams, sequence matching)
2. Bing Web Search API (FREE tier: 1000 queries/month)
3. DuckDuckGo Search (completely FREE, no API key)
4. CrossRef API for academic papers (FREE)
"""

import os
import re
from typing import List, Tuple, Dict
from difflib import SequenceMatcher
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import requests
from dotenv import load_dotenv
import time

load_dotenv()

# Configuration
PLAGIARISM_THRESHOLD = 0.75  # 75% similarity = plagiarism
MODERATE_THRESHOLD = 0.60    # 60% = needs review


def check_plagiarism(
    student_text: str,
    comparison_texts: List[Dict[str, str]],
    check_web: bool = True
) -> Dict:
    """
    Check if student text is plagiarized using multiple free methods.
    """
    
    if not student_text or len(student_text.strip()) < 50:
        return {
            'is_plagiarized': False,
            'overall_score': 0.0,
            'matches': [],
            'details': 'Text too short to analyze'
        }
    
    matches = []
    
    # 1. Check against other students
    print("[PLAGIARISM] Checking against other submissions...")
    for comp in comparison_texts:
        similarity = calculate_similarity(student_text, comp['text'])
        
        if similarity > MODERATE_THRESHOLD:
            matched_segments = find_matching_segments(student_text, comp['text'])
            matches.append({
                'source': comp.get('student_name', comp.get('source', 'Unknown')),
                'similarity': round(similarity, 3),
                'matched_text': matched_segments[0] if matched_segments else '',
                'type': 'student'
            })
            print(f"  ⚠️ High similarity with {comp.get('student_name')}: {similarity:.1%}")
    
    # 2. Check web sources using FREE APIs
    if check_web:
        print("[PLAGIARISM] Checking web sources...")
        
        # Try DuckDuckGo first (completely free, no API key)
        ddg_matches = check_with_duckduckgo(student_text)
        matches.extend(ddg_matches)
        
        # Check academic papers via CrossRef (completely free)
        academic_matches = check_with_crossref(student_text)
        matches.extend(academic_matches)
    
    # 3. Calculate overall plagiarism score
    if not matches:
        overall_score = 0.0
        is_plagiarized = False
        details = "No significant plagiarism detected."
    else:
        overall_score = max(m['similarity'] for m in matches)
        is_plagiarized = overall_score > PLAGIARISM_THRESHOLD
        
        if is_plagiarized:
            details = f"High plagiarism detected ({overall_score:.1%} similarity). Found {len(matches)} potential source(s)."
        else:
            details = f"Moderate similarity detected ({overall_score:.1%}). May need manual review."
    
    return {
        'is_plagiarized': is_plagiarized,
        'overall_score': round(overall_score, 3),
        'matches': sorted(matches, key=lambda x: x['similarity'], reverse=True)[:10],  # Top 10
        'details': details
    }


def calculate_similarity(text1: str, text2: str) -> float:
    """
    Calculate similarity using multiple algorithms (unchanged but optimized).
    """
    if not text1 or not text2:
        return 0.0
    
    # Method 1: TF-IDF Cosine Similarity
    try:
        vectorizer = TfidfVectorizer(stop_words='english', min_df=1, max_features=500)
        tfidf_matrix = vectorizer.fit_transform([text1, text2])
        cosine_sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    except:
        cosine_sim = 0.0
    
    # Method 2: Sequence Matcher (faster for long texts)
    sequence_sim = SequenceMatcher(None, text1.lower()[:1000], text2.lower()[:1000]).ratio()
    
    # Method 3: N-gram overlap
    ngram_sim = calculate_ngram_similarity(text1, text2, n=3)
    
    # Weighted average
    similarity = (0.5 * cosine_sim) + (0.3 * sequence_sim) + (0.2 * ngram_sim)
    
    return min(similarity, 1.0)


def calculate_ngram_similarity(text1: str, text2: str, n: int = 3) -> float:
    """Calculate n-gram similarity (unchanged)"""
    def get_ngrams(text, n):
        words = text.lower().split()
        return set(' '.join(words[i:i+n]) for i in range(len(words)-n+1))
    
    ngrams1 = get_ngrams(text1, n)
    ngrams2 = get_ngrams(text2, n)
    
    if not ngrams1 or not ngrams2:
        return 0.0
    
    intersection = len(ngrams1 & ngrams2)
    union = len(ngrams1 | ngrams2)
    
    return intersection / union if union > 0 else 0.0


def find_matching_segments(text1: str, text2: str, min_length: int = 50) -> List[str]:
    """Find matching segments (unchanged)"""
    matcher = SequenceMatcher(None, text1, text2)
    matches = []
    
    for match in matcher.get_matching_blocks():
        if match.size >= min_length:
            segment = text1[match.a:match.a + match.size]
            matches.append(segment.strip())
    
    return matches


def check_with_duckduckgo(text: str, max_queries: int = 3) -> List[Dict]:
    """
    Check using DuckDuckGo Search (completely FREE, no API key needed)
    Uses duckduckgo-search Python library
    """
    try:
        from ddgs import DDGS
        
        matches = []
        
        # Extract key phrases
        sentences = re.split(r'[.!?]+', text)
        search_queries = [s.strip() for s in sentences[:max_queries] if len(s.strip()) > 30]
        
        ddgs = DDGS()
        
        for query in search_queries[:max_queries]:
            try:
                # Search with DuckDuckGo
                results = ddgs.text(query[:200], max_results=3)
                
                for result in results:
                    snippet = result.get('body', '')
                    title = result.get('title', 'Web Source')
                    url = result.get('href', '')
                    
                    # Calculate similarity
                    similarity = calculate_similarity(query, snippet)
                    
                    if similarity > 0.6:
                        matches.append({
                            'source': title,
                            'similarity': round(similarity, 3),
                            'matched_text': snippet[:200],
                            'type': 'web',
                            'url': url
                        })
                        print(f"  ⚠️ Found on web (DDG): {title} ({similarity:.1%})")
                
                time.sleep(1)  # Rate limiting
                
            except Exception as e:
                print(f"[DDG] Query error: {e}")
                continue
        
        return matches
        
    except ImportError:
        print("[DDG] duckduckgo-search not installed. Install: pip install duckduckgo-search")
        return []
    except Exception as e:
        print(f"[DDG] Error: {e}")
        return []



def check_with_crossref(text: str, max_queries: int = 2) -> List[Dict]:
    """
    Check against academic papers using CrossRef API (completely FREE)
    Great for detecting plagiarism from published research
    """
    try:
        matches = []
        
        # Extract key academic phrases (longer sentences)
        sentences = re.split(r'[.!?]+', text)
        search_queries = [s.strip() for s in sentences if len(s.strip()) > 50][:max_queries]
        
        for query in search_queries:
            try:
                url = "https://api.crossref.org/works"
                params = {
                    "query": query[:500],
                    "rows": 3
                }
                headers = {
                    "User-Agent": "EvaloAI-Plagiarism-Checker/1.0 (mailto:contact@evaloai.com)"
                }
                
                response = requests.get(url, params=params, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    for item in data.get('message', {}).get('items', []):
                        title = item.get('title', ['Unknown'])[0] if item.get('title') else 'Unknown'
                        abstract = item.get('abstract', '')
                        doi = item.get('DOI', '')
                        authors = item.get('author', [])
                        author_names = ', '.join([f"{a.get('given', '')} {a.get('family', '')}" 
                                                 for a in authors[:2]])
                        
                        # Check similarity with title and abstract
                        check_text = f"{title} {abstract}"
                        similarity = calculate_similarity(query, check_text)
                        
                        if similarity > 0.5:  # Lower threshold for academic sources
                            matches.append({
                                'source': f"{title} ({author_names})",
                                'similarity': round(similarity, 3),
                                'matched_text': abstract[:200] if abstract else title[:200],
                                'type': 'academic',
                                'url': f"https://doi.org/{doi}" if doi else ''
                            })
                            print(f"  ⚠️ Found in academic paper: {title[:50]}... ({similarity:.1%})")
                
                time.sleep(1)  # Rate limiting
                
            except Exception as e:
                print(f"[CROSSREF] Query error: {e}")
                continue
        
        return matches
        
    except Exception as e:
        print(f"[CROSSREF] Error: {e}")
        return []



def generate_plagiarism_report(result: Dict) -> str:
    """Generate human-readable report (enhanced)"""
    
    report = []
    report.append("="*60)
    report.append("PLAGIARISM CHECK REPORT")
    report.append("="*60)
    
    if result['is_plagiarized']:
        report.append(f"⚠️ STATUS: PLAGIARISM DETECTED")
        report.append(f"Overall Similarity Score: {result['overall_score']:.1%}")
    else:
        report.append(f"✅ STATUS: ORIGINAL WORK")
        report.append(f"Overall Similarity Score: {result['overall_score']:.1%}")
    
    report.append("")
    report.append(result['details'])
    report.append("")
    
    if result['matches']:
        # Group by type
        student_matches = [m for m in result['matches'] if m['type'] == 'student']
        web_matches = [m for m in result['matches'] if m['type'] == 'web']
        academic_matches = [m for m in result['matches'] if m['type'] == 'academic']
        
        if student_matches:
            report.append("📄 Matches with Other Students:")
            report.append("-"*60)
            for i, match in enumerate(student_matches, 1):
                report.append(f"{i}. {match['source']}: {match['similarity']:.1%} similar")
                if match.get('matched_text'):
                    preview = match['matched_text'][:100]
                    report.append(f"   \"{preview}...\"")
                report.append("")
        
        if web_matches:
            report.append("🌐 Matches with Web Sources:")
            report.append("-"*60)
            for i, match in enumerate(web_matches, 1):
                report.append(f"{i}. {match['source']}: {match['similarity']:.1%} similar")
                if match.get('url'):
                    report.append(f"   URL: {match['url']}")
                if match.get('matched_text'):
                    preview = match['matched_text'][:100]
                    report.append(f"   \"{preview}...\"")
                report.append("")
        
        if academic_matches:
            report.append("🎓 Matches with Academic Papers:")
            report.append("-"*60)
            for i, match in enumerate(academic_matches, 1):
                report.append(f"{i}. {match['source']}: {match['similarity']:.1%} similar")
                if match.get('url'):
                    report.append(f"   DOI: {match['url']}")
                report.append("")
    
    report.append("="*60)
    
    return "\n".join(report)


if __name__ == "__main__":
    # Test plagiarism checker
    original = """Photosynthesis is the process by which plants convert sunlight into energy. 
    This remarkable biological mechanism involves chloroplasts absorbing light energy and transforming 
    it into chemical energy stored in glucose molecules."""
    
    copied = """Photosynthesis is the process where plants convert sunlight into energy. 
    This remarkable biological mechanism involves chloroplasts absorbing light energy and transforming 
    it into chemical energy stored in glucose molecules."""
    
    print("Test: Plagiarism Detection")
    result = check_plagiarism(
        original, 
        [{'text': copied, 'student_name': 'Student B'}],
        check_web=True
    )
    print(generate_plagiarism_report(result))