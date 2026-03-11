# grader_service/app.py
import os, tempfile, requests
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np

# Import your existing modules (unchanged)
from pdf_utils import extract_text_from_file
from parse_utils import split_questions, map_answers, extract_weightage
from grading import evaluate_answers

# Import ENHANCED modules for plagiarism and AI detection
try:
    from plagiarism_checker import check_plagiarism, generate_plagiarism_report
    PLAGIARISM_AVAILABLE = True
except ImportError:
    print("⚠️ Warning: enhanced_plagiarism_checker not found, using fallback")
    try:
        from plagiarism_checker import check_plagiarism, generate_plagiarism_report
        PLAGIARISM_AVAILABLE = True
    except ImportError:
        PLAGIARISM_AVAILABLE = False
        print("❌ Error: No plagiarism checker available")

try:
    from ai_detector import detect_ai_content, generate_ai_report
    AI_DETECTOR_AVAILABLE = True
except ImportError:
    print("⚠️ Warning: enhanced_ai_detector not found, using fallback")
    try:
        from ai_detector import detect_ai_content, generate_ai_report
        AI_DETECTOR_AVAILABLE = True
    except ImportError:
        AI_DETECTOR_AVAILABLE = False
        print("❌ Error: No AI detector available")

def convert_numpy_types(obj):
    """Recursively convert numpy types to native Python types for JSON serialization"""
    if isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

app = FastAPI(title="EvaloAI Grader v3.0")

class GradeRequest(BaseModel):
    assignment_id: str
    max_points: int
    teacher_file_url: str
    student_file_url: str
    question_text: Optional[str] = None
    # NEW: Optional fields for integrity checks
    check_plagiarism: Optional[bool] = False
    check_ai: Optional[bool] = False
    use_api: Optional[bool] = True  # Use APIs for better accuracy
    comparison_file_url: Optional[str] = None  # Single file (for testing)
    comparison_urls: Optional[List[dict]] = None  # Multiple files (real scenario)

class GradePart(BaseModel):
    qid: str
    weight: int
    similarity: float
    points: float

class GradeResponse(BaseModel):
    assignment_id: str
    total_points: float
    parts: List[GradePart]
    rubric: str
    detailed_report: str
    # NEW: Integrity check results
    plagiarism_result: Optional[dict] = None
    ai_detection_result: Optional[dict] = None
    final_approved: bool = True
    integrity_flags: List[str] = []
    # NEW: Feature availability status
    features_used: dict = {}

def _download(url: str) -> Path:
    """Download file from URL to temp location, preserving file extension"""
    try:
        url_path = url.split('?')[0]
        filename = url_path.split('/')[-1]
        ext = Path(filename).suffix or '.bin'
        
        print(f"[DOWNLOAD] Fetching: {url[:80]}...")
        print(f"[DOWNLOAD] Detected extension: {ext}")
        
        fd, fname = tempfile.mkstemp(suffix=ext)
        os.close(fd)
        
        r = requests.get(url, timeout=120)
        print(f"[DOWNLOAD] Response status: {r.status_code}")
        r.raise_for_status()
        file_size = len(r.content)
        print(f"[DOWNLOAD] Downloaded {file_size} bytes")
        Path(fname).write_bytes(r.content)
        print(f"[DOWNLOAD] ✅ Saved to: {fname} ({file_size} bytes)")
        if file_size == 0:
            print(f"[DOWNLOAD] ⚠️ WARNING: File is empty!")
        return Path(fname)
    except Exception as e:
        print(f"[DOWNLOAD] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(e)}")

@app.get("/")
def health_check():
    """Health check endpoint with feature availability"""
    features = {
        "content_grading": True,  # Always available
        "plagiarism_detection": PLAGIARISM_AVAILABLE,
        "ai_detection": AI_DETECTOR_AVAILABLE,
        "apis_available": {
            "huggingface": True,  # No key needed
            "duckduckgo": True,   # No key needed
            "crossref": True,     # No key needed
            "bing_search": bool(os.getenv('BING_SEARCH_API_KEY')),
            "sapling_ai": bool(os.getenv('SAPLING_API_KEY')),
            "writer_ai": bool(os.getenv('WRITER_API_KEY')),
            "gemini_ai": bool(os.getenv('GEMINI_API_KEY'))
        }
    }
    
    return {
        "ok": True,
        "service": "EvaloAI Grader",
        "status": "running",
        "version": "3.0.0",
        "features": features,
        "endpoints": [
            "/grade - Main grading endpoint",
            "/grade-batch - Batch grading (alias)",
            "/health - This endpoint"
        ]
    }

