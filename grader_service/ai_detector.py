"""
Enhanced AI Content Detection Module
Uses multiple FREE detection methods and APIs:
1. Local heuristics (perplexity, burstiness, patterns)
2. HuggingFace RoBERTa AI Detector (FREE)
3. Sapling AI Detector API (FREE tier: 100 requests/day)
4. Writer.com AI Detector (FREE)
"""

import os
import re
import math
import statistics
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv

load_dotenv()

# AI Detection Thresholds
AI_THRESHOLD = 0.70  # 70% confidence = AI-generated

# Common AI writing patterns (expanded)
AI_PHRASES = [
    "it is important to note", "it's worth noting", "delve into",
    "in today's digital age", "in conclusion", "furthermore",
    "moreover", "additionally", "in summary", "to summarize",
    "as an AI language model", "I don't have personal",
    "I cannot provide", "it's important to understand",
    "in the realm of", "dive deep into", "explore the nuances",
    "multifaceted", "paradigm shift", "leverage", "utilize",
    "encompasses", "facilitate", "implement", "optimize",
    "revolutionize", "cutting-edge", "state-of-the-art",
    "it's crucial to", "one must consider", "bear in mind",
    "take into account", "plays a pivotal role", "cannot be overstated"
]


def detect_ai_content(text: str, use_api: bool = True) -> Dict:
    """
    Detect if text is AI-generated using multiple free methods.
    """
    
    if not text or len(text.strip()) < 100:
        return {
            'is_ai_generated': False,
            'confidence': 0.0,
            'ai_probability': 0.0,
            'details': {},
            'explanation': 'Text too short to analyze',
            'recommendation': 'Submit longer text for AI detection'
        }
    
    print("[AI DETECTION] Analyzing text...")
    
    # Method 1: Local heuristic analysis (free, fast)
    local_result = analyze_local_patterns(text)
    
    # Method 2: HuggingFace RoBERTa (free, accurate)
    hf_result = None
    if use_api:
        hf_result = check_with_huggingface(text)
    
    # Method 3: Sapling AI (free tier)
    sapling_result = None
    if use_api and os.getenv('SAPLING_API_KEY'):
        sapling_result = check_with_sapling(text)
    
    
    
    # Combine results with weighted average
    results = [local_result]
    weights = [0.1]  # Local gets 30%
    
    if hf_result:
        results.append(hf_result)
        weights.append(0.01)  # HuggingFace gets 40% (most reliable)
    
    if sapling_result:
        results.append(sapling_result)
        weights.append(0.89)
    
    
    
    # Normalize weights
    total_weight = sum(weights)
    weights = [w/total_weight for w in weights]
    
    # Calculate weighted average
    ai_probability = sum(r['ai_probability'] * w for r, w in zip(results, weights))
    confidence = max(r['confidence'] for r in results)
    
    is_ai_generated = ai_probability > AI_THRESHOLD
    
    # Generate explanation
    explanation = generate_explanation(
        local_result, 
        hf_result, 
        sapling_result,  
        ai_probability
    )
    
    # Recommendation
    if is_ai_generated:
        recommendation = "⚠️ High likelihood of AI-generated content. Recommend manual review or resubmission."
    elif ai_probability > 0.5:
        recommendation = "⚠️ Moderate AI signals detected. Consider follow-up interview or oral exam."
    else:
        recommendation = "✅ Appears to be human-written."
    
    return {
        'is_ai_generated': is_ai_generated,
        'confidence': round(confidence, 3),
        'ai_probability': round(ai_probability, 3),
        'details': {
            **local_result['details'],
            'huggingface_score': hf_result['ai_probability'] if hf_result else None,
            'sapling_score': sapling_result['ai_probability'] if sapling_result else None,
        },
        'explanation': explanation,
        'recommendation': recommendation
    }


