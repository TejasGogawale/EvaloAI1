import os
import re
import nltk
import language_tool_python
from keyword_gen import naive_keywords

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# Suppress BERT model warnings (they're harmless)
import warnings
warnings.filterwarnings('ignore', message='Some weights of.*were not initialized')

from bert_score import score as bert_score

# Only import genai if available
try:
    from google import genai 
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    print("Warning: google-generativeai not installed. AI features will be disabled.")

# --- NLTK Downloads and Initialization ---
try:
    from nltk.corpus import wordnet
    wordnet.synsets('example') 
except LookupError:
    nltk.download('wordnet')
    nltk.download('omw-1.4')

tool = language_tool_python.LanguageTool('en-US')

# --- Gemini API Client Setup ---
gemini_client = None
GEMINI_ENABLED = False

if GENAI_AVAILABLE:
    try:
        # Check if API key is set
        api_key = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
        if api_key:
            gemini_client = genai.Client(api_key=api_key)
            GEMINI_ENABLED = True
            print("✅ Gemini API Client initialized successfully. AI features enabled.")
        else:
            print("⚠️  Warning: GEMINI_API_KEY not found in environment. AI features disabled.")
            print("   Set GEMINI_API_KEY in your .env file to enable AI-powered feedback.")
    except Exception as e:
        GEMINI_ENABLED = False
        print(f"⚠️  Warning: Gemini API Client could not be initialized. AI features disabled. Error: {e}")
else:
    print("⚠️  google-generativeai package not installed. AI features disabled.")


# --- CORE GRADING HELPERS ---

def get_synonyms(word):
    syns = set()
    for syn in wordnet.synsets(word):
        for lemma in syn.lemmas():
            syns.add(lemma.name().lower().replace('_',' '))
    return syns

def keyword_matches(student_kw, teacher_kw_list):
    matched = []
    for tk in teacher_kw_list:
        tk_words = tk.split()
        for sw in student_kw:
            sw_words = sw.split()
            
            if any(w in tk_words or w in get_synonyms(tk_word) for w in sw_words for tk_word in tk_words):
                matched.append(tk)
                break
    return matched

def normalize_bert_f1(bert_f1: float, low: float = 0.15, high: float = 0.40) -> float:
    """
    Normalize raw BERT F1 into [0, 1] using a piecewise-linear transform.

    - bert_f1 <= low  -> 0.0
    - bert_f1 >= high -> 1.0
    - otherwise       -> (bert_f1 - low) / (high - low)
    """
    if bert_f1 <= low:
        return 0.0
    if bert_f1 >= high:
        return 1.0
    return (bert_f1 - low) / (high - low)


def get_phrase_overlap(ref, hyp):
    if not ref.strip() or not hyp.strip():
        return 0.0
    ref_phrases = set(re.findall(r'\b\w+\b', ref.lower()))
    hyp_phrases = set(re.findall(r'\b\w+\b', hyp.lower()))
    if not ref_phrases:
        return 0.0
    found = ref_phrases.intersection(hyp_phrases)
    return len(found) / len(ref_phrases)

def get_grammar_score(text):
    matches = tool.check(text)
    errors = len(matches)
    return max(0, 1 - errors/10)

def get_bert_score(ref, hyp):
    if not ref.strip() or not hyp.strip():
        return 0.0
    P, R, F1 = bert_score([hyp], [ref], lang="en", rescale_with_baseline=True)
    return float(F1.mean())

# --- NEW: Direct Match Utility ---
def simple_match_score(teacher_answer: str, student_answer: str) -> float:
    """
    Performs direct, case-insensitive, whitespace-stripped comparison.
    Returns 1.0 for a match, 0.0 otherwise.
    """
    teacher_norm = teacher_answer.strip().lower()
    student_norm = student_answer.strip().lower()
    
    if teacher_norm == student_norm:
        return 1.0
        
    # Check for True/False variations
    if teacher_norm in ['true', 't'] and student_norm in ['true', 't', 'correct', 'y', 'yes']:
        return 1.0
    if teacher_norm in ['false', 'f'] and student_norm in ['false', 'f', 'incorrect', 'n', 'no']:
        return 1.0
        
    return 0.0


# --- FAST QUESTION CLASSIFIER ---