@app.get("/health")
def health():
    """Detailed health check"""
    return health_check()

@app.post("/grade", response_model=GradeResponse)
@app.post("/grade-batch", response_model=GradeResponse)  # Alternative endpoint name
def grade(req: GradeRequest):
    """
    Grade student submission with optional plagiarism and AI checks.
    
    Features:
    - Content grading with BERT + Keywords + Grammar
    - Optional plagiarism detection (student vs student, web, academic)
    - Optional AI content detection (ChatGPT, Claude, Gemini, etc.)
    
    Integrity checks are OPTIONAL (disabled by default).
    """
    try:
        print(f"\n{'='*60}")
        print(f"[GRADING] Assignment ID: {req.assignment_id}")
        print(f"[GRADING] Max Points: {req.max_points}")
        print(f"[GRADING] Plagiarism Check: {req.check_plagiarism}")
        print(f"[GRADING] AI Check: {req.check_ai}")
        print(f"[GRADING] Use APIs: {req.use_api}")
        print(f"{'='*60}\n")

        features_used = {
            "content_grading": True,
            "plagiarism_check": False,
            "ai_detection": False
        }

        # ========== STEP 1: Download Files ==========
        print("[STEP 1] Downloading files...")
        t_path = _download(req.teacher_file_url)
        s_path = _download(req.student_file_url)
        
        # Download comparison file if plagiarism check is enabled
        comparison_path = None
        comparison_paths = []
        
        if req.check_plagiarism and PLAGIARISM_AVAILABLE:
            # Support both single file (testing) and batch (production)
            if req.comparison_file_url:
                print("[STEP 1b] Downloading single comparison file...")
                comparison_path = _download(req.comparison_file_url)
                comparison_paths.append({
                    'path': comparison_path,
                    'student_id': 'Test Student',
                    'submission_id': 'test'
                })
            
            if req.comparison_urls and len(req.comparison_urls) > 0:
                print(f"[STEP 1b] Downloading {len(req.comparison_urls)} comparison files...")
                for i, comp in enumerate(req.comparison_urls):
                    try:
                        comp_path = _download(comp['url'])
                        comparison_paths.append({
                            'path': comp_path,
                            'student_id': comp.get('student_id', f'Student {i+1}'),
                            'submission_id': comp.get('submission_id', f'sub_{i+1}')
                        })
                        print(f"   ✅ Downloaded comparison {i+1}/{len(req.comparison_urls)}")
                    except Exception as e:
                        print(f"   ⚠️ Failed to download comparison {i+1}: {e}")
                        continue
        elif req.check_plagiarism and not PLAGIARISM_AVAILABLE:
            print("[WARNING] Plagiarism check requested but module not available!")

        # ========== STEP 2: Extract Text ==========
        print("[STEP 2] Extracting text from files...")
        teacher_text = extract_text_from_file(t_path)
        student_text = extract_text_from_file(s_path)

        print(f"[EXTRACT] Teacher text length: {len(teacher_text) if teacher_text else 0} chars")
        print(f"[EXTRACT] Student text length: {len(student_text) if student_text else 0} chars")

        if not teacher_text or not teacher_text.strip():
            raise HTTPException(status_code=400, detail="Teacher file is empty or unreadable")
        if not student_text or not student_text.strip():
            raise HTTPException(status_code=400, detail="Student file is empty or unreadable")

        print(f"[EXTRACT] Teacher preview: {teacher_text[:100]}...")
        print(f"[EXTRACT] Student preview: {student_text[:100]}...")

        # Extract comparison text if provided
        comparison_submissions = []
        if comparison_paths:
            print(f"[EXTRACT] Extracting text from {len(comparison_paths)} comparison files...")
            for comp_data in comparison_paths:
                try:
                    comp_text = extract_text_from_file(comp_data['path'])
                    if comp_text and comp_text.strip():
                        comparison_submissions.append({
                            'text': comp_text,
                            'student_name': comp_data['student_id'],
                            'source': f"Submission {comp_data['submission_id']}"
                        })
                        print(f"   ✅ Extracted {len(comp_text)} chars from {comp_data['student_id']}")
                    else:
                        print(f"   ⚠️ Empty file from {comp_data['student_id']}")
                except Exception as e:
                    print(f"   ❌ Failed to extract {comp_data['student_id']}: {e}")
                    continue
            
            print(f"[EXTRACT] Ready to compare with {len(comparison_submissions)} submissions")

        # ========== STEP 3: Parse Questions ==========
        print("\n[STEP 3] Parsing questions and answers...")
        
        teacher_answers = split_questions(teacher_text)
        student_answers = split_questions(student_text)
        
        print(f"[PARSE] Found {len(teacher_answers)} teacher answers")
        print(f"[PARSE] Found {len(student_answers)} student answers")

        if req.question_text:
            questions = split_questions(req.question_text)
            print(f"[PARSE] Found {len(questions)} questions in question sheet")
        else:
            num_answers = max(len(teacher_answers), len(student_answers))
            questions = [f"Q{i+1}" for i in range(num_answers)]
            print(f"[PARSE] No question sheet - created {len(questions)} synthetic questions")

        # ========== STEP 4: Map Answers ==========
        aligned = map_answers(questions, teacher_answers, student_answers)
        
        print(f"[ALIGNED] Created {len(aligned)} question-answer pairs")
        for qid, q, t_ans, s_ans, weight in aligned:
            print(f"  {qid}: {q[:50]}... (weight: {weight})")

        # Normalize weights
        total_weight = sum(w for _, _, _, _, w in aligned)
        print(f"[WEIGHTS] Total weight: {total_weight}, Max points: {req.max_points}")
        
        if total_weight > 0 and total_weight != req.max_points:
            scale_factor = req.max_points / total_weight
            aligned = [
                (qid, q, t_ans, s_ans, w * scale_factor)
                for qid, q, t_ans, s_ans, w in aligned
            ]
            print(f"[WEIGHTS] Scaled weights by factor: {scale_factor:.2f}")

        # ========== STEP 5: Grade Content (ORIGINAL GRADING) ==========
        print("\n[STEP 5] Running content grading...")
        print("[GRADING] Using BERT + Keywords + Grammar scoring...")
        
        detailed_report = evaluate_answers(aligned)
        
        print("\n[GRADING] ✅ Content grading complete!")
        print(f"[REPORT] Generated {len(detailed_report)} character report")

        # Parse scores from report
        lines = detailed_report.split('\n')
        final_score = 0.0
        max_total = req.max_points
        parts = []

        current_qid = None
        current_total = 0.0
        current_weight = 0.0
        
        for line in lines:
            if line.startswith("======"):
                continue
            if line.startswith("Q") and "marks):" in line:
                import re
                match = re.match(r'(Q\d+)\s*\((\d+(?:\.\d+)?)\s*marks\):', line)
                if match:
                    current_qid = match.group(1)
                    current_weight = float(match.group(2))
            elif "Total:" in line and "/" in line:
                import re
                match = re.search(r'Total:\s*([\d.]+)/([\d.]+)', line)
                if match and current_qid:
                    current_total = float(match.group(1))
                    parts.append(GradePart(
                        qid=current_qid,
                        weight=int(current_weight),
                        similarity=current_total / current_weight if current_weight > 0 else 0,
                        points=current_total
                    ))
            elif "FINAL SCORE:" in line:
                import re
                match = re.search(r'FINAL SCORE:\s*([\d.]+)/([\d.]+)', line)
                if match:
                    final_score = float(match.group(1))
                    max_total = float(match.group(2))

        if not parts:
            parts.append(GradePart(
                qid="Q1",
                weight=int(max_total),
                similarity=final_score / max_total if max_total > 0 else 0,
                points=final_score
            ))

        print(f"\n[RESULT] Final Score: {final_score}/{max_total}")
        print(f"[RESULT] Percentage: {(final_score/max_total*100):.1f}%")

        # ========== STEP 6: Plagiarism Check (NEW - OPTIONAL) ==========
        plagiarism_result = None
        if req.check_plagiarism:
            if not PLAGIARISM_AVAILABLE:
                print("\n[STEP 6] ⚠️ Plagiarism check requested but not available!")
                plagiarism_result = {
                    'is_plagiarized': False,
                    'overall_score': 0.0,
                    'matches': [],
                    'details': 'Plagiarism checker module not available'
                }
            else:
                print("\n[STEP 6] Running plagiarism check...")
                features_used['plagiarism_check'] = True
                
                if len(comparison_submissions) > 0:
                    print(f"[PLAGIARISM] Comparing against {len(comparison_submissions)} other submissions...")
                    
                    plagiarism_result = check_plagiarism(
                        student_text,
                        comparison_submissions,
                        check_web=req.use_api  # Use web search if APIs enabled
                    )
                    
                    if plagiarism_result['is_plagiarized']:
                        print(f"   ⚠️ PLAGIARISM DETECTED: {plagiarism_result['overall_score']:.1%}")
                        print(f"   Matches found: {len(plagiarism_result['matches'])}")
                        for match in plagiarism_result['matches'][:3]:  # Show top 3
                            print(f"      - {match['source']}: {match['similarity']:.1%} similar")
                    else:
                        print(f"   ✅ No plagiarism detected (highest: {plagiarism_result['overall_score']:.1%})")
                    
                    print("\n" + generate_plagiarism_report(plagiarism_result))
                else:
                    print("[PLAGIARISM] No other submissions to compare against")
                    plagiarism_result = {
                        'is_plagiarized': False,
                        'overall_score': 0.0,
                        'matches': [],
                        'details': 'No other submissions available for comparison'
                    }
        else:
            print("\n[STEP 6] Plagiarism check: SKIPPED (disabled)")

        # ========== STEP 7: AI Detection (NEW - OPTIONAL) ==========
        ai_result = None
        if req.check_ai:
            if not AI_DETECTOR_AVAILABLE:
                print("\n[STEP 7] ⚠️ AI detection requested but not available!")
                ai_result = {
                    'is_ai_generated': False,
                    'ai_probability': 0.0,
                    'confidence': 0.0,
                    'details': {},
                    'explanation': 'AI detector module not available',
                    'recommendation': 'Install enhanced_ai_detector.py'
                }
            else:
                print("\n[STEP 7] Running AI content detection...")
                features_used['ai_detection'] = True
                
                ai_result = detect_ai_content(
                    student_text,
                    use_api=req.use_api  # Use APIs for better accuracy
                )
                
                if ai_result['is_ai_generated']:
                    print(f"   🤖 AI DETECTED: {ai_result['ai_probability']:.1%} probability")
                else:
                    print(f"   ✅ Appears human-written: {ai_result['ai_probability']:.1%} AI probability")
                
                print("\n" + generate_ai_report(ai_result))
        else:
            print("\n[STEP 7] AI detection: SKIPPED (disabled)")

        # ========== STEP 8: Final Decision ==========
        final_approved = True
        integrity_flags = []
        
        if plagiarism_result and plagiarism_result['is_plagiarized']:
            final_approved = False
            integrity_flags.append(f"PLAGIARISM_{int(plagiarism_result['overall_score']*100)}%")
        
        if ai_result and ai_result['is_ai_generated']:
            final_approved = False
            integrity_flags.append(f"AI_GENERATED_{int(ai_result['ai_probability']*100)}%")
        
        print(f"\n[FINAL] Approved: {final_approved}")
        print(f"[FINAL] Flags: {integrity_flags if integrity_flags else 'None'}")
        print(f"[FINAL] Features Used: {features_used}")

        # Clean up temp files
        try:
            t_path.unlink()
            s_path.unlink()
            for comp_data in comparison_paths:
                try:
                    comp_data['path'].unlink()
                except:
                    pass
            print("[CLEANUP] ✅ Temp files deleted")
        except:
            pass

        # Build response and convert all numpy types to native Python types
        response_dict = {
            "assignment_id": req.assignment_id,
            "total_points": round(final_score, 2),
            "parts": parts,
            "rubric": "bert_keyword_grammar_v3",
            "detailed_report": detailed_report,
            "plagiarism_result": plagiarism_result,
            "ai_detection_result": ai_result,
            "final_approved": final_approved,
            "integrity_flags": integrity_flags,
            "features_used": features_used
        }
        
        # Convert all numpy types to native Python types
        response_dict = convert_numpy_types(response_dict)
        
        return response_dict

    except HTTPException:
        raise
    except Exception as e:
        print(f"\n[ERROR] ❌ Grading failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Grading error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('PORT', 8000))
    print(f"\n{'='*60}")
    print(f"Starting EvaloAI Grader Service v3.0")
    print(f"Port: {port}")
    print(f"Features:")
    print(f"  - Content Grading: ✅ Enabled")
    print(f"  - Plagiarism Detection: {'✅ Available' if PLAGIARISM_AVAILABLE else '❌ Not Available'}")
    print(f"  - AI Detection: {'✅ Available' if AI_DETECTOR_AVAILABLE else '❌ Not Available'}")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)