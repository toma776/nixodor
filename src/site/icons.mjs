// Iconițele site-ului: un singur set, line style, pe aceeași grilă (24×24, linie 1,8, capete rotunjite).
// Iconițele beneficiilor se aleg din Brain (câmpul „Iconiță” al beneficiului); cheile de aici sunt opțiunile lui.

export const ICONS = {
  // interfață
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16z"/><path d="M4 21c3-6 7-9 12-11"/>',
  lab: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  talk: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',

  // beneficii
  natural: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16z"/><path d="M4 21c3-6 7-9 12-11"/>',                       // frunză
  namol: '<path d="M12 3v7"/><path d="M8.5 6.5 12 10l3.5-3.5"/><path d="M3 15c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M3 19.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/>', // strat care scade
  durata: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2.5"/><path d="M9.5 2.5h5"/><path d="M12 2.5V6"/>',        // cronometru
  descompune: '<path d="M20 11.5A8 8 0 0 0 5.6 6.4"/><path d="M5 2.8v3.9h3.9"/><path d="M4 12.5a8 8 0 0 0 14.4 5.1"/><path d="M19 21.2v-3.9h-3.9"/><circle cx="12" cy="12" r="1.6"/>', // ciclu
  curatenie: '<path d="M12 3.5l1.6 4.3 4.3 1.6-4.3 1.6L12 15.3l-1.6-4.3-4.3-1.6 4.3-1.6z"/><path d="M18.5 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/><path d="M6 15.5l.5 1.3 1.3.5-1.3.5L6 19.1l-.5-1.3-1.3-.5 1.3-.5z"/>', // strălucire
  miros: '<path d="M3 8.5h10.5a2.75 2.75 0 1 0-2.75-2.75"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>',          // aer
  ingrasamant: '<path d="M12 21v-8.5"/><path d="M12 12.5C12 8.4 9.2 5.5 4.5 5.5c0 4.1 2.8 7 7.5 7z"/><path d="M12 15c0-4.1 2.8-7 7.5-7 0 4.1-2.8 7-7.5 7z"/>' // răsad
};

export const BENEFIT_ICONS = ['natural', 'namol', 'durata', 'descompune', 'curatenie', 'miros', 'ingrasamant'];

export const icon = name => ICONS[name]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
  : '';
