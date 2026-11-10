(function (root) {
  const folderKeywords = {
    "1_Hauslinks": ["Haus", "Gebäude", "Wohnen", "Wohnhaus", "Stadt"],
    "2_Hausrechts": ["Haus", "Gebäude", "Wohnen", "Wohnhaus", "Stadt"],
    "3_Spezialhaus": ["Haus", "Gebäude", "Stadtgebäude", "Sonderbau"],
    "10_Strassen": ["Straße", "Strasse", "Verkehr", "Fahrbahn", "Stadt"],
    "11_Boden": ["Boden", "Untergrund", "Fläche"],
    "12_Wege": ["Weg", "Gehweg", "Fußweg", "Verbindung"],
    "13_Stadtboden": ["Boden", "Pflaster", "Belag", "Untergrund"],
    "14_Brucke": ["Brücke", "Bruecke", "Übergang", "Überführung"],
    "20_Naturdeko": ["Natur", "Pflanze", "Grün", "Garten", "Dekoration"],
    "21_Tiere": ["Tier", "Tiere", "Stadtleben"],
    "22_Infrastruktur": ["Stadtmöbel", "Stadtmobiliar", "Infrastruktur", "Straßenausstattung"],
    "23_Deko": ["Dekoration", "Stadtdeko", "Stadtleben"],
    "24_Friedhof": ["Friedhof", "Grab", "Gedenken"],
    "25_Spielplatz": ["Spielplatz", "Kinder", "Freizeit", "Spielen"],
    "30_Bahnhof": ["Bahnhof", "Bahn", "Zug", "Eisenbahn", "Schiene"],
    "31_Fahrzeug": ["Fahrzeug", "Verkehr", "Straße"],
    "32_Zaune": ["Zaun", "Grenze", "Begrenzung"],
    "40_Wasser": ["Wasser", "Gewässer", "Ufer", "Fluss", "See"],
  };

  const synonyms = {
    A_Gerade: ["gerade", "Weg", "Straße", "Strecke"],
    Andere: ["Wasserfläche", "Gewässer"],
    Asphalt: ["Straße", "Fahrbahn", "Belag"],
    Auffahrt: ["Rampe", "Brücke", "Übergang"],
    Auto: ["PKW", "Kraftfahrzeug", "Fahrzeug"],
    Automat: ["Verkaufsautomat", "Kiosk", "Stadtmöbel"],
    Backstein: ["Ziegel", "Mauerwerk", "Haus"],
    Bahnhof: ["Station", "Zug", "Bahn"],
    Bank: ["Sitzbank", "Sitzgelegenheit", "Stadtmöbel"],
    Baum: ["Bäume", "Pflanze", "Gehölz"],
    Blume: ["Blumen", "Blüte", "Pflanze"],
    Boden: ["Fläche", "Untergrund", "Belag"],
    Bus: ["ÖPNV", "Linienbus", "Fahrzeug"],
    Busch: ["Strauch", "Gehölz", "Pflanze"],
    Dreiviertel: ["drei Viertel", "Wasserfläche", "Ufer"],
    Eck: ["Ecke", "Kurve", "Wegstück"],
    End: ["Ende", "Wegende", "Abschluss"],
    Erde: ["Erdreich", "Naturboden"],
    Fabrik: ["Industrie", "Gewerbe", "Gebäude"],
    Fahrrad: ["Rad", "Velo", "Fahrzeug"],
    flyingbirdcolor: ["Vogel", "Bird", "Taube", "Tier"],
    Gleis: ["Schiene", "Eisenbahn", "Zug"],
    Gleis_Brucke: ["Gleis", "Schiene", "Brücke", "Zug"],
    Grabstein: ["Grab", "Denkmal", "Friedhof"],
    Halb: ["halbe Fläche", "Wasserfläche", "Ufer"],
    Halle: ["Gebäude", "Industrie", "Bahnhof"],
    Haus: ["Gebäude", "Wohnen"],
    Historische: ["historisch", "Altbau", "Gründerzeit", "Gebäude"],
    Hochhaus: ["Wolkenkratzer", "Gebäude", "Wohnen"],
    Hohe: ["hoch", "Brücke", "Überführung"],
    ICE: ["Zug", "Schnellzug", "Hochgeschwindigkeitszug", "Bahn"],
    Kacheln: ["Fliesen", "Platten", "Pflaster"],
    Katze: ["Katzen", "Haustier", "Tier"],
    Laub: ["Blätter", "Herbst", "Pflanze"],
    Mull: ["Müll", "Abfall", "Mülleimer", "Abfalleimer"],
    Oben: ["oben", "Brücke", "Fahrbahn", "Überführung"],
    Pflanzen: ["Pflanze", "Natur", "Grün"],
    Ratte: ["Nager", "Nagetier", "Tier"],
    Reihenhaus: ["Haus", "Wohnhaus", "Wohnen"],
    Rotor: ["Windrad", "Windenergie", "Drehflügel"],
    Sand: ["Sandboden", "Strand", "Untergrund"],
    Schild: ["Verkehrsschild", "Wegweiser", "Beschilderung"],
    Spielplatz: ["Spielgerät", "Kinder", "Freizeit"],
    Stadtdeko: ["Dekoration", "Stadtmöbel", "Stadtleben"],
    Strasse: ["Straße", "Strasse", "Fahrbahn", "Verkehr"],
    Taube: ["Vogel", "Stadttaube", "Tier"],
    Turm: ["Turmgebäude", "Hochbau", "Wahrzeichen"],
    Viertel: ["Viertelfläche", "Wasserfläche", "Ufer"],
    Wiese: ["Gras", "Rasen", "Grünfläche", "Natur"],
    Wohnhaus: ["Haus", "Gebäude", "Wohnen"],
    X_Bahnhof: ["Kreuzung", "Gleis", "Schiene", "Bahnhof"],
    Zaun: ["Begrenzung", "Gartenzaun", "Grundstück"],
    Zebra: ["Zebrastreifen", "Fußgänger", "Überweg", "Straße"],
  };

  function enrichTileTags(category, file, existing = []) {
    const baseName = file.replace(/\.[^.]+$/, "").replace(/_(UNDER|OVER)$/i, "");
    const concept = baseName.replace(/_(?:G_)?\d+$/i, "").replace(/_G$/i, "");
    const tokens = concept.split(/[_\s-]+/).filter((token) => token && !/^(?:A|G)$/i.test(token));
    const candidates = [
      ...existing,
      ...tokens,
      ...(folderKeywords[category] || []),
      ...(synonyms[concept] || []),
    ];
    const seen = new Set();
    return candidates.map((tag) => tag.trim()).filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const api = { enrichTileTags, folderKeywords };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TileKeywords = api;
})(globalThis);
