"""
Celery tasks for MindMesh.

Phase 8: Auto-generated debrief story.
This is the ONLY module allowed to call an LLM.
"""

import logging
from celery import shared_task

from .models import DebriefReport, Room
from .event_engine import replay_events
from .clustering import compute_all_clusters

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def generate_debrief(self, room_id: str):
    """
    Generate a debrief report for a completed quiz session.

    Reads the full event log, computes cluster history, and generates
    a narrative report. Uses LLM if available, falls back to template.

    Target: < 15 seconds for a 10-question quiz.
    """
    try:
        room = Room.objects.select_related("quiz").get(id=room_id)
    except Room.DoesNotExist:
        logger.error("Room %s not found for debrief generation", room_id)
        return

    if room.status != "ended":
        logger.warning("Room %s is not ended, skipping debrief", room.code)
        return

    # Check if debrief already exists
    if DebriefReport.objects.filter(room=room).exists():
        logger.info("Debrief already exists for room %s", room.code)
        return

    logger.info("Generating debrief for room %s", room.code)

    # Replay full event log
    state = replay_events(room)
    clusters = compute_all_clusters(state)

    # Compute analytics
    questions = list(room.quiz.questions.prefetch_related("options").order_by("order"))
    question_analytics = []

    for q in questions:
        q_id = str(q.id)
        q_answers = []
        for pid, answers in state.answers.items():
            for ans in answers:
                if ans.question_id == q_id:
                    q_answers.append(ans)

        total = len(q_answers)
        correct = sum(1 for a in q_answers if a.is_correct)
        avg_confidence = (
            sum(a.confidence for a in q_answers) / total if total else 0
        )

        q_clusters = [c for c in clusters if c["question_id"] == q_id]

        # Identify the dominant misconception
        dominant_misconception = None
        max_count = 0
        for c in q_clusters:
            if c["participant_count"] > max_count:
                max_count = c["participant_count"]
                dominant_misconception = c["misconception_tag"]

        question_analytics.append({
            "question_text": q.text,
            "order": q.order,
            "total_answers": total,
            "correct_count": correct,
            "accuracy_pct": round((correct / total * 100) if total else 0, 1),
            "avg_confidence": round(avg_confidence, 1),
            "dominant_misconception": dominant_misconception,
            "misconception_count": max_count,
            "clusters": q_clusters,
        })

    # Sort by most misconception occurrences (most problematic first)
    question_analytics.sort(
        key=lambda x: x["misconception_count"], reverse=True
    )

    # Try LLM generation, fall back to template
    narrative = _try_llm_debrief(room, question_analytics, state)
    if not narrative:
        narrative = _template_debrief(room, question_analytics, state)

    # Suggest remedial questions based on dominant misconceptions
    suggested = _suggest_remedial_questions(question_analytics)

    # Cluster summary for the frontend
    cluster_summary = {
        "total_clusters": len(clusters),
        "questions_with_misconceptions": len(
            [q for q in question_analytics if q["dominant_misconception"]]
        ),
        "most_common_misconceptions": _get_top_misconceptions(clusters),
        "per_question": question_analytics,
    }

    DebriefReport.objects.create(
        room=room,
        narrative_text=narrative,
        suggested_questions=suggested,
        cluster_summary=cluster_summary,
    )

    logger.info("Debrief generated for room %s", room.code)


def _try_llm_debrief(room, analytics, state):
    """Attempt to generate debrief with LLM. Returns None if unavailable."""
    from django.conf import settings

    api_key = getattr(settings, "OPENAI_API_KEY", "")
    if not api_key:
        return None

    try:
        import openai

        client = openai.OpenAI(api_key=api_key)

        # Build the prompt
        prompt_parts = [
            f"You are analyzing a quiz session titled '{room.quiz.title}'.",
            f"There were {len(state.answers)} participants.",
            "",
            "Here is the question-by-question analysis:",
        ]

        for qa in analytics:
            prompt_parts.append(
                f"\nQ{qa['order']}: {qa['question_text']}"
                f"\n  Accuracy: {qa['accuracy_pct']}%"
                f"  Avg confidence: {qa['avg_confidence']}%"
            )
            if qa["dominant_misconception"]:
                prompt_parts.append(
                    f"  Dominant misconception: '{qa['dominant_misconception']}' "
                    f"({qa['misconception_count']} participants)"
                )

        prompt_parts.extend([
            "",
            "Write a concise debrief report (3-5 paragraphs) that:",
            "1. Summarizes overall quiz performance",
            "2. Highlights which questions caused the most shared misconceptions",
            "3. Explains the dominant misconception patterns",
            "4. CRITICAL: Explicitly call out 'High Confidence, Wrong Answer' occurrences (where avg confidence is high but accuracy is low) as major learning hurdles.",
            "5. Suggests 2-3 specific remedial questions or activities",
            "Keep it professional but accessible, suitable for an educator.",
        ])

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an educational assessment analyst."},
                {"role": "user", "content": "\n".join(prompt_parts)},
            ],
            max_tokens=800,
            temperature=0.7,
        )

        return response.choices[0].message.content

    except Exception as e:
        logger.warning("LLM debrief generation failed: %s", e)
        return None


