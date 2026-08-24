/**
 * Moodoku's palette. Light only - the board is nine coloured regions and a
 * second set tuned for a dark ground was more surface than it earned.
 *
 * Chrome comes from the Blueberry / Apricot / Citrus / Apple Core family. The
 * nine region colours come from a hill-climb, not from the eye and not from
 * even spacing round the hue circle.
 *
 * What it maximises matters more than that it optimises. Plain CIELAB dE
 * assumes two large patches side by side. A board's regions are neither: a
 * lone square in one corner against a big region in the other loses most of
 * its chroma detail on the way to the eye, and only lightness and coarse hue
 * survive. Under plain dE a salmon and a pink measured a comfortable 24 and
 * still read as the same colour across the board - which is exactly what got
 * reported. So the objective is a small-field distance that weights a* and b*
 * at 0.45 against L*, with plain dE kept as a secondary term.
 *
 * Worst pair, far-viewing: 14.5, up from 9.9 for the previous set. The far
 * metric also caught a peach and a dull yellow sitting at 9.9 that nobody had
 * complained about yet; butter yellow replaced the dull one.
 *
 * Side by side these measure 20.4, slightly BELOW the 21.7 of the set they
 * replace. That is the deliberate trade and not a regression to fix: the
 * board is looked at whole, so the far number is the one that decides whether
 * two regions are tellable apart. Do not re-tune against plain dE.
 *
 * Chroma sits in a narrow band (18 to 31) and lightness stays high (78 to 93)
 * because a wider search produced a more separated palette that read as too
 * saturated for a lofi board - that one measured 17.1 far and was rejected on
 * looks. The floor matters as much as the cap: without one the optimiser
 * discovers that a neutral grey is cheap distance in lightness, and
 * a grey region among pastels reads as a bug rather than a colour.
 *
 * Every region clears 6.4:1 against `ink`, so emoji and outlines stay legible.
 *
 * Colour is still never the only cue - regions are outlined as well, so the
 * board reads without relying on hue at all.
 *
 * `dim` is darker than it looks like it should be on purpose. Small text sits
 * on the board GROUND, not the panel, and the obvious grey measured 3.65:1
 * there - which is why the footer was unreadable. This clears 4.5:1 against
 * the ground, and 5.6:1 against the panel. `faint` is decorative only.
 */
export interface Theme {
  ground: string; ground2: string; panel: string;
  ink: string; dim: string; faint: string;
  line: string; edge: string;
  accent: string; accentInk: string; accentWash: string;
  bad: string; good: string;
  regions: string[];
  regionBorder: string;
}

const REGIONS = [
  '#F4B896', '#F7E4A0', '#B3CA93', '#BBF9CE', '#70D1C9',
  '#AFEBFE', '#AFC1ED', '#FFE5FF', '#F5ADCA',
];

export const THEME: Theme = {
  ground: '#E8DFCE', ground2: '#D8CBB2', panel: '#FBF7F0',
  ink: '#2F3A47', dim: '#586475', faint: '#7C8899',
  line: '#C9B694', edge: '#E0D3B8',
  accent: '#F7882F', accentInk: '#B85708', accentWash: 'rgba(247,136,47,0.14)',
  bad: '#C2410C', good: '#3F7350',
  regions: REGIONS,
  regionBorder: '#5B4C3D',
};

export const BAND_BLURB: Record<string, string> = {
  Gentle: 'Small board. Every step is forced by something obvious.',
  Steady: 'A region trapped in one line starts clearing the rest of it.',
  Tricky: 'Lines and regions begin locking each other out.',
  Thorny: 'Full size. Expect to reason several moves ahead.',
};
