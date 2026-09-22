"""Shared, intentionally small API error envelope helpers."""

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def error_detail(code: str, message: str) -> dict[str, str]:
    """Build a public error payload. Messages must not contain internal details."""
    return {"code": code, "message": message}


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=error_detail(code, message))


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": error_detail("http_error", "The request could not be completed.")},
        )
    # The background agent API has an independent, already-consumed error contract.
    if request.url.path.startswith("/api/agents"):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers,
        )
    detail: dict[str, Any]
    if isinstance(exc.detail, dict) and {"code", "message"} <= exc.detail.keys():
        detail = {"code": str(exc.detail["code"]), "message": str(exc.detail["message"])}
    else:
        detail = error_detail("http_error", "The request could not be completed.")
    return JSONResponse(
        status_code=exc.status_code, content={"detail": detail}, headers=exc.headers
    )


async def request_validation_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request, exc
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": error_detail("request_validation_error", "The request is invalid.")},
    )
