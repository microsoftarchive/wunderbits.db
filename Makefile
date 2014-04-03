install:
	@npm install
	@npm install -g gulp grunt

build:
	@gulp scripts

lint:
	@grunt lint

test: lint
	./node_modules/.bin/mocha-phantomjs -R spec http://127.0.0.1:9988/

publish:
	@make test && npm publish && make tag

tag:
	@git tag "v$(shell node -e "var config = require('./package.json'); console.log(config.version);")"
	@git push --tags

.PHONY: all install build lint test watch coverage publish tag