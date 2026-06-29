.PHONY: dev test seed schema migrate lint typecheck chatbot-model

dev:
	docker-compose up -d db redis minio clamav
	sleep 2
	python manage.py migrate --settings=config.settings.dev
	python manage.py create_admin --settings=config.settings.dev
	python manage.py ensure_bucket --settings=config.settings.dev
	python -m daphne -b 0.0.0.0 -p 8000 config.asgi:application &
	celery -A config.celery worker -Q images,email,default -l info &
	celery -A config.celery beat -l info

test:
	pytest --tb=short -q

seed:
	python manage.py seed --settings=config.settings.dev

chatbot-model:
	python manage.py download_chatbot_model --settings=config.settings.dev

schema:
	python manage.py spectacular --color --file docs/openapi.yaml --settings=config.settings.dev
	python manage.py spectacular --color --format openapi --file docs/openapi.yaml --settings=config.settings.dev
	@echo "Schema written to docs/openapi.yaml"

migrate:
	python manage.py makemigrations
	python manage.py migrate

lint:
	ruff check apps/ config/

typecheck:
	mypy apps/ config/ --ignore-missing-imports
