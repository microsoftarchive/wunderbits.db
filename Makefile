UI = bdd
REPORTER = dot
LINT = ./node_modules/.bin/jshint
KARMA = ./node_modules/karma/bin/karma
GULP = ./node_modules/.bin/gulp
GRUNT = ./node_modules/.bin/grunt

red=`tput setaf 1`
normal=`tput sgr0`

all: lint test build

install:
	@npm install --loglevel error

build:
	@$(GULP) scripts

lint:
	@$(GRUNT) lint

watch:
	@$(GULP) tests watch

publish:
	@make test && npm publish && make tag

tag:
	@git tag "v$(shell node -e "var config = require('./package.json'); console.log(config.version);")"
	@git push --tags

clean:
	@rm -f build/*.js

karma:
	@$(GULP) tests
	@$(KARMA) start karma/conf.js

server:
	@$(GULP) tests watch server

start: install server

documentation:
	rm -rf ./docs/*
	./node_modules/.bin/jsdoc -c ./jsdoc.conf.json

.PHONY: build karma