def classify_question_type_fast(question: str) -> str:
    """
    Classifies the question type instantly using regular expressions and string analysis.
    Returns one of the six defined types.
    """
    q_lower = question.lower()

    # 1. TRUE_OR_FALSE Check
    tf_keywords = ["true or false", "state t/f", "(t/f)", "correct or incorrect"]
    if any(keyword in q_lower for keyword in tf_keywords):
        return 'TRUE_OR_FALSE'

    # 2. MATCH_THE_FOLLOWING Check (Prioritized)
    match_keywords = ["match column", "pair the following", "connect the following", "match the following"]
    if any(keyword in q_lower for keyword in match_keywords):
        return 'MATCH_THE_FOLLOWING'

    # 3. FILL_IN_BLANK Check
    fitb_pattern = r"(\_{2,}|\.\.\.|\s*\[\s*blank\s*\]\s*)"
    if re.search(fitb_pattern, q_lower):
        return 'FILL_IN_BLANK'

    # 4. ONE_WORD_ANSWER Check
    one_word_keywords = ["one word", "single word", "in a word", "name the"]
    if any(keyword in q_lower for keyword in one_word_keywords):
        return 'ONE_WORD_ANSWER'

    # 5. SHORT_ANSWER Check
    short_answer_keywords = ["list", "state", "define", "name two", "give example", "what are"]
    if any(q_lower.startswith(f"{kw}") for kw in short_answer_keywords):
        return 'SHORT_ANSWER'
        
    # 6. LONG_ANSWER (Default/Catch-all)
    return 'LONG_ANSWER'


# --- GEMINI AI FUNCTIONS ---
def get_gemini_keywords(gemini_client, text: str) -> list:
    """Uses Gemini to extract accurate, context-relevant keywords."""
    if not GEMINI_ENABLED or not gemini_client:
        return []
        
    keyword_prompt = f"""
    Extract 2-4 core conceptual keywords (not details) that best represent the main ideas of the following text. Return only a comma-separated keyword list:

    Text to analyze: "{text}"
"""

    try:
        response = gemini_client.models.generate_content(
            model='models/gemini-1.5-flash',
            contents=keyword_prompt
        )
        keywords_str = response.text.strip()
        keywords = [kw.strip().lower() for kw in keywords_str.split(',') if kw.strip()]
        return keywords
    except Exception as e:
        print(f"[GEMINI] Error extracting keywords: {e}")
        return []


def get_overall_summary(gemini_client, overall_performance_data: list, final_total: float, max_total: float) -> str:
    """Generates an overall improvement summary for all answers."""
    if not GEMINI_ENABLED or not gemini_client: 
        return ""
    
    summary_prompt = f"""
    Generate micro-feedback for a teacher dashboard.

    Student score: {final_total:.2f}/{max_total}
    Performance: {overall_performance_data}

    Output exactly two short lines:
    1) Strength (max 8-10 words)
    2) Improvement suggestion (max 8-10 words)

    No extra text.
    """
    
    try:
        response = gemini_client.models.generate_content(
            model='models/gemini-1.5-flash',
            contents=summary_prompt
        )
        return response.text.strip()
    except Exception as e:
        print(f"[GEMINI] Error giving feedback: {e}")
        return ""

# --- MAIN EVALUATION FUNCTION ---

def evaluate_answers(aligned):
    global GEMINI_ENABLED, gemini_client 
    report = []
    final_total = 0
    max_total = 0
    overall_performance_data = [] 

    # Define groups for grading complexity
    WORD_MATCH_TYPES = ['TRUE_OR_FALSE', 'ONE_WORD_ANSWER', 'FILL_IN_BLANK', 'MATCH_THE_FOLLOWING']
    COMPREHENSIVE_TYPES = ['SHORT_ANSWER', 'LONG_ANSWER']

    for qid, q, teacher, student, weight in aligned:
        report.append(f"==============================")
        report.append(f"{qid} ({weight} marks): {q}")
        
        # 1. CLASSIFY QUESTION TYPE
        q_type = classify_question_type_fast(q)

# If the question text is too generic (like "Q1"), try to infer from the teacher answer
        if q_type == 'LONG_ANSWER':
            q_clean = q.lower().strip()
            if q_clean in ['q1', 'q2', 'question 1', 'question 2'] or len(q_clean) < 10:
        # Use teacher answer as a hint
                t_low = teacher.strip().lower()

        # True/False style?
                if t_low in ['true', 'false', 't', 'f', 'yes', 'no']:
                    q_type = 'TRUE_OR_FALSE'
        # Very short answer?
                elif len(t_low.split()) <= 3:
                    q_type = 'ONE_WORD_ANSWER'
        # Fill in the blanks – if teacher answer looks like a phrase and student is short
        # you can leave this as LONG_ANSWER or treat separately if needed
        
        # ----- FIX QUESTION TYPE USING TEACHER ANSWER -----

# A long teacher answer means it's definitely NOT one-word or true/false
        teacher_len = len(teacher.split())

        if teacher_len > 8:          # threshold works extremely well
            q_type = "LONG_ANSWER"

        elif 3 < teacher_len <= 8:
            q_type = "SHORT_ANSWER"

