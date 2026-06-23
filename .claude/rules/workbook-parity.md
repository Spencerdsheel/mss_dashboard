# Rule: Workbook Parity (deterministic sample baseline)

The sample-data generator is the frozen acceptance baseline. Its shape is asserted by
`tests/seed-parity.test.ts`. Changing the generator means changing that contract on purpose.

## The locked decision: all-English vocabulary

Install answers, dates, and labels are **English** (the French `fr-CA` era is being retired in
P1.4/P3). Install distributions come from campaign config; the sample provider uses the
simplified English distributions that the parity test encodes.

## The contract (must hold)

- Exactly **436** visits, **436** unique stores, unique survey IDs, survey **1737162** present.
- Date range **2026-03-06 → 2026-04-08** inclusive.
- Install-1/2/3 distributions match the English counts in `tests/seed-parity.test.ts`.
- Photo-slot coverage matches `PHOTO_COUNTS`; exactly **3** rows have no photos at all.
- The generator is **deterministic**: two runs produce byte-identical output.

## Must not

- Do not mint synthetic/extra surveys for the real Labatt project (this is **Bug A**; the mock
  previously inflated Messi to 33,592 rows — it must not).
- Do not reintroduce French answer keys or English↔French answer-map mismatches (**Bug B**).

## Verify

`npm test` → `seed-parity.test.ts` green. Any drift means the generator changed; confirm it was
intentional and update the contract deliberately.
