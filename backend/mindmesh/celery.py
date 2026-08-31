"""
Celery configuration for MindMesh project.
"""

import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mindmesh.settings")

app = Celery("mindmesh")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
