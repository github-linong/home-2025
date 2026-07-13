requirejs.config({
    baseUrl: './',
    paths: {
	  es6: "es6",
	  babel: "babel-5.8.34.min"
	}
});

// Start the main app logic.
requirejs(["es6!requirejs_babel1"], function (a) {
	console.log(a);
});