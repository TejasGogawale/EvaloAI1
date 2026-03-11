import fitz  # PyMuPDF
from pathlib import Path
import os

def extract_text_from_file(file_path):
    """
    Extract text from various file formats.
    Now includes handwriting recognition for scanned/handwritten PDFs.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return ""

    ext = file_path.suffix.lower()
    text = ""

    if ext == ".pdf":
        # Try digital text extraction first (fast)
        text = extract_text_from_pdf(file_path)
        
        # If no text found, it might be a scanned/handwritten PDF
        if not text or len(text.strip()) < 50:
            print(f"[OCR] PDF appears to be scanned/handwritten, using OCR...")
            text = extract_text_from_pdf_with_ocr(file_path)
            
    elif ext in [".docx", ".doc"]:
        text = extract_text_from_docx(file_path)
        
    elif ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
        # Image file - use OCR
        text = extract_text_from_image(file_path)
    
    return text


def extract_text_from_pdf(file_path):
    """Extract digital text from PDF (for typed PDFs)"""
    try:
        doc = fitz.open(file_path)
        text = ""
        for page in doc:
            text += page.get_text("text") + "\n"
        doc.close()
        return text
    except Exception as e:
        print(f"[PDF] Error extracting text: {e}")
        return ""


def extract_text_from_pdf_with_ocr(file_path):
    """
    Extract text from scanned/handwritten PDF using OCR.
    Uses Google Cloud Vision API for handwriting recognition.
    Falls back to Tesseract for printed text.
    """
    try:
        # Check if Google Cloud Vision is available
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            return extract_with_google_vision(file_path)
        else:
            print("[OCR] Google Vision not configured, using Tesseract...")
            return extract_with_tesseract_pdf(file_path)
    except Exception as e:
        print(f"[OCR] Error: {e}")
        return ""


def extract_with_google_vision(file_path):
    """
    Use Google Cloud Vision API for handwriting recognition.
    This is the BEST option for handwritten text.
    """
    try:
        from google.cloud import vision
        import io
        
        client = vision.ImageAnnotatorClient()
        
        # Read PDF and convert pages to images
        import fitz
        doc = fitz.open(file_path)
        
        full_text = ""
        
        for page_num in range(len(doc)):
            # Convert page to image
            page = doc[page_num]
            pix = page.get_pixmap(dpi=300)  # High DPI for better OCR
            img_bytes = pix.tobytes("png")
            
            # Call Google Vision API
            image = vision.Image(content=img_bytes)
            response = client.document_text_detection(image=image)
            
            if response.error.message:
                print(f"[VISION] Page {page_num+1} error: {response.error.message}")
                continue
            
            # Extract text
            page_text = response.full_text_annotation.text
            full_text += page_text + "\n"
            
            print(f"[VISION] Page {page_num+1}: Extracted {len(page_text)} characters")
        
        doc.close()
        return full_text
        
    except ImportError:
        print("[VISION] google-cloud-vision not installed")
        return ""
    except Exception as e:
        print(f"[VISION] Error: {e}")
        return ""


def extract_with_tesseract_pdf(file_path):
    """
    Fallback: Use Tesseract OCR (works OK for printed text, poor for handwriting)
    """
    try:
        from PIL import Image
        import pytesseract
        import fitz
        
        doc = fitz.open(file_path)
        full_text = ""
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(dpi=300)
            
            # Convert to PIL Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # OCR with Tesseract
            page_text = pytesseract.image_to_string(img)
            full_text += page_text + "\n"
            
            print(f"[TESSERACT] Page {page_num+1}: Extracted {len(page_text)} characters")
        
        doc.close()
        return full_text
        
    except ImportError:
        print("[TESSERACT] pytesseract or PIL not installed")
        return ""
    except Exception as e:
        print(f"[TESSERACT] Error: {e}")
        return ""


def extract_text_from_docx(file_path):
    """Extract text from Word documents"""
    try:
        from docx import Document
        doc = Document(file_path)
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text
    except ImportError:
        print("[DOCX] python-docx not installed")
        return ""
    except Exception as e:
        print(f"[DOCX] Error: {e}")
        return ""


def extract_text_from_image(file_path):
    """Extract text from image files using OCR"""
    try:
        # Try Google Vision first if available
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            from google.cloud import vision
            
            client = vision.ImageAnnotatorClient()
            
            with open(file_path, 'rb') as image_file:
                content = image_file.read()
            
            image = vision.Image(content=content)
            response = client.document_text_detection(image=image)
            
            if not response.error.message:
                return response.full_text_annotation.text
        
        # Fallback to Tesseract
        from PIL import Image
        import pytesseract
        
        img = Image.open(file_path)
        text = pytesseract.image_to_string(img)
        return text
        
    except Exception as e:
        print(f"[IMAGE OCR] Error: {e}")
        return ""