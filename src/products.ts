export const productMap: Record<string, string> = {
  bandai: 'Desk Mini',
  barents: 'Codec Pro',
  barents_70d: 'Room 70 Dual G2',
  barents_70i: 'Room 70 Panorama',
  barents_70s: 'Room 70 Single G2',
  barents_82i: 'Room Panorama',
  brooklyn: 'Room Bar Pro',
  darling_10_55: 'Board 55',
  darling_10_70: 'Board 70',
  darling_15_55: 'Board 55S',
  darling_15_70: 'Board 70S',
  darling_15_85: 'Board 85S',
  davinci: 'Room Bar',
  felix_55: 'Board Pro 55 G2',
  felix_75: 'Board Pro 75 G2',
  helix_55: 'Board Pro 55',
  helix_75: 'Board Pro 75',
  dx70: 'DX70',
  dx80: 'DX80',
  havella: 'Room Kit Mini',
  hopen: 'Room Kit',
  millennium: 'Codec EQ',
  mx200_g2: 'MX200 G2',
  mx300_g2: 'MX300 G2',
  mx700: 'MX700 (single cam)',
  mx700st: 'MX700 (dual cam)',
  mx800: 'MX800 (single cam)',
  mx800d: 'MX800 Dual',
  mx800st: 'MX800 (dual cam)',
  octavio: 'Desk',
  polaris: 'Desk Pro',
  spitsbergen: 'Room 55',
  svea: 'Codec Plus',
  svea_55d: 'Room 55 Dual',
  svea_70d: 'Room 70 Dual',
  svea_70s: 'Room 70 Single',
  sx10: 'SX10',
  sx20: 'SX20',
  sx80: 'SX80',
  vecchio: 'Navigator'
};

export function getKnownProducts(): Array<{ code: string; label: string }> {
  const list = Object.entries(productMap).map(([code, label]) => ({ code, label }));
  list.sort((a, b) => a.label.localeCompare(b.label));
  return list;
}

export function isKnownInternalCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(productMap, code);
}

export function resolveInternalProductCode(productLabel: string): string | null {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/^cisco\s+|^webex\s+/g, '')
    .replace(/\s+series$/g, '')
    .trim();
  const target = normalize(productLabel);
  for (const [code, label] of Object.entries(productMap)) {
    if (normalize(label) === target) return code;
  }
  for (const [code, label] of Object.entries(productMap)) {
    const norm = normalize(label);
    if (norm.includes(target) || target.includes(norm)) return code;
  }
  return null;
}


