.PHONY: lint format test coverage install clean

lint:
	black --check .
	pylint satellite_processor --fail-under=6.0 --disable=C0114,C0115,C0116,C0301,E0401,E1101

format:
	black .

test:
	QT_QPA_PLATFORM=offscreen xvfb-run pytest -v --tb=short

coverage:
	QT_QPA_PLATFORM=offscreen xvfb-run pytest --cov=satellite_processor --cov-report=term-missing --cov-report=html

install:
	pip install -r requirements.txt
	pip install -e .

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf .coverage htmlcov/ *.egg-info/ dist/ build/
