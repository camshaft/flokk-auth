
build: components
	@./node_modules/.bin/component build --copy --standalone flokk-auth --prefix "/public"

components: component.json
	@./node_modules/.bin/component install

build/build.min.js: build/build.js
	@uglifyjs --compress --mangle -o build/build.min.js build/build.js

clean:
	rm -fr build components

.PHONY: clean build
