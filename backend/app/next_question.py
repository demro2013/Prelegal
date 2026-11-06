"""Makes sure the assistant always moves the conversation forward.

The model doesn't reliably end its replies with a question, so the server checks
each reply against what's still missing and adds the next question itself. This
way, nobody has to ask whether anything else is needed.
"""

import re

from app.documents import PARTY_FIELDS, DocumentDefinition, is_required

CHOOSE_MESSAGE = "What type of document would you like to create?"
COMPLETE_MESSAGE = (
    "That's everything required. Review the agreement, then select Download PDF."
)

# Claims that the agreement is finished, which are false while details are missing.
# Questions never count, so "Is there anything else for the Purpose?" stays.
_FINISHED_CLAIM = re.compile(
    r"all set|all done|that['’]s everything|nothing else|"
    r"ready to (download|sign)|ready for download|(can|may) (now )?(review|download)",
    re.IGNORECASE,
)


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def next_request(document: DocumentDefinition, values: dict[str, str]) -> str | None:
    """Words a question for the next missing details, or None if nothing is missing."""
    for number, role in enumerate(document.roles, start=1):
        details = [
            description
            for field, description in PARTY_FIELDS.items()
            if not values.get(f"party{number}.{field}", "").strip()
        ]
        if details:
            return f"Next, for the {role.name}: what's the {_join(details)}?"

    for field in document.fields:
        if is_required(field, values) and not values.get(field.key, "").strip():
            return f"Next, what should I put for {field.label}? {field.description}"
    return None


def _sentences(reply: str) -> list[str]:
    return re.split(r"(?<=[.!?])\s+", reply.strip())


def _is_finished_claim(sentence: str) -> bool:
    return not sentence.endswith("?") and bool(_FINISHED_CLAIM.search(sentence))


def _without_finished_claims(reply: str) -> str:
    return " ".join(sentence for sentence in _sentences(reply) if not _is_finished_claim(sentence))


def _asks_a_question(reply: str) -> bool:
    return "?" in reply.strip().split("\n\n")[-1]


def _with_ending(reply: str, ending: str) -> str:
    return f"{reply}\n\n{ending}" if reply else ending


def finish_reply(
    reply: str, document: DocumentDefinition | None, values: dict[str, str]
) -> str:
    """Ensures the reply asks for what's next, or says what to do when nothing is left.

    `values` must include this turn's updates and any default values.
    """
    if document is None:
        return reply if _asks_a_question(reply) else _with_ending(reply, CHOOSE_MESSAGE)

    request = next_request(document, values)
    if request is None:
        if re.search(r"\bdownload\b", reply, re.IGNORECASE):
            return reply
        return _with_ending(_without_finished_claims(reply), COMPLETE_MESSAGE)

    if any(_is_finished_claim(sentence) for sentence in _sentences(reply)):
        return _with_ending(_without_finished_claims(reply), request)
    return reply if _asks_a_question(reply) else _with_ending(reply, request)
