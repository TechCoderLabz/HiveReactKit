# 2026-11-17 — Remove button on outgoing HP delegations

## Root cause

`renderHpRow` in `src/components/Delegations.tsx` never had a delete control.

- `efefb55` (2026-05-07) added the HP row (account, amount, percent) and gave only RC rows Update / Delete.
- `5fd330d` (2026-08-21) and `b5c10fa` (2026-11-03, #15) restyled that row. `git blame` still points at `efefb55` for the row body. `git log -S onDeleteHpDelegation` is empty.

Own-profile was also `currentUsername === username`, so a casing mismatch hid RC actions as well. `Wallet.tsx` already compares case-insensitively.

## What changed

- `onDeleteHpDelegation`. The trash button renders on outgoing HP rows when the viewer is the profile owner and the callback is set. Incoming rows stay read-only.
- Confirm dialog before the callback. Cancelling the signer (`false`) leaves the row in place.
- Prop is threaded through `Wallet` and `UserDetailProfile`. Consumers still decide who can sign (active key).
- Version 3.12.0 → 3.12.1.

HiveSuite wires the callback to `delegateHp(delegatee, 0)` (Aioha → Keychain `requestDelegation` with `0.000` HP).
