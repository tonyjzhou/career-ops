# Career-Ops — loop-harness gate only. The repo's own suite is `npm test`
# (node test-all.mjs --quick); this Makefile exists for the TODOS drain loop.

.PHONY: loop-test
loop-test:
	@echo "Running agentic-loop harness tests (pytest)..."
	python3 -m pytest tests/scripts -q
