import React, { useRef, useState } from 'react';
import {
  FlatList, Modal, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'shell' | 'files' | 'reader' | 'player';
type Skin = 'ink' | 'paper';
type FileKind = 'folder' | 'text' | 'audio';
type ShelfItem = { id: string; parent: string; name: string; kind: FileKind; detail: string; source?: number };

const skins = {
  ink: { bg: '#111316', surface: '#1b1e22', line: '#30343b', text: '#f2f2f2', muted: '#aeb4bd', accent: '#f368aa', button: '#292d33' },
  paper: { bg: '#f5f3ef', surface: '#ffffff', line: '#d9d9d7', text: '#202328', muted: '#626770', accent: '#9e245f', button: '#eae7e4' },
};
type Colors = typeof skins.ink;

const shelf: ShelfItem[] = [
  { id: 'writing', parent: 'root', name: 'Writing', kind: 'folder', detail: '2 texts' },
  { id: 'music', parent: 'root', name: 'Music', kind: 'folder', detail: '2 tracks' },
  { id: 'field', parent: 'writing', name: 'Field Notes.md', kind: 'text', detail: 'Markdown · sample', source: 0 },
  { id: 'small', parent: 'writing', name: 'Small Things.txt', kind: 'text', detail: 'Plain text · sample', source: 1 },
  { id: 'radio', parent: 'music', name: 'Pink Radio.mp3', kind: 'audio', detail: 'Audio placeholder · sample', source: 0 },
  { id: 'loop', parent: 'music', name: 'Night Loop.wav', kind: 'audio', detail: 'Audio placeholder · sample', source: 1 },
];
const documents = [
  { title: 'Field Notes', chapters: [
    ['01 / ARRIVAL', 'A small room can hold a surprising number of beginnings. The desk is clear, the page is open, and nothing needs an account to exist.', 'This page is a reading sample, not a recovered document. It stays inside the app and is never uploaded.', 'A reader ought to make space for the words. Its buttons can leave quietly when they are no longer needed.'],
    ['02 / MOVEMENT', 'A finger across the screen turns the page. A finger down the page follows the words.', 'The interface remembers which chapter is open while you visit another screen, then returns you to it.', 'The point is not to invent more controls. It is to make the few necessary controls behave naturally.'],
    ['03 / RETURN', 'Everything here is deliberately small: a shelf, a reader, a player layout, and a way back.', 'The shell is a doorway, not another room that must be traversed every time.', 'When real files join this experiment, they should enter through one shelf instead of being imported into each viewer separately.'],
  ] },
  { title: 'Small Things', chapters: [
    ['01 / A NOTE', 'A tiny note for a tiny screen.', 'Less decoration. Less wasted space. More room for the thing a person opened the app to see.'],
    ['02 / SPACE', 'A margin should help the eye travel. It should not force the paragraph into a narrow, boxed corridor.', 'This sample can be read without a server, login, or file permission.'],
  ] },
];
const tracks = [
  { title: 'Pink Radio', artist: 'Demonstration queue', length: '3:12', lyrics: 'There are no actual lyrics or audio files in this layout sample.' },
  { title: 'Night Loop', artist: 'Demonstration queue', length: '1:48', lyrics: 'Track selection updates the layout. Playback is intentionally disabled.' },
];
const tabs: { key: Tab; icon: string; title: string }[] = [
  { key: 'shell', icon: '⌂', title: 'Shell' }, { key: 'files', icon: '≡', title: 'Files' },
  { key: 'reader', icon: 'Aa', title: 'Reader' }, { key: 'player', icon: '♫', title: 'Player' },
];
const descriptions: Record<Tab, string> = {
  shell: 'A layout switchboard, not an Android home-screen replacement.',
  files: 'A compact virtual file explorer using bundled demonstration entries.',
  reader: 'A chapter reader with swipe navigation, adjustable type, and a focus mode.',
  player: 'A media-player layout study with a working sample queue and no audio engine.',
};

function Action({ title, onPress, c, selected = false, disabled = false }: { title: string; onPress: () => void; c: Colors; selected?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={[styles.action, { backgroundColor: selected ? c.accent : c.button, opacity: disabled ? 0.45 : 1 }]}>
    <Text style={{ color: selected ? c.bg : c.text, fontSize: 13, fontWeight: '600' }}>{title}</Text>
  </Pressable>;
}
function Label({ children, c, muted = false, size = 14, weight = '400' }: { children: React.ReactNode; c: Colors; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700' }) {
  return <Text style={{ color: muted ? c.muted : c.text, fontSize: size, fontWeight: weight }}>{children}</Text>;
}

function Lab() {
  const [tab, setTab] = useState<Tab>('shell');
  const [skin, setSkin] = useState<Skin>('ink');
  const [dense, setDense] = useState(true);
  const [help, setHelp] = useState(false);
  const [folder, setFolder] = useState('root');
  const [search, setSearch] = useState('');
  const [sortAZ, setSortAZ] = useState(true);
  const [grid, setGrid] = useState(false);
  const [documentIndex, setDocumentIndex] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [focus, setFocus] = useState(false);
  const [showReaderChrome, setShowReaderChrome] = useState(true);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playerPane, setPlayerPane] = useState<'queue' | 'notes'>('queue');
  const touch = useRef({ x: 0, y: 0 });
  const colors = skins[skin];
  const document = documents[documentIndex];
  const currentItems = shelf.filter(item => item.parent === folder && item.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sortAZ ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  const go = (next: Tab) => { setTab(next); setFocus(false); setShowReaderChrome(true); };
  const openItem = (item: ShelfItem) => {
    if (item.kind === 'folder') { setFolder(item.id); setSearch(''); return; }
    if (item.kind === 'text') { setDocumentIndex(item.source || 0); setChapter(0); go('reader'); return; }
    setTrackIndex(item.source || 0); go('player');
  };
  const changeChapter = (delta: number) => setChapter(n => Math.min(Math.max(n + delta, 0), document.chapters.length - 1));
  const navigateSwipe = (event: any) => {
    const p = event.nativeEvent.changedTouches?.[0];
    if (!p) return;
    const dx = p.pageX - touch.current.x;
    const dy = p.pageY - touch.current.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      changeChapter(dx < 0 ? 1 : -1);
      setShowReaderChrome(true);
    }
  };

  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.bg }]}>
    <StatusBar barStyle={skin === 'ink' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
    {(tab !== 'reader' || !focus) && <View style={[styles.header, { borderColor: colors.line }]}>
      <View style={{ flex: 1 }}>
        <Label c={colors} size={21} weight="700">{tab === 'shell' ? 'Layout Lab' : tab === 'files' ? 'Files' : tab === 'reader' ? 'Reader' : 'Media'}</Label>
        <Label c={colors} muted size={11}>NATIVE STUDY · SAMPLE CONTENT</Label>
      </View>
      <Action title="Help" onPress={() => setHelp(true)} c={colors} />
    </View>}

    {tab === 'shell' && <ScrollView style={styles.flex} contentContainerStyle={styles.page}>
      <Label c={colors} size={15}>Four independent layout studies. Everything displayed is sample data.</Label>
      <View style={[styles.line, { borderColor: colors.line, marginVertical: 12 }]} />
      <View style={styles.inline}>
        <Action c={colors} title={skin === 'ink' ? 'Skin: Ink' : 'Skin: Paper'} onPress={() => setSkin(skin === 'ink' ? 'paper' : 'ink')} />
        <Action c={colors} title={dense ? 'Density: Compact' : 'Density: Relaxed'} onPress={() => setDense(!dense)} />
      </View>
      <View style={styles.tileGrid}>{tabs.filter(t => t.key !== 'shell').map(t => <Pressable key={t.key} onPress={() => go(t.key)} accessibilityRole="button"
        style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={{ color: colors.accent, fontSize: 27, fontWeight: '600' }}>{t.icon}</Text>
        <Label c={colors} weight="700" size={17}>{t.title}</Label>
        <Label c={colors} muted size={12}>{descriptions[t.key]}</Label>
      </Pressable>)}</View>
      <Label c={colors} muted size={12}>No login · No backend · No device permissions · No bundled personal files</Label>
    </ScrollView>}

    {tab === 'files' && <View style={styles.flex}>
      <View style={styles.section}>
        <View style={styles.inline}>
          <Action c={colors} title="Shelf" onPress={() => { setFolder('root'); setSearch(''); }} selected={folder === 'root'} />
          {folder !== 'root' && <Label c={colors} size={13}>/ {shelf.find(item => item.id === folder)?.name}</Label>}
        </View>
        <TextInput accessibilityLabel="Filter files" placeholder="Filter sample files…" placeholderTextColor={colors.muted}
          value={search} onChangeText={setSearch} style={[styles.search, { borderColor: colors.line, color: colors.text, backgroundColor: colors.surface }]} />
        <View style={styles.inline}>
          <Action c={colors} title={sortAZ ? 'A–Z' : 'Z–A'} onPress={() => setSortAZ(!sortAZ)} />
          <Action c={colors} title={grid ? 'List' : 'Grid'} onPress={() => setGrid(!grid)} />
          <Label c={colors} muted size={12}>{currentItems.length} items</Label>
        </View>
      </View>
      <FlatList data={currentItems} key={grid ? 'grid' : 'list'} numColumns={grid ? 2 : 1} keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        ListEmptyComponent={<View style={styles.page}><Label c={colors} muted>No matching items.</Label></View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={() => openItem(item)}
          style={[styles.file, { borderColor: colors.line, flex: grid ? 1 : undefined, minHeight: grid ? 106 : dense ? 55 : 74, alignItems: grid ? 'flex-start' : 'center' }, grid ? { flexDirection: 'column' } : null]}>
          <Text style={{ color: colors.accent, fontSize: 20, width: grid ? undefined : 32 }}>{item.kind === 'folder' ? '▣' : item.kind === 'text' ? '≡' : '♫'}</Text>
          <View style={{ flex: 1 }}><Label c={colors} size={14} weight="600">{item.name}</Label><Label c={colors} muted size={11}>{item.detail}</Label></View>
          {!grid && <Label c={colors} muted size={18}>›</Label>}
        </Pressable>} />
      <View style={[styles.footerHint, { borderColor: colors.line }]}><Label c={colors} muted size={11}>Sample shelf only. Device storage is not accessed.</Label></View>
    </View>}

    {tab === 'reader' && <View style={styles.flex}>
      {(!focus || showReaderChrome) && <View style={[styles.readerControls, { borderColor: colors.line }]}>
        <View style={{ flex: 1 }}><Label c={colors} size={15} weight="700">{document.title}</Label><Label c={colors} muted size={11}>{chapter + 1} of {document.chapters.length} · swipe left/right</Label></View>
        <Action c={colors} title="A−" onPress={() => setFontSize(Math.max(fontSize - 2, 14))} />
        <Action c={colors} title="A+" onPress={() => setFontSize(Math.min(fontSize + 2, 28))} />
        <Action c={colors} title={focus ? 'Exit focus' : 'Focus'} onPress={() => { setFocus(!focus); setShowReaderChrome(!focus ? false : true); }} />
      </View>}
      {focus && !showReaderChrome && <Pressable accessibilityRole="button" onPress={() => setShowReaderChrome(true)} style={{ alignSelf: 'flex-end', padding: 12 }}>
        <Label c={colors} muted size={12}>Show controls</Label>
      </Pressable>}
      <ScrollView key={`${documentIndex}-${chapter}`} style={styles.flex} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 23, paddingBottom: 50 }}
        onTouchStart={e => { touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }} onTouchEnd={navigateSwipe}
        onScroll={e => { if (focus && e.nativeEvent.contentOffset.y > 70) setShowReaderChrome(false); }} scrollEventThrottle={100}>
        <Text style={{ color: colors.accent, fontSize: 12, letterSpacing: 1.8, marginBottom: 18 }}>{document.chapters[chapter][0]}</Text>
        {document.chapters[chapter].slice(1).map((paragraph, i) => <Text key={i} selectable style={{ color: colors.text, fontSize, lineHeight: fontSize * 1.57, marginBottom: 24 }}>{paragraph}</Text>)}
        <View style={[styles.line, { borderColor: colors.line }]} />
        <View style={[styles.inline, { justifyContent: 'space-between', marginTop: 16 }]}>
          <Action c={colors} title="← Previous" disabled={chapter === 0} onPress={() => changeChapter(-1)} />
          <Action c={colors} title="Next →" disabled={chapter === document.chapters.length - 1} onPress={() => changeChapter(1)} />
        </View>
      </ScrollView>
    </View>}

    {tab === 'player' && <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.art, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={[styles.record, { borderColor: colors.accent }]}><Text style={{ color: colors.accent, fontSize: 42 }}>♫</Text></View>
        </View>
        <View style={{ marginTop: 20 }}><Label c={colors} size={25} weight="700">{tracks[trackIndex].title}</Label><Label c={colors} muted>{tracks[trackIndex].artist}</Label></View>
        <View style={[styles.progress, { backgroundColor: colors.line, marginTop: 20 }]}><View style={{ height: 3, width: '0%', backgroundColor: colors.accent }} /></View>
        <View style={[styles.inline, { justifyContent: 'space-between', marginTop: 7 }]}><Label c={colors} muted size={11}>0:00</Label><Label c={colors} muted size={11}>{tracks[trackIndex].length}</Label></View>
        <View style={[styles.inline, { justifyContent: 'center', marginTop: 17 }]}>
          <Action c={colors} title="⏮" disabled onPress={() => {}} />
          <Action c={colors} title="Play unavailable" disabled onPress={() => {}} />
          <Action c={colors} title="⏭" disabled onPress={() => {}} />
        </View>
        <Label c={colors} muted size={12}>Layout preview: sample tracks have no audio bytes. Playback is disabled.</Label>
        <View style={[styles.line, { borderColor: colors.line, marginVertical: 15 }]} />
        <View style={styles.inline}><Action c={colors} title="Queue" selected={playerPane === 'queue'} onPress={() => setPlayerPane('queue')} />
          <Action c={colors} title="Notes" selected={playerPane === 'notes'} onPress={() => setPlayerPane('notes')} /></View>
        {playerPane === 'queue' ? tracks.map((track, i) => <Pressable accessibilityRole="button" onPress={() => setTrackIndex(i)} key={track.title}
          style={[styles.track, { borderColor: colors.line }]}><View style={{ flex: 1 }}><Label c={colors} weight={i === trackIndex ? '700' : '400'}>{track.title}</Label><Label c={colors} muted size={11}>{track.artist}</Label></View><Label c={colors} muted size={12}>{track.length}</Label></Pressable>)
          : <View style={{ paddingVertical: 14 }}><Label c={colors}>{tracks[trackIndex].lyrics}</Label></View>}
      </ScrollView>
    </View>}

    {(!focus || tab !== 'reader') && <View style={[styles.nav, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {tabs.map(t => <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => go(t.key)} style={styles.navItem}>
        <Text style={{ color: tab === t.key ? colors.accent : colors.muted, fontSize: 20, fontWeight: '600' }}>{t.icon}</Text>
        <Text style={{ color: tab === t.key ? colors.text : colors.muted, fontSize: 11 }}>{t.title}</Text>
      </Pressable>)}
    </View>}
    <Modal visible={help} transparent animationType="fade" onRequestClose={() => setHelp(false)}>
      <View style={styles.scrim}><View style={[styles.help, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Label c={colors} size={21} weight="700">{tabs.find(t => t.key === tab)?.title} · Help</Label>
        <Text style={{ color: colors.text, marginTop: 12, lineHeight: 21 }}>{descriptions[tab]}</Text>
        <Text style={{ color: colors.muted, marginTop: 12, lineHeight: 20 }}>Try the visible controls. The file shelf, documents, and track queue are bundled demonstration data. Search, sorting, chapter navigation, font size, themes, and queue selection work locally. No files are imported or sent anywhere. Audio playback and Android launcher integration are not implemented.</Text>
        <View style={{ alignItems: 'flex-end', marginTop: 18 }}><Action title="Close" c={colors} onPress={() => setHelp(false)} selected /></View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Lab /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 },
  header: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  page: { padding: 16, gap: 9 },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  action: { minHeight: 40, borderRadius: 8, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center' },
  line: { borderBottomWidth: StyleSheet.hairlineWidth },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 12 },
  tile: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 10, padding: 16, gap: 12, minHeight: 165 },
  section: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  search: { borderWidth: 1, borderRadius: 8, minHeight: 44, paddingHorizontal: 12, fontSize: 14 },
  file: { flexDirection: 'row', gap: 8, paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  footerHint: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  readerControls: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  art: { aspectRatio: 1.35, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  record: { width: 146, height: 146, borderWidth: 13, borderRadius: 90, justifyContent: 'center', alignItems: 'center' },
  progress: { height: 3, borderRadius: 2 },
  track: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nav: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 61, paddingVertical: 5 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 2 },
  scrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#000000aa' },
  help: { borderWidth: 1, borderRadius: 14, padding: 20 },
});