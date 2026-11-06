import logging
import os

import litellm
from litellm import completion
from pydantic import ValidationError

from app.chat_schema import ChatTurn

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
TIMEOUT_SECONDS = 60
MAX_TOKENS = 4000
MAX_ATTEMPTS = 2

logger = logging.getLogger(__name__)

# Keeps LiteLLM from printing request details when a call fails.
litellm.suppress_debug_info = True


class LlmError(Exception):
    """The model couldn't produce a usable reply."""


def is_configured() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY"))


def complete_chat(messages: list[dict[str, str]]) -> ChatTurn:
    """Calls the model, retrying once if its answer can't be read.

    Logs only exception types. Messages and provider errors can hold what
    the user typed, so they stay out of the logs.
    """
    for _ in range(MAX_ATTEMPTS):
        try:
            response = completion(
                model=MODEL,
                messages=messages,
                response_format=ChatTurn,
                reasoning_effort="low",
                extra_body=EXTRA_BODY,
                timeout=TIMEOUT_SECONDS,
                max_tokens=MAX_TOKENS,
            )
        except Exception as error:
            logger.error("Model call failed: %s", type(error).__name__)
            raise LlmError from None

        try:
            return ChatTurn.model_validate_json(response.choices[0].message.content)
        except ValidationError:
            logger.warning("Model returned an unreadable answer")

    raise LlmError
