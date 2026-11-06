from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app import llm
from app.auth import Limits, User, current_user, get_limits
from app.chat_schema import ChatRequest, ChatTurn, clean_updates
from app.documents import DOCUMENTS, PARTY_KEYS, DocumentDefinition, with_defaults
from app.next_question import finish_reply
from app.prompts.document import build_system_prompt

router = APIRouter()


def _ask_model(
    request: ChatRequest,
    document: DocumentDefinition | None,
    values: dict[str, str],
    just_chosen: bool = False,
) -> ChatTurn:
    system = build_system_prompt(document, values, request.today, just_chosen)
    messages = [
        {"role": "system", "content": system},
        *(message.model_dump() for message in request.messages),
    ]
    return llm.complete_chat(messages)


# A plain def, so FastAPI runs the blocking model calls in a worker thread.
@router.post("/chat")
def chat(
    request: ChatRequest,
    user: Annotated[User, Depends(current_user)],
    limits: Annotated[Limits, Depends(get_limits)],
) -> ChatTurn:
    if not llm.is_configured():
        raise HTTPException(503, "The AI assistant isn't configured.")

    limits.chat.consume(str(user.id))

    document = DOCUMENTS.get(request.documentType or "")
    values = request.values
    try:
        turn = _ask_model(request, document, values)
        chosen = DOCUMENTS.get(turn.documentType or "")

        if chosen is not None and chosen is not document:
            # The model only sees a document's fields once it's chosen, so ask
            # again to capture what the user has said and start guiding them.
            values = {key: value for key, value in values.items() if key in PARTY_KEYS}
            turn = _ask_model(request, chosen, values, just_chosen=True)
            document = chosen
    except llm.LlmError:
        raise HTTPException(502, "The AI assistant is unavailable.") from None

    updates = clean_updates(turn.updates, document)
    if document is not None:
        applied = {update.key: update.value for update in updates}
        values = with_defaults(document, {**values, **applied}, request.today)

    return ChatTurn(
        reply=finish_reply(turn.reply, document, values),
        documentType=document.id if document else None,
        updates=updates,
    )
