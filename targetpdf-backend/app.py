from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pdf2docx import Converter
from io import BytesIO
from pathlib import Path
import logging
import os
import tempfile
import time

app = Flask(__name__)
app.logger.setLevel(logging.INFO)

# Free-hosting safety limit. Raise only after memory and load testing.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

# Permit only the testing site and the live TargetPDF domain to call this API
# from browsers. This is a browser security setting, not authentication.
ALLOWED_ORIGINS = [
    "https://targetpdf-pro-testing.pages.dev",
    "https://targetpdf.com",
    "https://www.targetpdf.com",
]
CORS(
    app,
    resources={r"/*": {"origins": ALLOWED_ORIGINS}},
    expose_headers=["X-Conversion-Seconds", "X-Input-Bytes", "Content-Disposition"],
)

@app.get("/")
@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "TargetPDF PDF-to-Word backend",
    }), 200

@app.errorhandler(413)
def request_entity_too_large(_error):
    return jsonify({
        "error": "The PDF is too large. Please upload a PDF smaller than 20 MB."
    }), 413

@app.post("/convert-to-word")
def convert_to_word():
    request_started = time.perf_counter()
    if "file" not in request.files:
        return jsonify({"error": "No file was uploaded."}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Please choose a PDF file."}), 400

    if Path(uploaded.filename).suffix.lower() != ".pdf":
        return jsonify({"error": "Please upload a PDF file."}), 415

    pdf_bytes = uploaded.read()
    input_bytes = len(pdf_bytes)
    if input_bytes == 0:
        return jsonify({"error": "The selected PDF is empty."}), 400
    if not pdf_bytes.startswith(b"%PDF-"):
        return jsonify({"error": "This file does not appear to be a valid PDF."}), 415

    conversion_started = time.perf_counter()
    try:
        # Isolated temporary files prevent concurrent requests from colliding.
        with tempfile.TemporaryDirectory(prefix="targetpdf-") as temp_dir:
            pdf_path = os.path.join(temp_dir, "input.pdf")
            docx_path = os.path.join(temp_dir, "converted.docx")

            with open(pdf_path, "wb") as pdf_file:
                pdf_file.write(pdf_bytes)

            converter = Converter(pdf_path)
            try:
                converter.convert(docx_path, start=0, end=None)
            finally:
                converter.close()

            if not os.path.isfile(docx_path) or os.path.getsize(docx_path) == 0:
                raise RuntimeError("Converter produced an empty DOCX file")

            with open(docx_path, "rb") as docx_file:
                docx_bytes = docx_file.read()

        conversion_seconds = time.perf_counter() - conversion_started
        total_seconds = time.perf_counter() - request_started
        app.logger.info(
            "PDF-to-Word success input_bytes=%d output_bytes=%d conversion_seconds=%.2f total_seconds=%.2f",
            input_bytes, len(docx_bytes), conversion_seconds, total_seconds
        )

        response = send_file(
            BytesIO(docx_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            as_attachment=True,
            download_name="converted.docx",
        )
        # These timings help separate server processing from browser/network delay.
        response.headers["X-Conversion-Seconds"] = f"{conversion_seconds:.2f}"
        response.headers["X-Input-Bytes"] = str(input_bytes)
        response.headers["Cache-Control"] = "no-store"
        return response

    except Exception:
        app.logger.exception(
            "PDF-to-Word failure input_bytes=%d elapsed_seconds=%.2f",
            input_bytes, time.perf_counter() - request_started
        )
        return jsonify({
            "error": (
                "Conversion failed. The PDF may be damaged, password-protected, "
                "scanned, or too complex to convert. Please try another PDF."
            )
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
