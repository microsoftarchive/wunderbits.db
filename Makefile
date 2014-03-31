install:
	@npm install --development

build:
	@gulp scripts

lint:
	@grunt lint

specs: lint
	./node_modules/.bin/mocha-phantomjs -R spec http://127.0.0.1:9988/

clean:
	@rm -rf build coverage

.PHONY: lint specs
