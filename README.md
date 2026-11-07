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
4. **Take a position** (≈5 min): each group picks an option and writes an argument. Positions stay hidden. Effort committed now counts most.
5. **Negotiate** (≈8 min): positions become public. Groups offer pacts and commit lobbying effort. Rate arguments as they come in. Optionally tick **Show each group its own numbers** and send **Breaking news**.
6. **Final round** (≈4 min): groups confirm their final option.
7. **Regulator deciding**: the tally helps you; you choose. **Outcome** reveals the charts on the projector (← → to switch), including the scoreboard and, if switched on, the five-years-later epilogue.

If the network fails, use **Edit** on a group's row to enter its choices by hand.

## What is new in v2

The mechanics now reward what the Owls paper describes, without ever saying so:

- **Timing.** Lobbying effort (100 points) is committed in irrevocable tranches. Effort committed while positions are being taken counts ×1.5, during negotiation ×1.0, in the final round ×0.6.
- **Knowing your numbers.** A group can commission a cost study for 15 of its points and immediately see its own bill under every option. Other groups don't know it has. (You can still show everyone their numbers from the console.)
- **Arguments count.** You rate each group's argument 0–3★ in the console (×0.85 / ×0.95 / ×1.05 / ×1.15). Groups learn this only at the outcome.
- **News moves the mood.** Prepared news items shift how receptive the regulator is to some options (e.g. a neighbour adopting individual responsibility: D ×1.2). Your own free text is shown but changes nothing. Reset the mood any time.
- **Scoreboard.** At the outcome every group gets a 0–100 result (100 = the option best for it among those on the table) and a rank, on its device and on the projector, with how it lobbied.
- **Epilogue: five years later.** Pick a producer that leaves the market. A new outcome chart shows who ends up paying for its returning products under the chosen rule (orphan waste).

## Tally (decision aid only)

For each commitment: points × timing × coalition bonus (+25% per pact partner on the same final option) × credibility (×0.8 if the group's final option differs from its first position) × argument rating. Each option's total is then multiplied by the public mood.

## Cost model (illustrative, editable in the console)

Recycling cost per returned unit = handling + weight × €/kg × toxicity. Total cost is shared:
A by units sold, B by weight sold, C by weight returned, D each pays its own returns, E consumers pay a flat fee per product and producers lose profit through lower sales (elasticity × fee/price × profit).

## Deploy on Render

1. Put this folder in a GitHub repository.
2. On Render: **New → Blueprint** and select the repository (uses `render.yaml`), or **New → Web Service** with build `npm install`, start `npm start`.
3. Set `HOST_PASSWORD`. The free plan sleeps after 15 idle minutes: open `/host` a few minutes before class.

Game state is kept in memory and in `data/rooms.json`; on the free plan this is lost when the service restarts. Download results from the console (**Download results**) after class.

Local run: `npm install && HOST_PASSWORD=secret npm start`, then open http://localhost:3000/host.
