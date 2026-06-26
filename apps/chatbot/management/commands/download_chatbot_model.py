"""Management command: download_chatbot_model — fetches the local GGUF
model the chatbot uses for response generation (see apps/chatbot/llm.py).

One-time, explicit download (~1GB) rather than an automatic on-first-use
fetch, since that's not the kind of thing that should happen silently on a
metered connection or surprise someone mid-request.
"""
from django.core.management.base import BaseCommand

from apps.chatbot.llm import MODEL_FILENAME, MODEL_REPO, MODEL_DIR


class Command(BaseCommand):
    help = f"Download the chatbot's local LLM ({MODEL_REPO}/{MODEL_FILENAME}, ~1GB) for offline use."

    def handle(self, *args, **options):
        from huggingface_hub import hf_hub_download

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f"Downloading {MODEL_FILENAME} from {MODEL_REPO} (~1GB, one-time)...")
        path = hf_hub_download(
            repo_id=MODEL_REPO,
            filename=MODEL_FILENAME,
            local_dir=str(MODEL_DIR),
        )
        self.stdout.write(self.style.SUCCESS(f"Model ready at {path}"))