def _template_debrief(room, analytics, state):
    """Generate a template-based debrief report (no LLM needed)."""
    total_participants = len(state.answers)
    total_questions = len(analytics)

    # Overall accuracy
    total_correct = sum(q["correct_count"] for q in analytics)
    total_answers = sum(q["total_answers"] for q in analytics)
    overall_accuracy = round((total_correct / total_answers * 100) if total_answers else 0, 1)

    parts = [
        f"## Quiz Session Debrief: {room.quiz.title}\n",
        f"**{total_participants} participants** answered **{total_questions} questions** "
        f"with an overall accuracy of **{overall_accuracy}%**.\n",
    ]

    # Most problematic questions
    problem_qs = [q for q in analytics if q["dominant_misconception"]]
    if problem_qs:
        parts.append("### Key Misconception Patterns\n")
        for q in problem_qs[:3]:
            parts.append(
                f"- **Q{q['order']}** ({q['accuracy_pct']}% accuracy): "
                f"The misconception **\"{q['dominant_misconception']}\"** was shared by "
                f"{q['misconception_count']} participant(s). "
                f"Average confidence was {q['avg_confidence']}%."
            )
        parts.append("")

    # Confidence calibration insights
    overconfident_wrong = [
        q for q in analytics
        if q["avg_confidence"] > 70 and q["accuracy_pct"] < 50
    ]
    if overconfident_wrong:
        parts.append("### Confidence Calibration Alert\n")
        for q in overconfident_wrong:
            parts.append(
                f"- **Q{q['order']}**: Participants were {q['avg_confidence']}% "
                f"confident but only {q['accuracy_pct']}% accurate — a significant "
                f"calibration gap indicating false confidence."
            )
        parts.append("")

    # Best-understood questions
    easy_qs = [q for q in analytics if q["accuracy_pct"] >= 80]
    if easy_qs:
        parts.append(
            f"### Well-Understood Topics\n"
            f"{len(easy_qs)} question(s) had ≥80% accuracy, suggesting solid "
            f"foundational understanding in those areas.\n"
        )

    return "\n".join(parts)


def _suggest_remedial_questions(analytics):
    """Generate 2-3 suggested remedial questions based on misconception patterns."""
    suggestions = []
    for q in analytics[:3]:
        if q["dominant_misconception"]:
            suggestions.append({
                "related_to": f"Q{q['order']}: {q['question_text'][:80]}",
                "misconception": q["dominant_misconception"],
                "suggestion": (
                    f"Create a follow-up question that directly addresses the "
                    f"'{q['dominant_misconception']}' misconception. Consider using "
                    f"a worked example that contrasts the correct reasoning with "
                    f"the common error."
                ),
            })
    return suggestions


def _get_top_misconceptions(clusters):
    """Get the top misconceptions across all questions."""
    tag_counts = {}
    for c in clusters:
        tag = c["misconception_tag"]
        tag_counts[tag] = tag_counts.get(tag, 0) + c["participant_count"]

    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    return [
        {"tag": tag, "total_occurrences": count}
        for tag, count in sorted_tags[:5]
    ]


@shared_task(bind=True, max_retries=0)
def generate_ai_hint(self, room_id: str, question_id: str, time_limit_seconds: int):
    """
    Generate a Socratic AI hint for a question when the timer is running low.

    Schedule this task immediately after a question is pushed. It sleeps
    until (time_limit - 15) seconds have elapsed, then calls Gemini to
    generate a hint and broadcasts it via the channel layer.

    The hint must NOT reveal the answer — it guides via process-of-elimination
    or conceptual nudges.
    """
    import time
    import os
    import asyncio
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    # Wait until 15 seconds remain
    wait_seconds = max(0, time_limit_seconds - 15)
    logger.info("AI hint task: waiting %ds for room %s Q %s", wait_seconds, room_id, question_id)
    time.sleep(wait_seconds)

    # Check room still active and question still current
    try:
        room = Room.objects.select_related("current_question").get(id=room_id)
    except Room.DoesNotExist:
        return

    if room.status != "live":
        return
    if room.current_question is None or str(room.current_question.id) != question_id:
        return  # Question has already advanced

    # Fetch question + options
    from .models import Question
    try:
        question = Question.objects.prefetch_related("options").get(id=question_id)
    except Question.DoesNotExist:
        return

    options_text = "\n".join(
        f"  {'✓' if o.is_correct else '○'} {o.text}"
        for o in question.options.all()
    )

    api_key = os.environ.get("GEMINI_API_KEY", "")
    hint_text = None

    if api_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            system_prompt = (
                "You are a Socratic learning assistant inside a live quiz. "
                "A student is struggling with a question and has only 15 seconds left. "
                "Give a single short hint (1-2 sentences max) that helps them reason toward the answer "
                "WITHOUT revealing it. Guide them to eliminate wrong options or recall key concepts. "
                "DO NOT state the answer. DO NOT reference option letters like A, B, C, D. "
                "Sound warm, concise, and encouraging."
            )
            user_message = (
                f"Question: {question.text}\n"
                f"Options:\n{options_text}\n\n"
                "Give a Socratic hint that helps without revealing the answer:"
            )

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    types.Content(role="user", parts=[types.Part(text=user_message)])
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.6,
                    max_output_tokens=120,
                ),
            )
            hint_text = response.text.strip()
        except Exception as e:
            logger.error("AI hint generation failed: %s", e)

    # Fallback: template hint
    if not hint_text:
        hint_text = (
            "⏱ Think carefully — try to eliminate the options you're least sure about first. "
            "What do you know for certain about this topic?"
        )

    # Store hint against the question (in-memory broadcast only; no DB persistence needed)
    channel_group = f"room_{room.code}"
    channel_layer = get_channel_layer()

    async def _broadcast():
        await channel_layer.group_send(
            channel_group,
            {
                "type": "hint_delivered",
                "question_id": question_id,
                "hint_text": hint_text,
                "question_text": question.text,
            },
        )

    async_to_sync(_broadcast)()
    logger.info("AI hint delivered to room %s for Q %s", room.code, question_id)