# Only if teacher answer is truly tiny (< 3 words) keep ONE_WORD_ANSWER
# Otherwise your earlier classifier is allowed


        report.append(f"Question Type Detected: {q_type} (Fast Analysis)")
        report.append("------------------------------")
        
        # Initialize variables
        phrase_marks = 0.0
        grammar_marks = 0.0
        missing = []
        
        # --- 2. CONDITIONAL GRADING LOGIC ---
        
        if q_type in WORD_MATCH_TYPES:
            # Grading Scheme: Direct String Match (100% Match/No Match)
            report.append(f" Grading Scheme: {q_type} (Direct Match)")
            
            match_score = simple_match_score(teacher, student)
            total = round(match_score * weight, 2)
            
            # Log results
            result_label = "MATCH" if match_score == 1.0 else "NO MATCH"
            report.append(f" RESULT: {result_label}")
            report.append(f" Total: {total:.2f}/{weight}\n")
            
            score_breakdown = {'keyword_marks': 0.0, 'grammar_marks': 0.0, 'bert_marks': 0.0, 'overall_score': total, 'weight': weight}
            missing = []

        elif q_type in COMPREHENSIVE_TYPES:
            report.append(f" Grading Scheme: {q_type} (Comprehensive, BERT/AI Feedback)")

            phrase_overlap = get_phrase_overlap(teacher, student)
            grammar_score = get_grammar_score(student)
            bert_f1 = get_bert_score(teacher, student)

    # --- choose weights based on Gemini availability ---
            if GEMINI_ENABLED and gemini_client:
                w_bert = 0.40
                w_kw   = 0.30
                w_phrase = 0.20
                w_grammar = 0.10

                teacher_keywords = get_gemini_keywords(gemini_client, teacher)
                student_keywords = get_gemini_keywords(gemini_client, student)
            else:
        # No Gemini ⇒ skip keywords, upweight BERT & phrase
                w_bert = 0.40
                w_kw   = 0.30
                w_phrase = 0.20
                w_grammar = 0.10

                teacher_keywords = naive_keywords(teacher)
                student_keywords = naive_keywords(student)


    # --- keyword scoring (only if we actually have teacher_keywords) ---
            if teacher_keywords:
                teacher_keyword_count = len(teacher_keywords)
                found = keyword_matches(student_keywords, teacher_keywords)
                missing = [k for k in teacher_keywords if k not in found]
                keyword_score_raw = len(found) / teacher_keyword_count
                keyword_marks = round(keyword_score_raw * (w_kw * weight), 2)
            else:
                teacher_keyword_count = 1
                found = []
                missing = []
                keyword_score_raw = 0.0
                keyword_marks = 0.0

    # --- other components ---
            phrase_marks  = round(phrase_overlap * (w_phrase * weight), 2)

    # soften grammar penalty: floor at 0.4 so long answers aren't killed
            if q_type in ["SHORT_ANSWER", "LONG_ANSWER"]:
                grammar_score = max(grammar_score, 0.4)

            grammar_marks = round(grammar_score * (w_grammar * weight), 2)

            bert_f1_raw = get_bert_score(teacher, student)
            bert_f1     = normalize_bert_f1(bert_f1_raw)  # scaled 0–1
            bert_marks  = round(bert_f1 * (w_bert * weight), 2)

            total = phrase_marks + keyword_marks + grammar_marks + bert_marks

            report.append(f" Phrase Overlap: {phrase_overlap:.2f} -> {phrase_marks}/{w_phrase*weight}")
            report.append(f" Keywords Found (Count: {len(found)}/{teacher_keyword_count}): {keyword_marks}/{w_kw*weight}")
            report.append(f" Grammar Score: {grammar_score:.2f} -> {grammar_marks}/{w_grammar*weight}")
            report.append(
                f" BERTScore (F1 raw): {bert_f1_raw:.2f}, normalized: {bert_f1:.2f} "
                f"-> {bert_marks}/{w_bert*weight}"
            )
            report.append(f" Total: {total:.2f}/{weight}\n")

            score_breakdown = {
                'keyword_marks': keyword_marks,
                'grammar_marks': grammar_marks,
                'bert_marks': bert_marks,
                'overall_score': total,
                'weight': weight
            }


        # --- 3. FINAL TOTALING AND FEEDBACK ---
        final_total += total
        max_total += weight

        
        
        overall_performance_data.append({
            'qid': qid, 
            'total_score': total, 
            'weight': weight, 
            'missing_keywords': missing
        })
        
    # --- 4. FINAL REPORT SUMMARY ---
    
    report.append("==============================")
    report.append(f"FINAL SCORE: {final_total:.2f}/{max_total}")
    report.append("==============================")

    if GEMINI_ENABLED:
        overall_summary = get_overall_summary(gemini_client, overall_performance_data, final_total, max_total)
        report.append(overall_summary)

    return "\n".join(report)