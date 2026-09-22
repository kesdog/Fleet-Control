FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-alpine AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.runtime.txt ./
RUN pip install --no-cache-dir -r requirements.runtime.txt

COPY backend/app ./app
COPY --from=frontend-build /build/frontend/dist ./static

RUN addgroup --system appuser \
    && adduser --system --ingroup appuser --uid 10001 appuser \
    && mkdir -p data/imports data/logs \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
