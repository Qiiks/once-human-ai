# Multi-stage build for RAG pipeline service
FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy requirements file
COPY rag_pipeline/requirements.txt ./

# Create wheels for dependencies
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels \
    -r requirements.txt

# Production stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

WORKDIR /app

# Copy wheels from builder and install
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

# Set model cache directory
ENV SENTENCE_TRANSFORMERS_HOME=/app/model_cache
ENV TRANSFORMERS_CACHE=/app/model_cache
ENV HF_HOME=/app/model_cache

# Create necessary directories
RUN mkdir -p /app/model_cache /data/chroma_db && \
    chown -R appuser:appuser /app /data

# Pre-download the model while still root for better caching
RUN python3 -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('all-MiniLM-L6-v2', cache_folder='/app/model_cache')" && \
    chown -R appuser:appuser /app/model_cache

# Copy application code
COPY --chown=appuser:appuser rag_pipeline/ ./rag_pipeline/

# Create a simple health check endpoint script
RUN echo '#!/usr/bin/env python3\n\
import sys\n\
try:\n\
    import requests\n\
    response = requests.get("http://localhost:5000/health", timeout=5)\n\
    sys.exit(0 if response.status_code == 200 else 1)\n\
except:\n\
    sys.exit(1)' > /app/healthcheck.py && \
    chmod +x /app/healthcheck.py && \
    chown appuser:appuser /app/healthcheck.py

# Switch to non-root user
USER appuser

# Set Python environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose Flask port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 /app/healthcheck.py || exit 1

# Run the Flask application
CMD ["python3", "-u", "rag_pipeline/rag_service.py"]