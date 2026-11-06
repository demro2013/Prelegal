import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.documents import DOCUMENTS, PARTY_KEYS, DocumentDefinition, FieldDefinition

MAX_MESSAGES = 40
# Longer than the browser's input limit, because assistant replies count too.
MAX_MESSAGE_CHARS = 8000
MAX_VALUE_CHARS = 5000
MAX_VALUES = 100

ValueKey = Annotated[str, Field(max_length=100)]
ValueText = Annotated[str, Field(max_length=MAX_VALUE_CHARS)]


class ChatMessage(BaseModel):
    # Limited to these roles so a client can't supply its own system prompt.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    documentType: str | None
    values: dict[ValueKey, ValueText] = Field(max_length=MAX_VALUES)
    today: date

    @field_validator("messages")
    @classmethod
    def must_end_with_the_user(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return messages

    @field_validator("documentType")
    @classmethod
    def must_be_a_known_document(cls, document_type: str | None) -> str | None:
        if document_type is not None and document_type not in DOCUMENTS:
            raise ValueError("Unknown document type.")
        return document_type


class FieldUpdate(BaseModel):
    key: str
    value: str | None = None


class ChatTurn(BaseModel):
    """The model's structured output, and the API's response.

    A single fixed shape for every document, because a separate schema per
    document would be less reliable with this model. The server checks each
    update against the document's field definitions instead.
    """

    reply: str
    documentType: str | None = None
    updates: list[FieldUpdate] = []

    @field_validator("reply")
    @classmethod
    def must_be_usable(cls, reply: str) -> str:
        if not reply.strip():
            raise ValueError("The reply is blank.")
        # It's sent back with later messages, which have this limit.
        if len(reply) > MAX_MESSAGE_CHARS:
            raise ValueError("The reply is too long.")
        return reply


# The model sometimes writes these look-alikes, which the PDF's fonts can't print.
_PRINTABLE_LOOKALIKES = str.maketrans({"‐": "-", "‑": "-", " ": " ", " ": " "})


def _clean_text(value: str) -> str | None:
    """Returns None for unusable text. Blank stays blank."""
    value = value.translate(_PRINTABLE_LOOKALIKES).strip()
    # An over-limit value would make every later request invalid.
    return value if len(value) <= MAX_VALUE_CHARS else None


def _is_valid_date(value: str) -> bool:
    if not re.fullmatch(r"(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _clean_field_value(field: FieldDefinition, value: str) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    # Only an optional field can be cleared, so a model slip can't blank a required one.
    if not cleaned:
        return "" if not field.required else None
    if field.type == "years" and not re.fullmatch(r"[1-9][0-9]?", cleaned):
        return None
    if field.type == "date" and not _is_valid_date(cleaned):
        return None
    if field.type == "choice" and cleaned not in (field.options or []):
        return None
    return cleaned


def clean_updates(
    updates: list[FieldUpdate], document: DocumentDefinition | None
) -> list[FieldUpdate]:
    """Drops values the agreement can't use, so a model slip can't damage it."""
    if document is None:
        return []
    fields = {field.key: field for field in document.fields}

    cleaned = []
    for update in updates:
        if update.value is None:
            continue
        if update.key in fields:
            value = _clean_field_value(fields[update.key], update.value)
        elif update.key in PARTY_KEYS:
            value = _clean_text(update.value) or None
        else:
            value = None
        if value is not None:
            cleaned.append(FieldUpdate(key=update.key, value=value))
    return cleaned
