# Gaelic Manager boxed team-sheet regression

The **unaltered original PNG** from `Screenshot 2026-10-27 at 18.43.07.png.zip` supplied by the user. Not a synthetic rendering or recreated layout.

- Original dimensions: 1320 × 2868 pixels.
- Original bytes: 1,457,343.
- SHA-256: `dbd0615d241ba1a196b9be2977ed8295a7c99911b712b784aa6f349d970bc95f`.
- Fifteen light bordered player cards arranged 1–3–3–2–3–3. Each card has a number above first-name/surname lines; the midfield cards are wider apart than the existing programme template predicts.
- After Subs, twelve unboxed numbered name stacks in three rows of four. All names/jerseys must remain reviewable.
- Measured pre-change baseline: jerseys 8, 9 and 11 blank; several surname-first names; #10 reduced to Donaghy. User's reported examples #13/#14 must preserve both first name and surname. Raw OCR already contained the missing text.
- Browser regression runs the real bundled OCR on the original file offline and asserts all 27 number/name/role pairings from independently transcribed visible ground truth. Names appear only in test expectations, never in production parsing rules.
