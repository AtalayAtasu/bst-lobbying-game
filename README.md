# The Lobbying Game

Classroom game for *Business Sustainability Thinking* (Sessions 3–4): five producers lobby a regulator over how to implement the WEEE Directive, that is, who pays to collect and recycle e-waste.

## Pages

| Address | Who | What |
|---|---|---|
| `/host` | Instructor | Sign in, start a game, move through the phases, send news, decide, see the tally |
| `/screen?room=CODE` | Projector | Join code and QR, positions board, outcome charts |
| `/play?room=CODE` | One device per group | Profile, position, pacts, lobbying points, outcome |

## Running a class (about 20 minutes of play)

1. Open `/host`, sign in, **Start a new game**. Open the projector link.
2. **Joining**: groups scan the QR code and pick their group (one device each). A group whose device drops can rejoin on the same device; if it changes device, click **Release** in the console.
3. **Briefing** (≈3 min): profiles and the options on the table.
4. **Take a position** (≈5 min): each group picks an option and writes an argument. Positions stay hidden; timing is recorded.
5. **Negotiate** (≈8 min): positions become public. Groups offer pacts and place 100 lobbying points. Optionally tick **Show each group its own numbers** and send **Breaking news**.
6. **Final round** (≈4 min): groups confirm their final option.
7. **Regulator deciding**: the tally helps you; you choose. **Outcome** reveals four charts on the projector (← → to switch).

If the network fails, use **Edit** on a group's row to enter its choices by hand.

## Tally (decision aid only)

score(option) = Σ groups' points × coalition bonus (+25% per pact partner whose final option is the same) × credibility (×0.8 if the group's final option differs from its first position).

## Cost model (illustrative, editable in the console)

Recycling cost per returned unit = handling + weight × €/kg × toxicity. Total cost is shared:
A by units sold, B by weight sold, C by weight returned, D each pays its own returns, E consumers pay a flat fee per product and producers lose profit through lower sales (elasticity × fee/price × profit).

## Deploy on Render

1. Put this folder in a GitHub repository.
2. On Render: **New → Blueprint** and select the repository (uses `render.yaml`), or **New → Web Service** with build `npm install`, start `npm start`.
3. Set `HOST_PASSWORD`. The free plan sleeps after 15 idle minutes: open `/host` a few minutes before class.

Game state is kept in memory and in `data/rooms.json`; on the free plan this is lost when the service restarts. Download results from the console (**Download results**) after class.

Local run: `npm install && HOST_PASSWORD=secret npm start`, then open http://localhost:3000/host.
