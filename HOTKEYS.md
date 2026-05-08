# Tito's Courts — Tracker Hotkey Reference

Print this and tape it next to the laptop at the venue.

## Page-level (always active on the tracker page)

| Key       | Action                                              |
| --------- | --------------------------------------------------- |
| `Space`   | Play / pause video                                  |
| `← / →`   | Seek ±2 seconds                                     |
| `R`       | Start rally (no rally) / open End-Rally dialog (active rally) |

## End-Rally dialog (when open)

| Key | Action                                          |
| --- | ----------------------------------------------- |
| `H` | End rally — point won by **home**               |
| `A` | End rally — point won by **away**               |
| `Esc` | Cancel                                        |

## Active-rally drawer (only while a rally is active)

Two-key combo: pick **action**, then **result**. Team and player carry forward across plays — change them only when the situation flips.

### Team (sticky)

| Key | Action            |
| --- | ----------------- |
| `H` | Select home team  |
| `A` | Select away team  |

### Player (sticky)

| Key   | Action                              |
| ----- | ----------------------------------- |
| `1–9` | Pick roster slot 1–9 of current team |

### Action (stages — no commit yet)

| Key | Action    |
| --- | --------- |
| `Q` | Serve     |
| `W` | Pass      |
| `E` | Set       |
| `F` | Attack    |
| `T` | Block     |
| `Y` | Dig       |
| `U` | Freeball  |

### Result (commits the staged action)

| Key | Result     |
| --- | ---------- |
| `S` | Success    |
| `X` | Error      |
| `C` | Continued  |

A staged action clears after **10 seconds** of idle if no result key follows.

## Cheat-sheet flow

```
R                 → start rally
H or A            → set team
1–9               → set player
F  S              → kill
F  X              → attack error
Q  S              → ace        (Q = Serve)
Q  X              → service error
T  S              → block
Y  S              → dig
W  X              → reception error
R  H  or  R  A    → end rally, award point
```
