from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pdf2docx import Converter
from io import BytesIO
from pathlib import Path
import logging
import os
import tempfile

app = Flask(__name__)

# Keep uploads bounded so one request cannot consume unlimited memory/disk.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

# The frontend is a public browser tool. We can tighten allowed origins after
# the separate testing deployment URL is known.
CORS(app)

@app.get("/")
@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "TargetPDF PDF-to-Word backend"}), 200

@app.errorhandler(413)
def request_entity_too_large(_error):
    return jsonify({
        "error": "The PDF is too large. Please upload a PDF smaller than 20 MB."
    }), 413

@app.post("/convert-to-word")
def convert_to_word():
    if "file" not in request.files:
        return jsonify({"error": "No file was uploaded."}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Please choose a PDF file."}), 400

    if Path(uploaded.filename).suffix.lower() != ".pdf":
        return jsonify({"error": "Please upload a PDF file."}), 415

    # Check the file signature as well as its extension.
    pdf_bytes = uploaded.read()
    if not pdf_bytes.startswith(b"%PDF-"):
        return jsonify({"error": "This file does not appear to be a valid PDF."}), 415

    try:
        # A unique directory per request prevents concurrent users from
        # overwriting each other's temporary input/output files.
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

            with open(docx_path, "rb") as docx_file:
                docx_bytes = docx_file.read()

        return send_file(
            BytesIO(docx_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            as_attachment=True,
            download_name="converted.docx",
        )
    except Exception:
        app.logger.exception("PDF-to-Word conversion failed")
        return jsonify({
            "error": (
                "Conversion failed. The PDF may be damaged, password-protected, "
                "scanned, or too complex to convert. Please try another PDF."
            )
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
