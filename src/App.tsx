import React from 'react';
import {
  View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useGame, BANDS } from './state/useGame';
import { Board } from './ui/Board';
import { THEME as theme, BAND_BLURB } from './ui/theme';
import { BUILD } from './build';
import * as Sound from './audio/sounds';

export default function App() {
  const { width, height } = useWindowDimensions();
  const { level, cells, named, clashes, solved, placed, sound, done, leftInBand, actions } =
    useGame();

  // refreshed on every tap so a sound failure shows up in the footer instead
  // of vanishing into a swallowed exception
  const [soundStatus, setSoundStatus] = React.useState('');
  React.useEffect(() => {
    if (!sound) return;
    const t = setInterval(() => setSoundStatus(Sound.status()), 1000);
    return () => clearInterval(t);
  }, [sound]);

  const avail = Math.min(width - 32, height * 0.52, 460);
  const cell = Math.max(26, Math.floor(avail / level.n) - 2);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.ground }]}>
        <StatusBar style="dark" />

        <View style={styles.bar}>
          <View style={styles.mid}>
            <Text style={[styles.title, { color: theme.ink }]}>LoFi MooDoku</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.stage}>
          <Board
            level={level}
            cells={cells}
            conflicts={clashes}
            cellSize={cell}
            named={named}
            theme={theme}
            onTap={actions.tap}
          />

          {/* the board's own label and progress sit with the board, not in the
              header - they describe what is on screen right now, and the
              buttons directly below are what changes them */}
          <Text style={[styles.eyebrow, { color: theme.dim }]}>
            {level.band.toUpperCase()} · {level.n}×{level.n}
          </Text>
          <Text textBreakStrategy="balanced" style={[styles.hint, { color: theme.ink }]}>
            {solved
              ? 'Every row, column and colour has exactly one.'
              : `${placed} of ${level.n} placed${clashes.size ? ' · something clashes' : ''}`}
          </Text>

          <View style={styles.bands}>
            {BANDS.map(b => {
              const here = level.n === b.n;
              const left = leftInBand[b.n] ?? 0;
              const spent = left === 0 && !here;
              return (
                <Pressable
                  key={b.n}
                  onPress={() => actions.chooseBand(b.n)}
                  disabled={spent}
                  accessibilityRole="button"
                  accessibilityState={{ selected: here, disabled: spent }}
                  accessibilityLabel={`${b.band}, ${b.n} by ${b.n}, ${left} left`}
                  style={[styles.bandBtn, {
                    backgroundColor: here ? theme.accent : theme.panel,
                    borderColor: here ? theme.accent : theme.edge,
                    opacity: spent ? 0.4 : 1,
                  }]}
                >
                  <Text style={[styles.bandName, {
                    color: here ? theme.panel : theme.ink,
                    fontWeight: here ? '700' : '500',
                  }]}>
                    {b.band}
                  </Text>
                  <Text style={[styles.bandSize, { color: here ? theme.panel : theme.dim }]}>
                    {b.n}×{b.n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.readout}>
          {placed === 0 && (
            <Text textBreakStrategy="balanced" style={[styles.blurb, { color: theme.dim }]}>
              tap once to rule out · again to place · again to clear
            </Text>
          )}
          <Text textBreakStrategy="balanced" style={[styles.blurb, { color: theme.dim }]}>{BAND_BLURB[level.band]}</Text>
        </View>

        <View style={styles.tools}>
          <Pressable
            onPress={actions.reset}
            style={[styles.pill, { backgroundColor: theme.panel, borderColor: theme.edge }]}
          >
            <Text style={{ color: theme.ink }}>clear board</Text>
          </Pressable>
          <Pressable
            onPress={actions.toggleSound}
            accessibilityRole="switch"
            accessibilityState={{ checked: sound }}
            style={[styles.pill, {
              backgroundColor: sound ? theme.accentWash : theme.panel,
              borderColor: sound ? theme.accent : theme.edge,
            }]}
          >
            <Text style={{ color: sound ? theme.accentInk : theme.dim }}>
              {sound ? 'sound on' : 'sound off'}
            </Text>
          </Pressable>
          {solved && (
            <Pressable
              onPress={actions.next}
              style={[styles.pill, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            >
              <Text style={{ color: theme.panel, fontWeight: '700' }}>next →</Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.stamp, { color: theme.dim }]}>
          {BUILD} · {done.size} solved{sound && soundStatus ? ` · ${soundStatus}` : ''}
        </Text>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  mid: { flex: 1, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textAlign: 'center' },
  bands: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  bandBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', minWidth: 68,
  },
  bandName: { fontSize: 13 },
  bandSize: { fontSize: 11, marginTop: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  pill: {
    minHeight: 36, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  readout: { alignItems: 'center', gap: 4, paddingBottom: 10 },
  hint: { fontSize: 14, textAlign: 'center', paddingHorizontal: 4 },
  blurb: { fontSize: 12, textAlign: 'center', paddingHorizontal: 4, maxWidth: 340 },
  tools: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', paddingBottom: 4 },
  stamp: { fontSize: 12, textAlign: 'center', letterSpacing: 0.4, paddingBottom: 3 },
});
