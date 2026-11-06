import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app import config

# Every document has two parties with these details. Keys look like "party1.company".
PARTY_FIELDS = {
    "company": "company name",
    "name": "signer's name",
    "title": "signer's job title",
    "noticeAddress": "email or postal address for legal notices",
}
PARTY_KEYS = frozenset(f"party{number}.{field}" for number in (1, 2) for field in PARTY_FIELDS)


class RequiredWhen(BaseModel):
    key: str
    equals: str


class FieldDefinition(BaseModel):
    key: str
    label: str
    description: str
    type: Literal["text", "date", "years", "choice"]
    required: bool
    options: list[str] | None = None
    requiredWhen: RequiredWhen | None = None
    default: str | None = None
    section: str | None = None


class Role(BaseModel):
    name: str
    description: str


class ExcludedTerm(BaseModel):
    term: str
    reason: str


class DocumentDefinition(BaseModel):
    """One entry in documents/documents.json, shared with the frontend."""

    id: str
    name: str
    shortName: str
    summary: str
    termsFile: str
    coverFile: str | None = None
    termsTitle: str | None = None
    coverTitle: str
    roles: tuple[Role, Role]
    fields: list[FieldDefinition]
    excludedTerms: list[ExcludedTerm]


def load_documents(path: Path) -> dict[str, DocumentDefinition]:
    entries = json.loads(path.read_text(encoding="utf-8"))
    documents = [DocumentDefinition.model_validate(entry) for entry in entries]
    return {document.id: document for document in documents}


DOCUMENTS = load_documents(config.DOCUMENTS_PATH)


def with_defaults(
    document: DocumentDefinition, values: dict[str, str], today: date
) -> dict[str, str]:
    """Fills empty fields with their defaults, as the browser does for the preview."""
    filled = dict(values)
    for field in document.fields:
        if field.default and not filled.get(field.key, "").strip():
            filled[field.key] = str(today) if field.default == "today" else field.default
    return filled


def is_required(field: FieldDefinition, values: dict[str, str]) -> bool:
    if field.requiredWhen and values.get(field.requiredWhen.key) != field.requiredWhen.equals:
        return False
    return field.required


def missing_required(document: DocumentDefinition, values: dict[str, str]) -> list[str]:
    """Names what must still be filled in, so the assistant knows what to ask."""
    missing = [
        field.label
        for field in document.fields
        if is_required(field, values) and not values.get(field.key, "").strip()
    ]
    for number, role in enumerate(document.roles, start=1):
        missing += [
            f"{role.name} {description}"
            for field, description in PARTY_FIELDS.items()
            if not values.get(f"party{number}.{field}", "").strip()
        ]
    return missing
