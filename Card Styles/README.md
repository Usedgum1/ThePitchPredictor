# Card Styles

`BaseDesign.css` is the current/default card look.

`DropRateController.js` controls which style a newly displayed card receives. Right now `base-design` has a `dropRate` of `100`, so every card uses BaseDesign.

When adding a future style:

1. Add a new CSS file in this folder.
2. Add a style entry in `DropRateController.js` with a unique `id`, `label`, `className`, and `dropRate`.
3. Load the new CSS file from `app.html` and `app-mobile.html`.
4. Style cards by targeting the generated class, for example `.desktop-card.card-style-new-style`.

Saved wallet cards persist their chosen style in the snapshot as `_card_style`.
