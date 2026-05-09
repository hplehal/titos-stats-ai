# TAGGING RULES — Tito's Volleyball Stats

The single source of truth for how to tag plays consistently. Everyone tagging matches (you, future teammates, AI fine-tuning ground-truth) follows these rules. Inconsistent tags = unreliable stats.

If you ever find yourself unsure, **check this doc, pick the rule, stick to it.** Don't improvise — the cost of one inconsistent tagging session is statistical noise across the whole season.

---

## Quick Reference (print this and tape it near the laptop)

```
ACTIONS:
  SERVE     — putting ball in play from behind end line
  PASS      — first contact after a SERVE or FREE BALL
  SET       — controlled overhead pass to set up an attack
  ATTACK    — jump OR above-tape with directional intent
  BLOCK     — defensive contact at the net (above tape, usually jumping)
  DIG       — first contact after opponent's ATTACK
  FREEBALL  — sending ball over without attacking (forearm bump over net, soft push)

PREVIOUS PLAY → NEXT CONTACT:
  SERVE       → PASS
  ATTACK      → DIG
  FREEBALL    → PASS
  BLOCK (deflected back) → DIG (by attacking team)

RESULTS:
  SUCCESS   — this action did its job and the rally either ended or offense set up
  CONTINUED — this action completed but with degraded outcome
  ERROR     — this action failed (ball dead, point lost, or violation)
```

---

## Core principle

**Result = "how well did THIS action work?"** — independent of whether the rally ended on this play. A Pass can be Success mid-rally if it was on-target, even if the team eventually loses the point three contacts later.

Most plays in a rally are **Continued**. Only the final play has a definitive Success-for-one-team / Error-for-the-other.

---

## SERVE

**What it is:** The action of putting the ball into play from behind the end line. Tagged on the player who served.

**Result rules:**
- **Success** — Ace. Ball lands untouched, or is touched but immediately drops with zero recovery chance.
- **Continued** — Serve was returned. The receiving team got a pass on it, regardless of pass quality.
- **Error** — Serve into the net, out of bounds, missed contact, foot fault, or any service violation.

**Examples:**
- Float serve drops in front-row gap, no one moves → **Serve + Success** (ace)
- Jump serve to deep corner, defender shanks it but it lands in → **Serve + Success** (still an ace if the ball hits the floor)
- Standard serve, defender bumps to setter cleanly → **Serve + Continued**
- Server attempts jump serve, hits the net → **Serve + Error**
- Serve goes out by 2 feet → **Serve + Error**

---

## PASS

**What it is:** First contact by the receiving team after a **serve** or **free ball**. The skill being measured is serve receive / free ball receive.

**Result rules:**
- **Success** — Pass was on target. Setter could run a normal offense (any quick, any combo).
- **Continued** — Pass was off-target but playable. Setter had to scramble, jumpset awkwardly, or run a backup option. Offense was compromised but rally continued.
- **Error** — Shanked out of bounds, into the net, overpass that's killed by the opposing team, or a pass so bad the setter couldn't make a play.

**Examples:**
- Server hits, passer bumps a perfect ball to setter's hands → **Pass + Success**
- Passer takes serve off-balance, ball goes 5 feet off-target but setter chases → **Pass + Continued**
- Passer shanks serve into the bleachers → **Pass + Error**
- Passer overpasses serve, opposing team kills it → **Pass + Error** (and **Attack + Success** for the opposing kill)
- Free ball comes over, back-row player bumps to setter → **Pass + Success** (treat free balls like easy serves)

---

## SET

**What it is:** Controlled overhead pass intended to set up an attack. Almost always the second contact in a sequence (Pass → Set → Attack). Could be a forearm "bump set" if the pass was bad.

**Result rules:**
- **Success** — Teammate **killed** off this set (= assist).
- **Continued** — Teammate attacked off this set but didn't kill. Set did its job; the attack outcome is a separate event.
- **Error** — Set was bad enough that **no attack happened**. Examples: set went into the net, set went out of bounds, set was so off that the attacker had to free-ball-it-over instead of attacking, set caused a four-hits violation.

**Examples:**
- Setter delivers ball to outside hitter, hitter spikes for kill → **Set + Success**, **Attack + Success**
- Setter delivers, hitter spikes but it's dug → **Set + Continued**, **Attack + Continued**
- Setter delivers high but off-the-net, hitter still attacks but it's blocked → **Set + Continued**, **Attack + Error**, **Block + Success**
- Setter mishandles and the ball trickles over the net as a free ball (no attack) → **Set + Error**
- Setter sends the ball into the back of the gym (out of bounds on their own side) → **Set + Error**
- Setter has to bump-set due to a bad pass; bump-set is good enough for outside hitter to swing → **Set + Continued** (or Success if kill)

