// Har rupaye ka hisaab yahan hota hai — quote() aur order create dono isi function ko
// call karte hain, taaki student ko jo total dikhta hai wahi order me bhi lagta hai,
// aur devtools se price badalna possible na ho (client sirf raw counts bhejta hai:
// pdfPages, images, copies, options — paisa hamesha server nikalta hai).

function parsePageCount(range, totalPages) {
  if (!range || !range.trim()) return totalPages;
  const seen = new Set();
  range.split(",").forEach((part) => {
    part = part.trim();
    if (!part) return;
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = Math.max(1, parseInt(rangeMatch[1], 10));
      const b = Math.min(totalPages, parseInt(rangeMatch[2], 10));
      for (let i = a; i <= b; i++) seen.add(i);
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= totalPages) seen.add(n);
    }
  });
  return seen.size || totalPages;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeQuote(body, rates, extrasList, shop) {
  const totalPdfPages = Number(body.pdfPages) || 0;
  const images = Number(body.images) || 0;
  const copies = Math.max(1, Number(body.copies) || 1);
  const printType = body.printType === "color" ? "color" : "bw";
  const sides = body.sides === "double" ? "double" : "single";
  const layout = Math.max(1, Number(body.layout) || 1);
  const paper = body.paper === "a3" ? "a3" : "a4";
  const binding = ["staple", "spiral"].includes(body.binding) ? body.binding : "none";

  const docPages = parsePageCount(body.range, totalPdfPages);
  const pagesAfterLayout = Math.ceil(docPages / layout) || 0;
  const sheets = sides === "double" ? Math.ceil(pagesAfterLayout / 2) : pagesAfterLayout;

  const rateKey =
    printType === "bw"
      ? sides === "double"
        ? "bwDouble"
        : "bwSingle"
      : sides === "double"
      ? "colorDouble"
      : "colorSingle";
  const perSheetRate = Number(rates[rateKey]) || 0;

  let printing = sheets * perSheetRate;
  if (paper === "a3") printing += sheets * (Number(rates.a3Extra) || 0);
  printing += images * (Number(rates.photo) || 0);
  printing *= copies;

  let addons = 0;
  if (binding === "staple") addons += (Number(rates.staple) || 0) * copies;
  if (binding === "spiral") addons += (Number(rates.spiral) || 0) * copies;

  const selectedExtraNames = Array.isArray(body.extras) ? body.extras : [];
  selectedExtraNames.forEach((name) => {
    const found = extrasList.find((e) => e.name === name);
    if (found) addons += Number(found.price) || 0;
  });

  let subtotal = printing + addons;
  const minOrder = Number(rates.minOrder) || 0;
  if (subtotal > 0 && subtotal < minOrder) subtotal = minOrder;

  const discountPct = shop.discountOn ? Number(shop.discountPct) || 0 : 0;
  const discount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discount);

  const advancePct = Number(shop.advancePct) || 50;
  const advance = round2((total * advancePct) / 100);
  const balance = round2(total - advance);

  return {
    docPages,
    sheets,
    images,
    copies,
    printing: round2(printing),
    addons: round2(addons),
    discount,
    discountPct,
    total,
    advance,
    balance,
    job: { printType, sides, paper, layout, binding },
  };
}

module.exports = { computeQuote };
