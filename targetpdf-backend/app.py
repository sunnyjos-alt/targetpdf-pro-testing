from flask import Flask, request, send_file
from flask_cors import CORS
from pdf2docx import Converter
import os

app = Flask(__name__)
CORS(app)

@app.route('/convert-to-word', methods=['POST'])
def convert_to_word():
    if 'file' not in request.files:
        return "No file uploaded", 400
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    # Save temp files
    pdf_path = "temp.pdf"
    docx_path = "temp.docx"
    file.save(pdf_path)

    try:
        # Perform the conversion
        cv = Converter(pdf_path)
        cv.convert(docx_path, start=0, end=None)
        cv.close()
        
        # Send the file back to the browser
        return send_file(docx_path, as_attachment=True, download_name="converted.docx")
    except Exception as e:
        return str(e), 500
    finally:
        # Clean up
        if os.path.exists(pdf_path): os.remove(pdf_path)
        if os.path.exists(docx_path): os.remove(docx_path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
