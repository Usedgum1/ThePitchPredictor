(function () {
  const BASE_STYLE_ID = "base-design";

  const CARD_STYLES = Object.freeze({
    [BASE_STYLE_ID]: Object.freeze({
      id: BASE_STYLE_ID,
      label: "BaseDesign",
      className: "card-style-base-design",
      dropRate: 100,
    }),
  });

  function parseDropRate(value) {
    if (typeof value === "string") {
      const ratioMatch = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
      if (ratioMatch) {
        const hit = Number(ratioMatch[1]);
        const outOf = Number(ratioMatch[2]);
        if (Number.isFinite(hit) && Number.isFinite(outOf) && hit > 0 && outOf > 0) {
          return (hit / outOf) * 100;
        }
      }
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  let dropRates = Object.fromEntries(
    Object.values(CARD_STYLES).map(style => [style.id, parseDropRate(style.dropRate)])
  );

  function normalizeStyleId(styleId) {
    const normalized = String(styleId || "").trim().toLowerCase();
    return CARD_STYLES[normalized] ? normalized : BASE_STYLE_ID;
  }

  function getStyle(styleId) {
    return CARD_STYLES[normalizeStyleId(styleId)];
  }

  function getStyleClass(styleId) {
    return getStyle(styleId).className;
  }

  function getDropRates() {
    return { ...dropRates };
  }

  function setDropRates(nextRates = {}) {
    dropRates = Object.fromEntries(
      Object.keys(CARD_STYLES).map(styleId => {
        const weight = parseDropRate(nextRates[styleId] ?? dropRates[styleId] ?? 0);
        return [styleId, weight];
      })
    );
  }

  function chooseStyleId(randomValue = Math.random()) {
    const entries = Object.entries(dropRates)
      .filter(([styleId, weight]) => CARD_STYLES[styleId] && weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!total) return BASE_STYLE_ID;

    let cursor = Math.max(0, Math.min(0.999999999, Number(randomValue) || 0)) * total;
    for (const [styleId, weight] of entries) {
      cursor -= weight;
      if (cursor < 0) return styleId;
    }
    return entries[entries.length - 1]?.[0] || BASE_STYLE_ID;
  }

  function resolveCardStyleId(card = {}) {
    if (typeof card === "string") return normalizeStyleId(card);
    return normalizeStyleId(card._card_style || card.card_style || card.cardStyle);
  }

  function assignCardStyle(card = {}) {
    const explicitStyleId = card._card_style || card.card_style || card.cardStyle;
    return {
      ...card,
      _card_style: explicitStyleId ? resolveCardStyleId(card) : chooseStyleId(),
    };
  }

  window.PitchIQCardStyles = Object.freeze({
    BASE_STYLE_ID,
    CARD_STYLES,
    assignCardStyle,
    chooseStyleId,
    getDropRates,
    getStyle,
    getStyleClass,
    parseDropRate,
    resolveCardStyleId,
    setDropRates,
  });
})();
