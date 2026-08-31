"""
Misconception Clustering Engine

Pure deterministic co-occurrence clustering — no LLM, no ML.
Groups participants by the misconception_tag of their chosen wrong option.

This runs in real time on every answer submission.
"""

from __future__ import annotations

from typing import Any

from .event_engine import Cluster, RoomState


def compute_clusters_for_question(
    state: RoomState,
    question_id: str,
) -> list[dict[str, Any]]:
    """
    Compute misconception clusters for a specific question
    from the current room state.

    Returns a list of cluster dicts ready for WebSocket broadcast:
    [
        {
            "misconception_tag": "sign_error",
            "question_id": "...",
            "participant_count": 5,
            "participant_ids": ["id1", "id2", ...]
        },
        ...
    ]
    """
    return [
        {
            "misconception_tag": c.misconception_tag,
            "question_id": c.question_id,
            "participant_count": c.participant_count,
            "participant_ids": c.participant_ids,
        }
        for c in state.clusters
        if c.question_id == question_id
    ]


def compute_all_clusters(state: RoomState) -> list[dict[str, Any]]:
    """
    Compute all clusters across all questions.
    Used for debrief and history views.
    """
    return [
        {
            "misconception_tag": c.misconception_tag,
            "question_id": c.question_id,
            "participant_count": c.participant_count,
            "participant_ids": c.participant_ids,
        }
        for c in state.clusters
    ]


def get_cluster_graph_data(
    state: RoomState,
    question_id: str | None = None,
    participant_names: dict[str, str] | None = None,
) -> dict:
    """
    Build graph data (nodes + links) for the force-directed
    misconception visualization.

    Nodes: participants (colored by cluster) + cluster label nodes
    Links: participant → cluster they belong to

    Returns:
    {
        "nodes": [
            {"id": "participant_id", "name": "Alice", "group": "sign_error", "type": "participant"},
            {"id": "cluster_sign_error", "name": "Sign Error", "group": "sign_error", "type": "cluster"},
        ],
        "links": [
            {"source": "participant_id", "target": "cluster_sign_error"}
        ]
    }
    """
    if participant_names is None:
        participant_names = {}

    clusters = state.clusters
    if question_id:
        clusters = [c for c in clusters if c.question_id == question_id]

    nodes = []
    links = []
    seen_participants = set()
    seen_cluster_nodes = set()

    for cluster in clusters:
        # Cluster label node
        cluster_node_id = f"cluster_{cluster.misconception_tag}_{cluster.question_id}"
        if cluster_node_id not in seen_cluster_nodes:
            nodes.append({
                "id": cluster_node_id,
                "name": cluster.misconception_tag,
                "group": cluster.misconception_tag,
                "type": "cluster",
                "val": max(3, cluster.participant_count),
            })
            seen_cluster_nodes.add(cluster_node_id)

        # Participant nodes + links to cluster
        for pid in cluster.participant_ids:
            if pid not in seen_participants:
                nodes.append({
                    "id": pid,
                    "name": participant_names.get(pid, pid[:8]),
                    "group": cluster.misconception_tag,
                    "type": "participant",
                    "val": 1,
                })
                seen_participants.add(pid)

            links.append({
                "source": pid,
                "target": cluster_node_id,
            })

    return {"nodes": nodes, "links": links}


def get_lifeline_graph_data(
    state: RoomState,
    participant_names: dict[str, str] | None = None,
) -> dict:
    """
    Build graph data for the lifeline social graph.

    Nodes: participants involved in lifelines
    Links: sender → receiver (anonymized on broadcast)
    """
    if participant_names is None:
        participant_names = {}

    nodes = []
    links = []
    seen = set()

    for lifeline in state.lifelines:
        for pid in (lifeline.from_participant_id, lifeline.to_participant_id):
            if pid not in seen:
                nodes.append({
                    "id": pid,
                    "name": participant_names.get(pid, pid[:8]),
                    "type": "participant",
                    "val": 1,
                })
                seen.add(pid)

        links.append({
            "source": lifeline.from_participant_id,
            "target": lifeline.to_participant_id,
        })

    return {"nodes": nodes, "links": links}
