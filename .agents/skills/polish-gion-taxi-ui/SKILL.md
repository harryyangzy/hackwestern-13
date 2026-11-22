---
name: polish-gion-taxi-ui
description: Design and implement the Gion Taxi game's cute, sticker-like interface with bright collectible colors, playful icon badges, softly raised cards, and selective drop shadows. Use when creating or polishing its screens, HUD, lobby, phone controls, menus, status chips, or game components while keeping existing functionality.
---

# Polish Gion Taxi UI

Give Gion Taxi a cheerful, tactile, collectible feel: like a tiny Kyoto arcade world with cute stickers and bright game pieces placed on a clean, light interface. Use the bundled screenshots as the visual brief:

- `assets/game-ui-reference.jpg` shows the existing game screen and the original screen-system inspiration.
- `assets/cute-sticker-inspiration.jpg` shows the sticker, icon, capsule, layered-card, and color references.

## Workflow

1. Inspect the app's framework, existing screens, shared styles, and interaction/state logic. Follow the project's conventions and current stack.
2. Map the visible components to their real behaviors before editing. Keep the existing information architecture and useful components; improve their styling and hierarchy in place.
3. Define reusable tokens for color, type, radius, borders, shadows, spacing, and focus states. Apply the same visual rules across screens.
4. Refine the real interface, including its responsive layout and existing states. Do not replace functional screens with a static concept or add controls that do nothing.
5. Preview the changed screen states when the project workflow allows. Compare them with the bundled screenshots and check that the game remains easy to read and operate.

## Visual direction

- Make the interface noticeably brighter and more playful. Use a light warm-white or pale neutral canvas, with cheerful pops of taxi yellow, sky or electric blue, cherry coral, bubblegum pink, fresh lime or leaf green, and tangerine. Use dark ink mainly for text and icon details, not as a large background color.
- Treat useful game details as collectible stickers: seasonal symbols, route markers, fares, seat roles, tiny Kyoto landmarks, and short status labels can use friendly illustrated icons, colored capsules, small tags, or sticker-like badges. Give stickers a crisp white cutout rim and a small soft shadow so they lift off the surface. Keep their shapes and icon style consistent.
- Layer a few decorative sticker accents around empty edges or card corners. Keep stickers out of dense copy, map labels, QR codes, and tap targets. Avoid scattering decoration everywhere; each one should add character or help identify a game object or state.
- Use clean, light cards with rounded corners and clear separation from the background. Add soft ambient shadows to important panels and a slightly stronger shadow or offset base to primary actions and sticker badges. Use subtle borders or surface changes to define card edges. Avoid heavy black shadows, thick outlines on every element, and excessive blur.
- Make buttons feel pressable: use bright fills or pale raised capsules, a readable label/icon, a small shadow or lower edge, and clear hover, pressed, focused, selected, and disabled states. Use restrained gradients or highlights only when they fit the existing app. Keep disabled controls legible.
- Keep the Gion Taxi identity and Kyoto setting. Retain the current logo, map artwork, editorial/serif brand details, and seasonal character where they work. Use a legible, friendly sans-serif for headings, controls, instructions, and seat states; use the existing serif as a brand accent; reserve monospaced type for compact HUD numbers or technical metadata. Do not make small controls decorative or hard to scan.
- Use icon color and shape to make game roles and actions recognizable, but keep text labels too. Use a coherent icon family and avoid mixing unrelated emoji with polished interface icons. Small playful illustrations are welcome when they match the sticker treatment.
- Keep the city/map visible and readable. Give modal panels enough opacity to separate their QR code, seats, Wrong Turn setup, and start action from the scene behind them. Preserve atmosphere around the panel without letting the map reduce text contrast.
- Use decoration to support the Kyoto taxi world: seasonal leaves, stars, route dashes, taxi motifs, shrine/lantern cues, or collectible location markers. Keep the game recognizable and the gameplay information primary.

## Preserve game functionality

Preserve behavior and data for the existing components, including as applicable:

- City and season selection, special scenes, map legend, map interaction, camera/zoom/pause controls, and field notes.
- Crew room/QR joining, seat availability, Wrong Turn setup, role/status displays, readiness, and start-shift conditions.
- Phone/driver controls, steering, trip progress, fare and goal information, and shift results.

Keep loading, waiting, selected, disabled, success, and error states tied to the existing implementation. Keep touch targets and keyboard access. Do not rely on color alone for roles or statuses. Respect reduced-motion preferences; keep any sticker bounce or button lift brief and subtle.

## Implementation guardrails

- Prefer polishing existing components and shared styles over building duplicate UI. Preserve architecture and event handlers unless inspection identifies a concrete reason to change them.
- Keep networking, room/wallet logic, game rules, and dynamic values intact. Do not invent content or imply that a control works when it does not.
- Reuse installed fonts, icon libraries, and assets where possible. Avoid new dependencies or remote font downloads without a clear need.
- At narrow widths, stack or scroll panels without covering essential map or game controls. Keep modals usable on phone screens.
- Make only changes needed for the requested visual polish. Do not run tests unless asked; use the existing preview/build workflow only when needed to inspect the interface.