def analyze_local_patterns(text: str) -> Dict:
    """Local heuristic analysis"""
    
    perplexity_score = calculate_perplexity(text)
    burstiness_score = calculate_burstiness(text)
    pattern_score = check_ai_patterns(text)
    uniformity_score = calculate_sentence_uniformity(text)
    
    ai_probability = (
        (1 - perplexity_score) * 0.25 +
        (1 - burstiness_score) * 0.25 +
        pattern_score * 0.30 +
        uniformity_score * 0.20
    )
    
    word_count = len(text.split())
    confidence = 0.3 if word_count < 100 else 0.6 if word_count < 300 else 0.8
    
    return {
        'ai_probability': ai_probability,
        'confidence': confidence,
        'details': {
            'perplexity_score': round(perplexity_score, 3),
            'burstiness_score': round(burstiness_score, 3),
            'pattern_score': round(pattern_score, 3),
            'sentence_uniformity': round(uniformity_score, 3)
        }
    }


def check_with_huggingface(text: str) -> Optional[Dict]:
    """
    Use HuggingFace RoBERTa AI Detector (FREE, no API key needed)
    Model: Hello-SimpleAI/chatgpt-detector-roberta
    """
    try:
        # Try multiple model endpoints (in order of reliability)
        model_urls = [
            "https://api-inference.huggingface.co/models/Hello-SimpleAI/chatgpt-detector-roberta",
            "https://api-inference.huggingface.co/models/roberta-large-openai-detector",
            "https://api-inference.huggingface.co/models/openai-community/roberta-base-openai-detector"
        ]
        
        # Truncate text to first 512 tokens (~380 words) due to model limits
        words = text.split()[:380]
        truncated_text = ' '.join(words)
        
        payload = {"inputs": truncated_text}
        
        # Try each model until one works
        for API_URL in model_urls:
            try:
                response = requests.post(API_URL, json=payload, timeout=30)
                if response.status_code == 200:
                    break
                elif response.status_code == 503:
                    # Model loading, try next
                    continue
                elif response.status_code == 410:
                    # Model deprecated, try next
                    continue
            except:
                continue
        else:
            # All models failed
            print("[AI DETECTION] All HuggingFace models unavailable, using local analysis only...")
            return None
        
        if response.status_code == 200:
            result = response.json()
            
            # Result format: [{'label': 'Real', 'score': 0.9}, {'label': 'Fake', 'score': 0.1}]
            if isinstance(result, list) and len(result) > 0:
                # Handle different response formats
                ai_score = 0.0
                
                if isinstance(result[0], list):
                    result = result[0]
                
                for item in result:
                    label = item.get('label', '').lower()
                    # Look for AI/Fake labels
                    if 'fake' in label or 'ai' in label or 'generated' in label or 'gpt' in label:
                        ai_score = item['score']
                        break
                    # Or inverse of Real/Human labels
                    elif 'real' in label or 'human' in label:
                        ai_score = 1.0 - item['score']
                        break
                
                print(f"[AI DETECTION] HuggingFace result: {ai_score:.1%} AI probability")
                
                return {
                    'ai_probability': ai_score,
                    'confidence': 0.85,
                    'api_source': 'HuggingFace RoBERTa'
                }
        
        print(f"[AI DETECTION] HuggingFace API error: {response.status_code}")
        return None
            
    except Exception as e:
        print(f"[AI DETECTION] HuggingFace error: {e}")
        return None


def check_with_sapling(text: str, api_key: str = None) -> Optional[Dict]:
    """
    Use Sapling AI Content Detector
    FREE tier: 100 requests/day
    Sign up at: https://sapling.ai/api
    """
    try:
        api_key = api_key or os.getenv('SAPLING_API_KEY')
        if not api_key:
            return None
        
        url = "https://api.sapling.ai/api/v1/aidetect"
        
        payload = {
            "key": api_key,
            "text": text[:2000]  # Limit to 2000 chars
        }
        
        response = requests.post(url, json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            # Sapling returns {"score": 0.85} where higher = more likely AI
            ai_probability = data.get('score', 0.0)
            
            print(f"[AI DETECTION] Sapling result: {ai_probability:.1%} AI probability")
            
            return {
                'ai_probability': ai_probability,
                'confidence': 0.8,
                'api_source': 'Sapling AI'
            }
        else:
            print(f"[AI DETECTION] Sapling API error: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"[AI DETECTION] Sapling error: {e}")
        return None





def calculate_perplexity(text: str) -> float:
    """Calculate perplexity"""
    words = text.lower().split()
    if len(words) < 10:
        return 0.5
    
    bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words)-1)]
    unique_bigrams = len(set(bigrams))
    total_bigrams = len(bigrams)
    
    diversity_ratio = unique_bigrams / total_bigrams if total_bigrams > 0 else 0
    return diversity_ratio


