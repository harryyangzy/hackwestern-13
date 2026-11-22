# Tandem design review

The Stageshow `static-card` example supplied the cropped window and foreground detail card. The review uses Tandem’s shared theme, bundled Inter font, and existing Gion map. The four sections advance by selection and show the palette, type scale, keyboard controls, and crew readiness in context.

The production export opens offline as `build/index.html`. Rebuild with `npm ci` and `npm run build` from this directory.

Chrome opened the standalone file, loaded Inter, and displayed all four sections at 1024 px and 390 px without horizontal overflow or script errors. This is a set of interactive stills. The controls inside the Stageshow window are specimens, and the review does not exercise the live game.
