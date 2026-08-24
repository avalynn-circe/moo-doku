import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ANIMAL, MARK, EMPTY, rowOf, colOf, glyphForCell,
         type Cell, type Level, type Named } from '../game/game';
import type { Theme } from './theme';

interface Props {
  level: Level;
  cells: Cell[];
  conflicts: Set<number>;
  cellSize: number;
  named: Named;
  theme: Theme;
  onTap: (i: number) => void;
}

const THICK = 2;
const THIN = 1;   // now the real on-screen widths, not doubled

/**
 * The board.
 *
 * Region edges are drawn thicker than the lines inside a region, so the shapes
 * read even if the colours do not - nine hues is more than colour alone can
 * carry for everyone.
 *
 * Each square draws only its TOP and LEFT edge. Drawing all four meant every
 * line was painted twice, once by each neighbour, so a 2px region edge came
 * out 4px and the whole board looked heavy. The board's own border closes the
 * right and bottom sides.
 */
export function Board({ level, cells, named, conflicts, cellSize, theme, onTap }: Props) {
  const { n, regions } = level;

  const edges = useMemo(() => {
    // for each square, is the neighbour on each side a different region?
    return Array.from({ length: n * n }, (_, i) => {
      const r = rowOf(n, i), c = colOf(n, i);
      const diff = (rr: number, cc: number) =>
        rr < 0 || cc < 0 || rr >= n || cc >= n || regions[rr * n + cc] !== regions[i];
      return {
        top: diff(r - 1, c), bottom: diff(r + 1, c),
        left: diff(r, c - 1), right: diff(r, c + 1),
      };
    });
  }, [n, regions]);

  return (
    <View style={[styles.board, { borderColor: theme.regionBorder }]}>
      {Array.from({ length: n }, (_, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: n }, (_, c) => {
            const i = r * n + c;
            const e = edges[i];
            const state = cells[i];
            const clash = conflicts.has(i);
            return (
              <Pressable
                key={c}
                // onPressIn, NOT onPress. onPress fires on touch RELEASE, so
                // every tap's sound and mark waited for the finger to lift -
                // which reads as lag no matter how fast the audio layer is.
                // Three rounds of audio tuning went by before this was found.
                onPressIn={() => onTap(i)}
                accessibilityRole="button"
                accessibilityLabel={
                  `row ${r + 1} column ${c + 1}, region ${regions[i] + 1}, ` +
                  (state === ANIMAL ? 'animal' : state === MARK ? 'ruled out' : 'empty')
                }
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: theme.regions[regions[i] % theme.regions.length],
                  borderColor: theme.regionBorder,
                  // top and left only - the neighbour on the other side would
                  // otherwise draw the same line again
                  borderTopWidth: r === 0 ? 0 : e.top ? THICK : THIN,
                  borderLeftWidth: c === 0 ? 0 : e.left ? THICK : THIN,
                  borderBottomWidth: 0,
                  borderRightWidth: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {state === ANIMAL && (
                  <Text style={{ fontSize: cellSize * 0.62 }}>
                    {glyphForCell(cells, named, i)}
                  </Text>
                )}
                {state === MARK && (
                  <View style={[styles.mark, {
                    width: cellSize * 0.22,
                    height: cellSize * 0.22,
                    borderRadius: cellSize * 0.11,
                    backgroundColor: theme.regionBorder,
                    opacity: 0.4,
                  }]} />
                )}
                {clash && (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
                    borderWidth: 3, borderColor: theme.bad,
                  }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  mark: {},
});