def calculate_burstiness(text: str) -> float:
    """Calculate burstiness"""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if len(sentences) < 3:
        return 0.5
    
    lengths = [len(s.split()) for s in sentences]
    
    if not lengths:
        return 0.5
    
    mean_length = statistics.mean(lengths)
    if mean_length == 0:
        return 0.5
    
    try:
        std_dev = statistics.stdev(lengths)
        cv = std_dev / mean_length
    except:
        cv = 0.0
    
    burstiness = min(cv / 0.5, 1.0)
    return burstiness


def check_ai_patterns(text: str) -> float:
    """Check for AI patterns"""
    text_lower = text.lower()
    matches = 0
    
    for phrase in AI_PHRASES:
        if phrase in text_lower:
            matches += 1
    
    words = len(text.split())
    pattern_density = matches / (words / 100) if words > 0 else 0
    
    return min(pattern_density / 5, 1.0)


def calculate_sentence_uniformity(text: str) -> float:
    """Calculate sentence uniformity"""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
    
    if len(sentences) < 3:
        return 0.5
    
    starters = [s.split()[0].lower() for s in sentences if s.split()]
    unique_starters = len(set(starters))
    total_starters = len(starters)
    
    uniformity = 1 - (unique_starters / total_starters if total_starters > 0 else 0)
    return uniformity


def generate_explanation(
    local_result: Dict, 
    hf_result: Optional[Dict], 
    sapling_result: Optional[Dict],  
    final_probability: float
) -> str:
    """Generate explanation"""
    
    explanation = []
    
    if final_probability > 0.7:
        explanation.append("🤖 HIGHLY LIKELY AI-GENERATED:")
    elif final_probability > 0.5:
        explanation.append("⚠️ POSSIBLY AI-GENERATED:")
    else:
        explanation.append("✅ LIKELY HUMAN-WRITTEN:")
    
    details = local_result['details']
    
    if details['pattern_score'] > 0.5:
        explanation.append("  - Multiple AI-typical phrases detected")
    
    if details['burstiness_score'] < 0.3:
        explanation.append("  - Sentence lengths are suspiciously uniform")
    
    if details['perplexity_score'] < 0.3:
        explanation.append("  - Text is highly predictable (low perplexity)")
    
    if details['sentence_uniformity'] > 0.6:
        explanation.append("  - Repetitive sentence structures")
    
    if hf_result:
        explanation.append(f"  - HuggingFace RoBERTa: {hf_result['ai_probability']:.1%} AI")
    
    if sapling_result:
        explanation.append(f"  - Sapling AI: {sapling_result['ai_probability']:.1%} AI")
    
    
    return "\n".join(explanation)


def generate_ai_report(result: Dict) -> str:
    """Generate report"""
    
    report = []
    report.append("="*60)
    report.append("AI CONTENT DETECTION REPORT")
    report.append("="*60)
    
    if result['is_ai_generated']:
        report.append(f"🤖 STATUS: AI-GENERATED CONTENT DETECTED")
    else:
        report.append(f"✅ STATUS: LIKELY HUMAN-WRITTEN")
    
    report.append(f"AI Probability: {result['ai_probability']:.1%}")
    report.append(f"Confidence: {result['confidence']:.1%}")
    report.append("")
    
    report.append("Analysis Details:")
    report.append("-"*60)
    for key, value in result['details'].items():
        if value is not None:
            label = key.replace('_', ' ').title()
            if isinstance(value, float):
                report.append(f"  {label}: {value:.3f}")
            else:
                report.append(f"  {label}: {value}")
    
    report.append("")
    report.append(result['explanation'])
    report.append("")
    report.append("Recommendation:")
    report.append(result['recommendation'])
    report.append("="*60)
    
    return "\n".join(report)


if __name__ == "__main__":
    # Test with AI-like text
    ai_text = """
    It is important to note that machine learning has become increasingly significant in today's digital age. 
    Furthermore, the applications of AI are multifaceted and continue to evolve. Additionally, it's worth noting 
    that these technologies represent a paradigm shift in how we approach problem-solving.
    """
    
    print("Test 1: AI-like text")
    result = detect_ai_content(ai_text, use_api=True)
    print(generate_ai_report(result))