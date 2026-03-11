import re

def split_questions(text: str):
    """
    Robust question splitter that handles various formats:
    - Q1. Answer
    - Q1: Answer
    - Q1) Answer
    - Question 1. Answer
    - Multi-line answers
    - Questions with sub-parts
    
    Returns list of complete question strings (including ID + content)
    """
    if not text:
        return []

    # Normalize line endings and whitespace
    text = re.sub(r"\r\n", "\n", text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = text.strip()
    
    # Pattern to match question starts:
    # Q1, Q2, Question 1, etc. with optional punctuation (. : ))
    question_pattern = r'^(Q(?:uestion)?\s*\d+[\.\:\)]?\s*)'
    
    # Split text into lines
    lines = text.split('\n')
    
    questions = []
    current_question = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check if line starts with a question marker
        if re.match(question_pattern, line, flags=re.IGNORECASE):
            # Save previous question if exists
            if current_question:
                full_q = ' '.join(current_question).strip()
                if full_q:
                    questions.append(full_q)
            # Start new question
            current_question = [line]
        else:
            # Continue current question (multi-line answer)
            if current_question:
                current_question.append(line)
            else:
                # Edge case: content before first question marker
                current_question = [line]
    
    # Don't forget the last question
    if current_question:
        full_q = ' '.join(current_question).strip()
        if full_q:
            questions.append(full_q)
    
    # Debug output
    print(f"[PARSE] Split into {len(questions)} questions:")
    for i, q in enumerate(questions):
        # Show first 80 chars
        preview = q[:80].replace('\n', ' ')
        print(f"  [{i+1}] {preview}{'...' if len(q) > 80 else ''}")
    
    return questions


def extract_weightage(question: str):
    """
    Extract marks/points from question text.
    Handles various formats:
    - (5 marks)
    - [10 points]
    - 5 marks
    - (5m)
    - worth 10 points
    """
    patterns = [
        r"\((\d+)\s*(?:marks?|points?|pts?)\)",           # (5 marks)
        r"\[(\d+)\s*(?:marks?|points?|pts?)\]",           # [5 marks]
        r"\b(\d+)\s*(?:marks?|points?|pts?)\b",           # 5 marks
        r"\((\d+)m\)",                                     # (5m)
        r"worth\s+(\d+)\s*(?:marks?|points?|pts?)?",     # worth 10 points
    ]
    
    for pattern in patterns:
        match = re.search(pattern, question, flags=re.IGNORECASE)
        if match:
            marks = int(match.group(1))
            return marks
    
    # Default: 10 marks per question
    return 10


def map_answers(questions, teacher_answers, student_answers):
    """
    Intelligently align questions with teacher and student answers.
    
    Handles three scenarios:
    1. Separate question sheet provided (questions list populated)
    2. Teacher/student files already include question IDs (Q1, Q2, etc.)
    3. Pure answer files without question markers
    """
    print(f"\n[MAP] Aligning questions with answers")
    print(f"[MAP] Questions: {len(questions)}")
    print(f"[MAP] Teacher answers: {len(teacher_answers)}")
    print(f"[MAP] Student answers: {len(student_answers)}")
    
    mapping = []
    
    # Determine maximum count
    max_count = max(len(questions), len(teacher_answers), len(student_answers))
    
    # Check if teacher/student answers already contain question IDs
    teacher_has_qids = any(re.match(r'^Q\d+', ans, re.IGNORECASE) for ans in teacher_answers if ans)
    student_has_qids = any(re.match(r'^Q\d+', ans, re.IGNORECASE) for ans in student_answers if ans)
    
    print(f"[MAP] Teacher answers contain Q-IDs: {teacher_has_qids}")
    print(f"[MAP] Student answers contain Q-IDs: {student_has_qids}")
    
    for i in range(max_count):
        # Generate question ID
        qid = f"Q{i+1}"
        
        # Get question text
        if i < len(questions):
            q_text = questions[i]
            # If question already has ID prefix, use it; otherwise add context
            if not re.match(r'^Q\d+', q_text, re.IGNORECASE):
                q_text = f"{qid}. {q_text}"
        else:
            q_text = f"{qid}"
        
        # Get teacher answer
        if i < len(teacher_answers):
            t_ans = teacher_answers[i]
            # If answer includes question ID, extract just the answer part
            if teacher_has_qids:
                # Remove the Q1., Q2: etc. prefix to get pure answer
                t_ans = re.sub(r'^Q\d+[\.\:\)]\s*', '', t_ans, flags=re.IGNORECASE)
        else:
            t_ans = ""
        
        # Get student answer
        if i < len(student_answers):
            s_ans = student_answers[i]
            # If answer includes question ID, extract just the answer part
            if student_has_qids:
                # Remove the Q1., Q2: etc. prefix to get pure answer
                s_ans = re.sub(r'^Q\d+[\.\:\)]\s*', '', s_ans, flags=re.IGNORECASE)
        else:
            s_ans = ""
        
        # Extract weightage from question text
        weight = extract_weightage(q_text)
        
        mapping.append((qid, q_text, t_ans, s_ans, weight))
        
        # Debug output
        t_preview = t_ans[:40] if t_ans else "(empty)"
        s_preview = s_ans[:40] if s_ans else "(empty)"
        print(f"[MAP] {qid}:")
        print(f"      Q: {q_text[:60]}...")
        print(f"      T: {t_preview}...")
        print(f"      S: {s_preview}...")
        print(f"      Weight: {weight}")
    
    return mapping