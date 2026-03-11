#!/usr/bin/env python3
"""
Test script to verify grading locally without FastAPI
Use this to debug grading issues
"""

from pathlib import Path
from pdf_utils import extract_text_from_file
from parse_utils import split_questions
from grading import evaluate_answers

def test_grading_local():
    """Test grading with local files"""
    
    print("="*60)
    print("LOCAL GRADING TEST")
    print("="*60)
    
    # File paths
    teacher_file = Path("C:\\Users\\immor\\Downloads\\T.docx")  # Your teacher sample
    student_file = Path("C:\\Users\\immor\\Downloads\\S.docx")  # Your student submission
    
    # Check if files exist
    if not teacher_file.exists():
        print(f"❌ Teacher file not found: {teacher_file}")
        return
    if not student_file.exists():
        print(f"❌ Student file not found: {student_file}")
        return
    
    print(f"✅ Teacher file: {teacher_file}")
    print(f"✅ Student file: {student_file}")
    print()
    
    # Extract text
    print("[STEP 1] Extracting text from files...")
    teacher_text = extract_text_from_file(teacher_file)
    student_text = extract_text_from_file(student_file)
    
    print(f"Teacher text length: {len(teacher_text)} characters")
    print(f"Student text length: {len(student_text)} characters")
    print()
    
    print("Teacher text preview:")
    print("-" * 60)
    print(teacher_text[:300])
    print("-" * 60)
    print()
    
    print("Student text preview:")
    print("-" * 60)
    print(student_text[:300])
    print("-" * 60)
    print()
    
    # Parse questions
    print("[STEP 2] Parsing questions and answers...")
    teacher_items = split_questions(teacher_text)
    student_items = split_questions(student_text)
    
    print(f"Found {len(teacher_items)} teacher items")
    print(f"Found {len(student_items)} student items")
    print()
    
    # Your files have format: "Q1. Answer"
    # So each item contains BOTH the question ID and the answer
    # We need to create proper aligned tuples
    
    print("[STEP 3] Creating aligned question-answer pairs...")
    aligned = []
    
    max_count = max(len(teacher_items), len(student_items))
    
    for i in range(max_count):
        qid = f"Q{i+1}"
        
        # Get full items (e.g., "Q1. False")
        t_item = teacher_items[i] if i < len(teacher_items) else ""
        s_item = student_items[i] if i < len(student_items) else ""
        
        # The question context is the full teacher item
        # This lets the classifier see "Q1. False" and detect it's TRUE_OR_FALSE
        question = t_item
        
        # The answers are also the full items
        # map_answers will strip the Q1. prefix automatically
        teacher_answer = t_item
        student_answer = s_item
        
        # Default weight
        weight = 20
        
        aligned.append((qid, question, teacher_answer, student_answer, weight))
        
        print(f"{qid}:")
        print(f"  Question: {question[:60]}...")
        print(f"  Teacher:  {teacher_answer[:60]}...")
        print(f"  Student:  {student_answer[:60]}...")
        print()
    
    # Grade
    print("[STEP 4] Running grading engine...")
    print("="*60)
    report = evaluate_answers(aligned)
    print("="*60)
    print()
    
    print("[RESULT] Grading Report:")
    print("="*60)
    print(report)
    print("="*60)
    
    # Extract final score from report
    import re
    match = re.search(r'FINAL SCORE:\s*([\d.]+)/([\d.]+)', report)
    if match:
        score = float(match.group(1))
        max_points = float(match.group(2))
        percentage = (score / max_points * 100) if max_points > 0 else 0
        print()
        print(f"✅ FINAL GRADE: {score}/{max_points} ({percentage:.1f}%)")
    else:
        print()
        print("⚠️  Could not extract final score from report")

if __name__ == "__main__":
    test_grading_local()