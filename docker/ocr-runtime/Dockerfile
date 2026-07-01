FROM jbarlow83/ocrmypdf-alpine

ARG TESSDATA_BEST_REF=e12c65a915945e4c28e237a9b52bc4a8f39a0cec

ENV SMART_DMS_OCR_HELPER_SCRIPT=/usr/local/bin/smart-dms-ocr-helper
ENV SMART_DMS_PYTHON=/app/.venv/bin/python3
ENV SMART_DMS_RUNTIME_ROLE=ocr
ENV SMART_DMS_STORAGE_ROOT=/data

USER root

COPY --chmod=0755 docker/ocr-runtime/ocr-helper.py /usr/local/bin/smart-dms-ocr-helper
COPY --chmod=0755 docker/runtime-server.py /usr/local/bin/smart-dms-runtime-server

RUN set -eux; \
  /app/.venv/bin/python3 -m ensurepip; \
  /app/.venv/bin/python3 -m pip install --no-cache-dir \
    lingua-language-detector \
    pdfminer.six \
    pillow \
    pikepdf \
    pypdfium2; \
  for lang in osd eng deu fra spa por chi_sim; do \
    wget -q -O "/usr/share/tessdata/${lang}.traineddata" \
      "https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${TESSDATA_BEST_REF}/${lang}.traineddata"; \
  done; \
  tesseract --list-langs

USER app

ENTRYPOINT ["ocrmypdf"]
