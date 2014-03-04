install:
	@npm install --development

lint:
	@grunt lint

specs:
	./node_modules/.bin/mocha-phantomjs -R spec http://127.0.0.1:9988/

clean:
	@rm -rf build coverage

.PHONY: lint specs
