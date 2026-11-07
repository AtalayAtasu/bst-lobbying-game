/* The Lobbying Game — cost model (shared by server and browsers).
   All money in € million per year. Figures are illustrative and editable from the host console. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MODEL = factory();
})(this, function () {

  const DEFAULT_PARAMS = {
    handlingPerUnit: 1.0,        // € per returned unit, any product (collection, sorting)
    costPerKg: 0.5,              // € per kg recycled, before toxicity
    demandElasticity: 1.5,       // used only for the advanced recycling fee
    groups: [
      { id: 1, name: 'Legacy TV', profile: '(Disappearing from the market: Huge volumes sold last 50 years, heavy products, toxic content)',
        unitsSold: 1, price: 300, margin: 0.05, unitsReturned: 6, weightKg: 25, toxicity: 1.8 },
      { id: 2, name: 'New Technology TV', profile: '(High margins, Volumes picking up, low toxic content)',
        unitsSold: 8, price: 600, margin: 0.15, unitsReturned: 1, weightKg: 12, toxicity: 1.0 },
      { id: 3, name: 'Appliances', profile: '(Tight margins, Relatively smaller sales volumes, bulkiest products, Low toxicity)',
        unitsSold: 5, price: 500, margin: 0.05, unitsReturned: 4, weightKg: 50, toxicity: 0.6 },
      { id: 4, name: 'Computer', profile: '(Razor thin margins, stable volumes (commoditized), smaller products, some toxic content)',
        unitsSold: 10, price: 700, margin: 0.03, unitsReturned: 9, weightKg: 8, toxicity: 1.5 },
      { id: 5, name: 'Smart Phones', profile: '(High margins, Volumes high, lighter products, minimal toxic content)',
        unitsSold: 40, price: 600, margin: 0.25, unitsReturned: 30, weightKg: 0.2, toxicity: 1.0 }
    ]
  };

  const RULES = [
    { id: 'A', name: 'Collective, by market share (units)', short: 'Market share (units)',
      how: 'All producers pay into one scheme. The total bill is split by each producer’s share of units sold today.' },
    { id: 'B', name: 'Collective, by market share (weight)', short: 'Market share (weight)',
      how: 'All producers pay into one scheme. The total bill is split by each producer’s share of the weight it sells today.' },
    { id: 'C', name: 'Collective, by return share', short: 'Return share',
      how: 'All producers pay into one scheme. The total bill is split by each producer’s share of the weight coming back as waste.' },
    { id: 'D', name: 'Individual producer responsibility', short: 'Individual',
      how: 'Each producer pays the actual cost of collecting and recycling its own returned products.' },
    { id: 'E', name: 'Advanced recycling fee (consumers pay)', short: 'Consumer fee',
      how: 'Consumers pay the same visible fee on every new product. The fee funds all recycling. Producers lose some sales as prices rise.' }
  ];

  function compute(params) {
    const p = params || DEFAULT_PARAMS, G = p.groups;
    const unitCost = G.map(g => p.handlingPerUnit + g.weightKg * p.costPerKg * g.toxicity);
    const own = G.map((g, i) => g.unitsReturned * unitCost[i]);
    const total = own.reduce((a, b) => a + b, 0);
    const profit = G.map(g => g.unitsSold * g.price * g.margin);
    const revenue = G.map(g => g.unitsSold * g.price);
    const sumUnits = G.reduce((a, g) => a + g.unitsSold, 0);
    const sumSoldWeight = G.reduce((a, g) => a + g.unitsSold * g.weightKg, 0);
    const sumReturnedWeight = G.reduce((a, g) => a + g.unitsReturned * g.weightKg, 0);
    const fee = total / sumUnits; // € per new product under the consumer fee
    const cost = {
      A: G.map(g => total * g.unitsSold / sumUnits),
      B: G.map(g => total * g.unitsSold * g.weightKg / sumSoldWeight),
      C: G.map(g => total * g.unitsReturned * g.weightKg / sumReturnedWeight),
      D: own.slice(),
      // consumers pay the fee; producers lose margin on sales lost to the higher price
      E: G.map((g, i) => p.demandElasticity * (fee / g.price) * profit[i])
    };
    const share = {}, subsidy = {};
    for (const r in cost) {
      share[r] = cost[r].map((c, i) => c / profit[i]);
      subsidy[r] = cost[r].map((c, i) => r === 'E' ? 0 : c - own[i]); // + pays for others' waste, − others pay for yours
    }
    return { groups: G, unitCost, own, total, profit, revenue, fee, cost, share, subsidy,
      soldValue: revenue, returnedWeight: G.map(g => g.unitsReturned * g.weightKg) };
  }

  // "Five years later": one producer has left the market, but its products keep coming back.
  // Sharing by current sales (A, B) no longer charges it. Under return share (C) and individual
  // responsibility (D) the share it can no longer pay becomes orphan waste, split among those
  // still selling by units sold. Under the consumer fee (E) buyers keep paying.
  function fiveYears(params, exitId) {
    const p = JSON.parse(JSON.stringify(params || DEFAULT_PARAMS));
    const ex = p.groups.findIndex(g => g.id === exitId);
    if (ex < 0) return null;
    p.groups[ex].unitsSold = 0;
    const M = compute(p), G = p.groups;
    const sumLive = G.reduce((a, g, i) => a + (i === ex ? 0 : g.unitsSold), 0) || 1;
    const cost = {}, orphan = {};
    for (const r of Object.keys(M.cost)) {
      orphan[r] = (r === 'C' || r === 'D') ? M.cost[r][ex] : 0;
      cost[r] = M.cost[r].map((c, i) => i === ex ? 0 : c + orphan[r] * G[i].unitsSold / sumLive);
    }
    const profit = M.profit;
    const share = {}; for (const r in cost) share[r] = cost[r].map((c, i) => profit[i] ? c / profit[i] : 0);
    return { exited: exitId, exIndex: ex, orphan, cost, share, profit };
  }

  const fmtM = v => '€' + (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en') : v.toFixed(1)) + 'm';
  const fmtPct = v => (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';

  return { DEFAULT_PARAMS, RULES, compute, fmtM, fmtPct,
    fiveYears };
});
