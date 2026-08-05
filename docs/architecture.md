# How it's put together

Five files, about 1,400 lines total, one dependency (electron). Counts as of
2026-08-05; the shape doesn't move much.

| File | Lines | Job |
|---|---|---|
| `main.js` | 290 | tray, overlay windows, event dispatch |
| `poller.js` | 332 | asks Jira what's new, decides what counts |
| `plane.html` | 674 | every visual: plane, tag, rope, smoke, audio, physics |
| `teams.js` | 114 | the Teams DM sink |
| `preload.js` | 15 | sandboxed bridge between overlay and main process |

## The overlay

When an event lands, main.js creates one window per display, each exactly the
size of its screen: transparent, frameless, shadowless, never focused, and
pinned at macOS's screen-saver window level (1000), which sits above normal
windows, the Dock (level ~20), and the menu bar (~24). Verified with native
`kCGWindowLayer` sampling: 46 of 46 samples at level 1000 across three test
flights on both displays.

Each window is click-through with `forward: true`, so clicks fall through to
whatever app is underneath but the page still receives mousemove. plane.html
hit-tests the cursor every frame (a tag sliding out from under a stationary
cursor never fires mouseleave), and flips the window into catch-clicks mode
only while the cursor is over the plane or the tag. macOS never renders a CSS
pointer cursor for a never-focused overlay, so the plane and tag signal
grabbability themselves: a 1.07 scale lift and a deeper shadow.

When the flight ends the windows are destroyed. Between flights there is no
overlay at all.

### Multi-display sync with zero IPC

Every window renders its slice of the same global flight. An undragged flight
needs no per-frame messaging because motion is a pure function of shared
wall-clock flight time: each window computes "given the start time, where is
the plane now" and gets the identical answer. Measured cross-display exit
times came out identical to the millisecond.

Dragging is the exception: while you hold the plane, the window that owns the
drag broadcasts its deviation state to the others. On release the flight clock
is re-seeded to the drop point and the pure function takes over again.

### One tiling-WM war story

AeroSpace adopts every new overlay window onto the focused monitor and snaps
back any app-side `setBounds`. No window style escapes it. The one recipe that
works is moving the window's node with the aerospace CLI after show; the first
diagnosis (canJoinAllSpaces) was wrong. It's all in main.js comments.

## The flight

plane.html is self-contained: the glider is three CSS clip-path faces (two
wings and a keel, no images), the banner is a manila cargo tag towed on a
rope, and five tapered streaks shear off the trailing edge inside the bank
transform so the wake tilts with the plane.

The tag hangs on a rigid-rope pendulum: gravity 670 px/s², air drag 5.0 /s,
rope 64 px, a distance constraint that stops stretch but allows slack, and the
rope bows when slack. The tag weathervanes into its own apparent airflow,
clamped to ±6°. Grabbing the plane freezes the flight clock; release springs
it back at stiffness 55 /s², damping 10 /s. Three grabs per flight, then it
bolts for the exit at four times cruise speed.

None of those constants were derived. They came out of a prototype's feel
sliders, picked by hand, and the code guards them with "don't re-derive"
comments. The whoosh is synthesized live (white noise through a bandpass sweep,
panned across the room) and any audio failure is swallowed; sound can never
break the visual.

Skywriter, the second banner style, lays each letter down as a smoke puff at
the point, and the moment, the plane's tail crosses its x position. Each
puff's lifetime is the remaining flight time, so nothing pops at teardown.

## The poller

Read-only against Jira Data Center: GETs only, PAT as a Bearer header. Four
streams: comments on tickets assigned to you, @mentions anywhere, tickets
newly assigned to you, and tickets reassigned away from you. Reassigned-away
never flies a plane, it only DMs, and it checks who has the ticket now so a
ticket that merely closed doesn't count as taken.

What keeps it quiet:

- First run seeds silently. It records everything it sees and says nothing.
- Dedup state persists to state.json, pruned after 30 days. Unparseable
  timestamps are kept: safer than re-flying.
- More than 3 events in one cycle collapse into a single digest flight.
- Comments older than the 30-minute lookback never fly, so a newly assigned
  ticket's comment backlog can't flood.
- Your own comments are always skipped.
- One cycle never overlaps a slow predecessor.

State advances before output: a failed DM is logged and dropped, never
retried, never re-flown. A plane can't fail. The `comment ~` mention search
degrades gracefully on servers whose text index rejects it.

## The Teams sink

teams.js is a port of Jira-Alerts' cards.py and notifier.py with the identical
six-field payload (ticket, summary, headline, subline, snippet, url) and
verbatim headline wording, so the same Power Automate flow serves both apps.
That's the succession: jiraPlane became the single poller and the old
launchd timer retired.
