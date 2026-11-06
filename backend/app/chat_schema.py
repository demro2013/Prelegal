import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

MAX_MESSAGES = 40
# Longer than the browser's input limit, because assistant replies count too.
MAX_MESSAGE_CHARS = 8000
MAX_VALUE_CHARS = 5000

ValueText = Annotated[str, Field(max_length=MAX_VALUE_CHARS)]


class ChatMessage(BaseModel):
    # Limited to these roles so a client can't supply its own system prompt.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class Party(BaseModel):
    name: ValueText
    title: ValueText
    company: ValueText
    noticeAddress: ValueText


class MndaValues(BaseModel):
    """Mirrors MndaValues in frontend/src/lib/mnda.ts."""

    purpose: ValueText
    effectiveDate: ValueText
    termType: Literal["fixed", "untilTerminated"]
    termYears: ValueText
    confidentialityType: Literal["fixed", "perpetual"]
    confidentialityYears: ValueText
    governingLaw: ValueText
    jurisdiction: ValueText
    modifications: ValueText
    parties: tuple[Party, Party]


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    values: MndaValues
    today: date

    @field_validator("messages")
    @classmethod
    def must_end_with_the_user(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return messages


class PartyUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    company: str | None = None
    noticeAddress: str | None = None


class MndaUpdates(BaseModel):
    """Null means "leave this field as it is"."""

    purpose: str | None = None
    effectiveDate: str | None = None
    termType: Literal["fixed", "untilTerminated"] | None = None
    termYears: str | None = None
    confidentialityType: Literal["fixed", "perpetual"] | None = None
    confidentialityYears: str | None = None
    governingLaw: str | None = None
    jurisdiction: str | None = None
    modifications: str | None = None
    party1: PartyUpdate | None = None
    party2: PartyUpdate | None = None


class ChatTurn(BaseModel):
    """The model's structured output, and the API's response."""

    reply: str
    updates: MndaUpdates

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


def _clean_modifications(value: str | None) -> str | None:
    """Returns None for unusable text. Blank stays blank, which clears the field."""
    if value is None:
        return None
    value = value.translate(_PRINTABLE_LOOKALIKES).strip()
    # An over-limit value would make every later request invalid.
    return value if len(value) <= MAX_VALUE_CHARS else None


def _clean_text(value: str | None) -> str | None:
    return _clean_modifications(value) or None


def _clean_years(value: str | None) -> str | None:
    value = _clean_text(value)
    return value if value and re.fullmatch(r"[1-9][0-9]?", value) else None


def _clean_date(value: str | None) -> str | None:
    value = _clean_text(value)
    if not value or not re.fullmatch(r"(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}", value):
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def _clean_party(party: PartyUpdate | None) -> PartyUpdate | None:
    if party is None:
        return None
    return PartyUpdate(
        name=_clean_text(party.name),
        title=_clean_text(party.title),
        company=_clean_text(party.company),
        noticeAddress=_clean_text(party.noticeAddress),
    )


def clean_updates(updates: MndaUpdates) -> MndaUpdates:
    """Drops values the agreement can't use, so a model slip can't damage it.

    Only modifications can be cleared, because it's the one optional field.
    """
    return MndaUpdates(
        purpose=_clean_text(updates.purpose),
        effectiveDate=_clean_date(updates.effectiveDate),
        termType=updates.termType,
        termYears=_clean_years(updates.termYears),
        confidentialityType=updates.confidentialityType,
        confidentialityYears=_clean_years(updates.confidentialityYears),
        governingLaw=_clean_text(updates.governingLaw),
        jurisdiction=_clean_text(updates.jurisdiction),
        modifications=_clean_modifications(updates.modifications),
        party1=_clean_party(updates.party1),
        party2=_clean_party(updates.party2),
    )
