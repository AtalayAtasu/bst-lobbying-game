# The Lobbying Game

Classroom game for *Business Sustainability Thinking* (Sessions 3–4). Five producers lobby the regulator over how to implement the WEEE Directive: who pays to collect and recycle e-waste. One round: each group takes one position and writes one argument; the instructor, as regulator, decides; the outcome charts show who pays for whose waste.

## Pages

| Address | Who | What |
|---|---|---|
| `/host` | Instructor | Sign in, start a game, move through the phases, decide |
| `/screen?room=CODE` | Projector | Join code and QR, positions board, outcome charts |
| `/play?room=CODE` | One device per group | Profile, position and argument, outcome |

## Running a class (about 15–20 minutes)

1. **Joining**: groups scan the QR code and pick their producer (one device each). If a group switches device, click **Release** in the console.
2. **Briefing** (≈3 min): profiles and the five options.
3. **Take a position** (≈8–10 min): each group picks ONE option and writes a one- or two-sentence argument. Positions are hidden from other groups and can be changed until you close the round.
4. **Regulator deciding**: positions and arguments appear on the projector. You choose the option.
5. **Outcome**: who pays what, whose waste, volume and value, how it unfolded, and optionally five years later (← → to switch).

No points, pacts, news or scores: the decision is yours, and the debrief is about who pays for whose waste. If the network fails, use **Edit** on a group's row to enter its position by hand.

## Cost model (illustrative, editable in the console)

Recycling cost per returned unit = handling + weight × €/kg × toxicity. The total is shared:
A by units sold, B by weight sold, C by weight returned, D each pays its own returns, E consumers pay a flat fee per product and producers lose profit through lower sales (elasticity × fee/price × profit).

**Five years later** (optional): pick a producer that leaves the market. Under A and B it stops paying; under C and D its share becomes orphan waste paid by those still selling, by units sold; under E buyers keep paying.

## Deploy on Render

1. On Render: **New → Blueprint** and select this repository (uses `render.yaml`), or **New → Web Service** with build `npm install`, start `npm start`.
2. Set `HOST_PASSWORD`. The free plan sleeps after 15 idle minutes: open `/host` a few minutes before class.

Game state is kept in memory and in `data/rooms.json`; on the free plan it is lost when the service restarts. Download results from the console after class.

Local run: `npm install && HOST_PASSWORD=secret npm start`, then open http://localhost:3000/host.
