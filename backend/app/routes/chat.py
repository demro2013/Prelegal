from fastapi import APIRouter, HTTPException

from app import llm
from app.chat_schema import ChatRequest, ChatTurn, clean_updates
from app.documents import DOCUMENTS, PARTY_KEYS, DocumentDefinition
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
def chat(request: ChatRequest) -> ChatTurn:
    if not llm.is_configured():
        raise HTTPException(503, "The AI assistant isn't configured.")

    document = DOCUMENTS.get(request.documentType or "")
    try:
        turn = _ask_model(request, document, request.values)
        chosen = DOCUMENTS.get(turn.documentType or "")

        if chosen is not None and chosen is not document:
            # The model only sees a document's fields once it's chosen, so ask
            # again to capture what the user has said and start guiding them.
            parties = {key: value for key, value in request.values.items() if key in PARTY_KEYS}
            turn = _ask_model(request, chosen, parties, just_chosen=True)
            document = chosen
    except llm.LlmError:
        raise HTTPException(502, "The AI assistant is unavailable.") from None

    return ChatTurn(
        reply=turn.reply,
        documentType=document.id if document else None,
        updates=clean_updates(turn.updates, document),
    )
