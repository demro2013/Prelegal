import json
import re

import pytest

from app import config
from app.documents import DOCUMENTS, PARTY_KEYS, missing_required

TEMPLATES = config.REPO_ROOT / "templates"
CATALOG = json.loads((config.REPO_ROOT / "catalog.json").read_text(encoding="utf-8"))
LINKED_TERM = re.compile(r'<span class="\w+_link"[^>]*>(.*?)</span>', re.S)
DOCUMENT_IDS = list(DOCUMENTS)


def normalize(term: str) -> str:
    """Treats "Provider's", "Provider’s" and "Providers" as the same term."""
    term = re.sub(r"['’]s$", "", term.strip())
    return term.removesuffix("s").casefold()


def linked_terms(filename: str) -> set[str]:
    return set(LINKED_TERM.findall((TEMPLATES / filename).read_text(encoding="utf-8")))


def test_every_catalog_file_belongs_to_exactly_one_document():
    files = [
        file
        for document in DOCUMENTS.values()
        for file in (document.termsFile, document.coverFile)
        if file
    ]
    assert sorted(files) == sorted(entry["filename"] for entry in CATALOG)


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_every_linked_term_is_listed_or_deliberately_excluded(document_id):
    document = DOCUMENTS[document_id]
    accounted_for = {
        normalize(name)
        for name in (
            *(field.label for field in document.fields),
            *(role.name for role in document.roles),
            *(excluded.term for excluded in document.excludedTerms),
        )
    }
    missing = {
        term for term in linked_terms(document.termsFile) if normalize(term) not in accounted_for
    }
    assert missing == set()


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_definitions_are_well_formed(document_id):
    document = DOCUMENTS[document_id]
    keys = [field.key for field in document.fields]
    assert len(keys) == len(set(keys))
    assert not set(keys) & PARTY_KEYS
    for field in document.fields:
        assert field.description.strip()
        if field.type == "choice":
            assert field.options
        if field.requiredWhen:
            assert field.requiredWhen.key in keys


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_cited_terms_title_appears_in_the_template(document_id):
    document = DOCUMENTS[document_id]
    if document.termsTitle:
        assert document.termsTitle in (TEMPLATES / document.termsFile).read_text(encoding="utf-8")


def test_missing_required_covers_fields_and_parties_by_role():
    missing = missing_required(DOCUMENTS["pilot-agreement"], {"product": "Acme App"})
    assert "Product" not in missing
    assert "Pilot Period" in missing
    assert "Provider company name" in missing
    assert "Customer signer's name" in missing
    assert "Fees" not in missing


def test_missing_required_respects_conditional_fields():
    nda = DOCUMENTS["mutual-nda"]
    assert "MNDA Term years" in missing_required(nda, {"termType": "fixed"})
    assert "MNDA Term years" not in missing_required(nda, {"termType": "untilTerminated"})
