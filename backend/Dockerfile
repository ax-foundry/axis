# Backend Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Python runtime defaults for containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure custom/ dirs exist for deploy pipeline (COPY custom/ won't fail on empty)
RUN mkdir -p /app/custom/config /app/custom/branding /app/custom/agents
ENV AXIS_CUSTOM_DIR=/app/custom

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8500

# Cloud Run/GCP-friendly default command (no reload)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8500} --proxy-headers --forwarded-allow-ips='*'"]
