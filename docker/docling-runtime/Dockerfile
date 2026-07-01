FROM python:3.12-slim-bookworm

ARG DOCLING_VERSION=2.103.0

ENV DOCLING_ARTIFACTS_PATH=/opt/docling/models
ENV SMART_DMS_OCR_HELPER_SCRIPT=/usr/local/bin/smart-dms-ocr-helper
ENV SMART_DMS_PYTHON=/app/.venv/bin/python3
ENV SMART_DMS_RUNTIME_ROLE=docling
ENV SMART_DMS_STORAGE_ROOT=/data

COPY --chmod=0755 docker/ocr-runtime/ocr-helper.py /usr/local/bin/smart-dms-ocr-helper
COPY --chmod=0755 docker/runtime-server.py /usr/local/bin/smart-dms-runtime-server

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    libgl1 \
    libglib2.0-0; \
  rm -rf /var/lib/apt/lists/*; \
  python3 -m venv /app/.venv; \
  /app/.venv/bin/python3 -m pip install --no-cache-dir --upgrade pip; \
  /app/.venv/bin/python3 -m pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch \
    torchvision; \
  /app/.venv/bin/python3 -c "import importlib.metadata as m; print('torch==' + m.version('torch')); print('torchvision==' + m.version('torchvision'))" > /tmp/pytorch-cpu-constraints.txt; \
  /app/.venv/bin/python3 -m pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -c /tmp/pytorch-cpu-constraints.txt \
    "docling==${DOCLING_VERSION}"; \
  /app/.venv/bin/python3 -c "import importlib.metadata as m; bad=sorted(d.metadata['Name'] for d in m.distributions() if d.metadata['Name'].startswith('nvidia-')); assert not bad, 'CUDA packages installed: ' + ', '.join(bad)"; \
  /app/.venv/bin/python3 -c "from pathlib import Path; from docling.utils.model_downloader import download_models; download_models(output_dir=Path('/opt/docling/models'), progress=False, with_code_formula=False, with_picture_classifier=False, with_rapidocr=False)"

EXPOSE 8080

ENTRYPOINT ["/app/.venv/bin/python3", "/usr/local/bin/smart-dms-runtime-server"]
