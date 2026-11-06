from datetime import date

import pytest

from app.documents import DOCUMENTS, with_defaults
from app.next_question import COMPLETE_MESSAGE, CHOOSE_MESSAGE, finish_reply, next_request

PILOT = DOCUMENTS["pilot-agreement"]
NDA = DOCUMENTS["mutual-nda"]

PARTIES = {
    f"party{number}.{field}": "x"
    for number in (1, 2)
    for field in ("company", "name", "title", "noticeAddress")
}
PILOT_COMPLETE = {
    **PARTIES,
    "product": "Acme App",
    "effectiveDate": "2026-11-05",
    "pilotPeriod": "60 days",
    "governingLaw": "Delaware",
    "chosenCourts": "New Castle, DE",
    "generalCapAmount": "$10,000",
}


def without(values, *keys):
    return {key: value for key, value in values.items() if key not in keys}


@pytest.mark.parametrize(
    "reply",
    [
        "Got it. I've set the governing law to Delaware.",
        "Thanks. We still need the signers.",
        "Got it.",
    ],
)
def test_adds_the_next_question_when_the_reply_asks_nothing(reply):
    finished = finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod"))
    assert finished.startswith(reply)
    assert "Pilot Period" in finished
    assert finished.rstrip().endswith("?") or "?" in finished.split("\n\n")[-1]


def test_leaves_a_reply_that_already_asks():
    reply = "Thanks. How long will the pilot run?"
    assert finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod")) == reply


def test_a_question_early_in_the_reply_doesnt_count():
    reply = "Did you mean Delaware?\n\nI've set it to Delaware."
    finished = finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod"))
    assert "Pilot Period" in finished


def test_asks_for_a_partys_missing_details_together_by_role():
    values = without(PILOT_COMPLETE, "party2.name", "party2.title", "party2.noticeAddress")
    request = next_request(PILOT, values)
    assert "Customer" in request
    assert "signer's name" in request
    assert "signer's job title" in request
    assert "notice" in request
    assert "company" not in request


def test_asks_about_parties_before_other_fields():
    assert "Provider" in next_request(PILOT, {})


def test_uses_the_fields_description():
    request = next_request(PILOT, without(PILOT_COMPLETE, "generalCapAmount"))
    assert "General Cap Amount" in request
    assert "limit on each party's total liability" in request


def test_conditional_fields_are_only_requested_when_needed():
    values = with_defaults(NDA, {**PARTIES, "governingLaw": "x", "jurisdiction": "x"}, date(2026, 11, 5))
    fixed = without({**values, "termType": "fixed"}, "termYears")
    terminated = without({**values, "termType": "untilTerminated"}, "termYears")
    assert "MNDA Term years" in next_request(NDA, fixed)
    assert next_request(NDA, terminated) is None


@pytest.mark.parametrize(
    "reply",
    [
        "All set. The agreement is complete.",
        "That's everything we need!",
        "That’s everything we need.",
        "You can now download the PDF.",
        "It's ready to download. Anything else?",
    ],
)
def test_a_false_all_set_is_removed_while_details_are_missing(reply):
    finished = finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod"))
    assert "Pilot Period" in finished
    for phrase in ("all set", "everything we need", "download"):
        assert phrase not in finished.lower()


@pytest.mark.parametrize(
    "reply",
    [
        "Is there anything else you want in the Purpose?",
        "Should the fees cover the download of the software?",
    ],
)
def test_real_questions_are_never_removed(reply):
    assert finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod")) == reply


def test_keeps_the_rest_of_a_reply_with_a_false_all_set():
    reply = "I've set the law to Delaware. All set."
    finished = finish_reply(reply, PILOT, without(PILOT_COMPLETE, "pilotPeriod"))
    assert finished.startswith("I've set the law to Delaware.")
    assert "All set" not in finished


def test_says_what_to_do_when_everything_is_filled_in():
    assert finish_reply("Got it.", PILOT, PILOT_COMPLETE) == f"Got it.\n\n{COMPLETE_MESSAGE}"


def test_doesnt_repeat_itself_when_the_reply_mentions_the_download():
    reply = "All done. Review it and select Download PDF."
    assert finish_reply(reply, PILOT, PILOT_COMPLETE) == reply


def test_replaces_a_vague_question_when_everything_is_filled_in():
    assert COMPLETE_MESSAGE in finish_reply("Anything else?", PILOT, PILOT_COMPLETE)


def test_asks_which_document_when_none_is_chosen_and_the_reply_asks_nothing():
    reply = "I can't generate a will."
    assert finish_reply(reply, None, {}) == f"{reply}\n\n{CHOOSE_MESSAGE}"


def test_leaves_a_question_when_no_document_is_chosen():
    reply = "Would you like a Business Associate Agreement?"
    assert finish_reply(reply, None, {}) == reply


def test_with_defaults_fills_blanks_only():
    values = with_defaults(NDA, {"termYears": "3", "purpose": " "}, date(2026, 11, 5))
    assert values["termYears"] == "3"
    assert values["effectiveDate"] == "2026-11-05"
    assert values["termType"] == "fixed"
    assert values["purpose"].startswith("Evaluating")
