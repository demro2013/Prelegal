from fastapi import APIRouter, HTTPException

from app import llm
from app.chat_schema import ChatRequest, ChatTurn, clean_updates
from app.prompts.mnda import build_system_prompt

router = APIRouter()


# A plain def, so FastAPI runs the blocking model call in a worker thread.
@router.post("/chat")
def chat(request: ChatRequest) -> ChatTurn:
    if not llm.is_configured():
        raise HTTPException(503, "The AI assistant isn't configured.")

    messages = [
        {"role": "system", "content": build_system_prompt(request.values, request.today)},
        *(message.model_dump() for message in request.messages),
    ]
    try:
        turn = llm.complete_chat(messages)
    except llm.LlmError:
        raise HTTPException(502, "The AI assistant is unavailable.") from None

    return ChatTurn(reply=turn.reply, updates=clean_updates(turn.updates))
