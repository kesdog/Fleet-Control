from collections import deque
from threading import Lock
from time import monotonic


class AgentReportRateLimiter:
    """Process-wide sliding-window limiter for the unauthenticated agent report route."""

    def __init__(self, maximum_requests: int = 15, window_seconds: float = 60.0) -> None:
        self._maximum_requests = maximum_requests
        self._window_seconds = window_seconds
        self._requests: deque[float] = deque()
        self._lock = Lock()

    def retry_after_seconds(self) -> int | None:
        now = monotonic()
        with self._lock:
            cutoff = now - self._window_seconds
            while self._requests and self._requests[0] <= cutoff:
                self._requests.popleft()
            if len(self._requests) >= self._maximum_requests:
                return max(1, int(self._requests[0] + self._window_seconds - now) + 1)
            self._requests.append(now)
        return None


# Next iteration: replace this global window with per-user token buckets once authentication exists.