**Edge case:** If the SET goes directly over the net (no attack), this is a "setter dump" or accidental over. If intentional and aggressive → tag as **Attack** (not Set). If accidental and weak → **Set + Error** *if* the play dies, or just track the resulting opponent contact (Pass).

---

## ATTACK

**What it is:** An offensive play with intent to score or force a difficult return. Use these signals (any one qualifies):
- Player **jumped** to contact the ball, OR
- Contact was **at or above the net's top tape** with **directional intent** (downward angle, force, or tactical placement)

When in doubt → **Attack** (Tito's rec play is more aggressive than people think).

**Result rules:**
- **Success** — Kill. Ball lands on opponent's floor, opponent commits an error directly because of the attack (e.g., illegal back-row block of your attack), or the block deflects the ball out of bounds on the opponent's side.
- **Continued** — Attack was returned. Opponent dug or blocked it, rally continues.
- **Error** — Attack into the net, out of bounds, **stuff-blocked** (blocked back to your floor), antenna touch, or any attacker violation (lift, double, foot in opponent's court).

**Examples:**
- Outside hitter spikes hard into deep corner for a kill → **Attack + Success**
- Spike is dug by libero, rally continues → **Attack + Continued**
- Hitter swings, ball hits the net → **Attack + Error**
- Hitter swings, gets stuff-blocked back to their floor → **Attack + Error** AND **Block + Success** (both events tagged)
- Player at net pushes the ball over with hands above tape, no jump, soft trajectory: jumped? No. Above tape? Yes. Directional? Soft-but-placed → **Attack** (border case; consistency is what matters)
- Player jumps and tips over a 2-person block → **Attack** (Success/Continued/Error depending on outcome)

---

## BLOCK

**What it is:** Defensive contact at the net, almost always while jumping, contact at or above net height. Tagged on the blocker(s) — if multiple players block together, **tag each** as a separate Block event.

**Result rules:**
- **Success** — "Stuff block." Block returns the ball to the attacking team's floor for a point. (Your team scored directly off the block.)
- **Continued** — Block touched the ball but didn't end the rally. Includes: soft blocks where the ball stays on opponent's side, blocks that deflect to your back row for a dig, or blocks that slow the ball enough for transition.
- **Error** — Net violation by blocker, reach-over without first contact rights, blocker's contact deflects ball out of bounds on **your** side, or back-row blocker (illegal block from back row).

**Examples:**
- Two-person block stuffs the spike straight down for a point → **Block + Success** for both blockers
- Block touches ball, ball pops up, libero digs to setter, you transition to attack → **Block + Continued**, **Dig + Success**
- Block deflects ball into the antenna or out of bounds on your side → **Block + Error**
- Blocker touches the net during the block → **Block + Error**
- Defender doesn't jump; just stands at the net with hands up; ball deflects off their hands → tag as **Block** if hands were above net height, otherwise **Dig**

**Edge case — block touches that don't count:** A block that doesn't make contact is **not tagged at all**. No "block attempt" event. We only track actual contacts.

---

## DIG

**What it is:** First contact by the defending team after the **opponent's attack**. Skill being measured: defense reading and reacting to attacks.

**Result rules:**
- **Success** — Dig was clean and playable. Setter could run offense off it.
- **Continued** — Emergency save. Ball stayed in play but the dig was off-target, sprawled, or barely controlled. Rally continues but offense is broken.
- **Error** — Dig attempt failed. Ball hit the floor, deflected out of bounds off the defender, or wasn't reached.

**Examples:**
- Hard spike, libero digs cleanly to setter's hands → **Dig + Success**
- Hard spike, defender pancakes (one-hand floor save), ball pops up but to the wrong spot → **Dig + Continued**
- Spike lands untouched on the floor → no Dig tagged; just **Attack + Success**
- Defender gets a hand on a spike but ball deflects off them and out of bounds → **Dig + Error**
- Spike is partially blocked, ball comes down softly, back-row defender bumps it back to setter → **Dig + Success** (treat the block-deflected ball as still being from the attack)

**Edge case — block then dig:** If a teammate blocked the ball but didn't kill it, and the next contact is a defender keeping it alive, tag both events:
- **Block + Continued** (block touched but didn't end rally)
- **Dig + Success/Continued** (defender's recovery)

---

## FREEBALL

**What it is:** Sending the ball over the net **without** an attack motion. Usually because your team couldn't organize an attack. Common forms:
- Forearm bump over the net from the back row
- Soft overhead push (no jump, no force, no directional intent)
- A bad set that accidentally goes over playably

**Result rules:**
- **Success** — Rare. Free ball lands untouched (placement was lucky/strategic), or directly causes opponent to commit a reception error.
- **Continued** — Standard outcome. Opponent received the free ball normally, rally continues.
- **Error** — Free ball into the net or out of bounds. Rare because free balls are "easy" plays — Errors here usually indicate panic or miscommunication.

**Examples:**
- Setter mishandles the pass, has to bump it over softly to keep it in play → **Freeball + Continued**
- Free ball is sent to deep corner where no one's standing, lands untouched → **Freeball + Success**
- Player tries to free-ball it over but mis-hits into the net → **Freeball + Error**
- Front-row player at net standing flat-footed pushes ball over with hands at chest height (below tape, no jump) → **Freeball** (not Attack — fails the Attack criteria)

**Why this matters:** Free balls are a negative-skill indicator at the team level. A team sending lots of free balls = a team failing to generate offense. Tagging them separately keeps your Attack stats clean (Kill % only meaningful relative to Attack count, not "anything-over-the-net" count).

---

## Cross-cutting edge cases

### 1. Block-touch transition: who's the next event?
After a block, the ball can go various directions:
- **Block sends it back to the attacker's floor** → **Block + Success**, rally ends
- **Block deflects to attacker's side, attacker recovers and re-attacks** → **Block + Continued**, then attacker's next contact is **Set** (or Pass if it's a 1st contact in the new sequence) — *but the previous-play rule says PASS comes after SERVE/FREE, so probably this is just whatever the contact looks like; setters set, defenders dig*
- **Block deflects to your back row, your defender keeps it alive** → **Block + Continued**, then **Dig + Success/Continued**

### 2. Joust at the net
Both attackers contact the ball simultaneously above the net. Ball drops to one side. Tag:
- **Attack + (whatever)** for both attackers (same play, two events, same timestamp)
- The team that loses the joust → next contact is **Dig**

### 3. Setter dump (intentional)
Setter jumps and pushes the ball over the net unexpectedly. This is an **Attack**, not a Set, because the intent was to score. Receiver's next contact → **Dig**.

### 4. Overpass that becomes a kill
Pass goes too far and ends up on opponent's side. Two events:
- **Pass + Error**
- Opponent's next contact: if they attack the overpass, **Attack + (Success/Continued/Error)**

### 5. The "Continued" result is the workhorse
Most actions during a rally → **Continued**. Don't agonize. Only Success/Error require a specific judgment ("did this end the rally on a high note?" / "did this kill the play?"). Everything in the middle is Continued.

### 6. "I missed a contact" — what now?
If you missed tagging a contact in real-time and the rally already moved on, **don't backfill**. Let the rally play out, tag what you saw clearly, and move on. Inconsistent backfilling is worse than missing data.

### 7. Coed quirks (Tito's Thursday Coed)
- More free balls than men's: don't agonize over Tip vs Free Ball borderline cases — apply the rule (jumped? above tape with intent?) and move on
- Lower attack pace can mean ambiguous Block events: be strict (only tag a Block if hands were above net height, otherwise it's a Dig)
- More overhead "sets over the net" (intentional sets to dump): these are Attacks

---

## Tagging hygiene (read before every tagging session)

1. **One rule, one session.** If you change your interpretation mid-session, your data is poisoned. If you find yourself wanting to change a rule, write it down, finish the current session under the old rule, then update this doc and start fresh next session.

2. **Tag in real-time when possible.** Pausing the video to tag is fine, but rewinding heavily means you'll over-correct and bias toward a "perfect" read of every play.

3. **Don't tag while exhausted.** Tired tagging produces noisy data, which makes the AI look worse than it is in Phase 2/3 benchmarks. If you find yourself zoning out, stop and resume tomorrow.

4. **Tag full sets in one sitting.** If you tag 30 minutes today and 30 minutes tomorrow, your judgment will drift between sessions. Aim for one full set in one sitting.

5. **When two events happen on the same contact**, tag both with the same `start_time` (or sequential sequence numbers within the same rally). Common cases:
   - Stuff block: **Block + Success** AND **Attack + Error**
   - Joust: **Attack + (result)** for each attacker
   - Block touch + dig: **Block + Continued** AND **Dig + (result)**

6. **When in doubt:**
   - Attack vs Free ball → **Attack**
   - Pass vs Dig → previous play rule (SERVE/FREE → Pass; ATTACK → Dig)
   - Set + Continued vs Set + Error → did an attack happen? Yes → Continued. No → Error.
   - Block touch vs no touch → if no contact, don't tag at all
   - Continued vs Success → did the rally / offense flow continue at full effectiveness? Yes → Success. Degraded → Continued.

---

## Versioning

This document is the **source of truth** for ground-truth tagging. If rules change:

1. Bump the version below
2. Note what changed in a CHANGELOG section
3. Re-tag any sets where the change matters (don't mix versions in the same dataset)

**Current version:** 1.0 (May 2026)
