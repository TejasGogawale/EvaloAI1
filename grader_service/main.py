from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import shutil
from pdf_utils import extract_text_from_file
from parse_utils import split_questions, map_answers
from grading import evaluate_answers

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

UPLOAD_DIR = Path("uploads")
QUESTION_DIR = UPLOAD_DIR / "questions"
TEACHER_DIR = UPLOAD_DIR / "teacher"
STUDENT_DIR = UPLOAD_DIR / "student"

for d in [QUESTION_DIR, TEACHER_DIR, STUDENT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

storage = {"questions": "", "teacher": "", "student": ""}

@app.post("/upload_question")
async def upload_question(question_paper: UploadFile):
    file_path = QUESTION_DIR / question_paper.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(question_paper.file, f)
    storage["questions"] = extract_text_from_file(file_path)
    return {"message": " Question paper uploaded"}

@app.post("/upload_teacher")
async def upload_teacher(teacher_answer: UploadFile = None, teacher_text: str = Form(None)):
    if teacher_answer:
        file_path = TEACHER_DIR / teacher_answer.filename
        with open(file_path, "wb") as f:
            shutil.copyfileobj(teacher_answer.file, f)
        storage["teacher"] = extract_text_from_file(file_path)
        print(f"Teacher file '{teacher_answer.filename}' extracted successfully.") 
    else:
        storage["teacher"] = teacher_text or ""
        print("Teacher text received directly.") 
    return {"message": " Teacher answer uploaded"}

@app.post("/upload_student")
async def upload_student(student_answer: UploadFile = None, student_text: str = Form(None)):
    if student_answer:
        file_path = STUDENT_DIR / student_answer.filename
        with open(file_path, "wb") as f:
            shutil.copyfileobj(student_answer.file, f)
        storage["student"] = extract_text_from_file(file_path)
        print(f"Student file '{student_answer.filename}' extracted successfully.") 
    else:
        storage["student"] = student_text or ""
        print("Student text received directly.") 
    return {"message": "Student answer uploaded"}

@app.post("/evaluate")
async def evaluate():
    if not (storage["questions"] and storage["teacher"] and storage["student"]):
        return {"error": "Please upload question paper, teacher answer, and student answer first."}


    questions = split_questions(storage["questions"])
    teacher_answers = split_questions(storage["teacher"])
    student_answers = split_questions(storage["student"])

    aligned = map_answers(questions, teacher_answers, student_answers)
    report = evaluate_answers(aligned)

    return {"report": report}