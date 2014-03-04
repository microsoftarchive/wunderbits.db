lint:
  # Linting
  @grunt lint

specs:
  @kaapi

watch:
  @kaapi --watch

coverage:
  @mkdir -p coverage
  @kaapi --coverage

clean:
  @rm -rf build coverage

.PHONY: coverage lint specs
